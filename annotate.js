/* course-book · annotate.js — 浏览器内标注层（书桌模式下激活）
 * 划选文字 → 浮动按钮 → 备注框（类型 + 处理方式）；双击段落 → 段落级批注；
 * 练习块「作答」按钮 → 答案标注；右侧面板管理全部备注；
 * 标注锚定采用 W3C TextQuoteSelector（exact + prefix/suffix + 章节内偏移），
 * 经 POST /annotations 落盘，由 AI 侧「处理书稿备注」流程消化。
 * file:// 打开时自动休眠（fetch 失败即 inert，不影响阅读与打印）。
 */
(() => {
  if (window.__courseBookAnno) return;
  window.__courseBookAnno = true;

  /* 全局错误自报：标注层任何炸裂都可见，绝不无声 */
  let errOnce = false;
  window.addEventListener("error", (e) => {
    if (errOnce) return; errOnce = true;
    try {
      const t = document.createElement("div");
      t.className = "cb-toast show";
      t.style.cssText = "position:fixed;left:50%;bottom:4.4rem;transform:translateX(-50%);z-index:130;background:#a03b2a;color:#fff;font:600 13px/1.4 sans-serif;padding:.7rem 1.1rem;border-radius:8px;max-width:80vw";
      t.textContent = "⚠ 标注层报错：" + (e.message || "unknown") + "（详情见控制台，请发给老师）";
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 6000);
    } catch {}
  });

  const TYPES = {
    question:  { icon: "❓", label: "疑问",   color: "#b0541f" },
    suggest:   { icon: "✏️", label: "修改建议", color: "#3d5a73" },
    bug:       { icon: "🐛", label: "错误报告", color: "#a03b2a" },
    discuss:   { icon: "💬", label: "讨论",   color: "#8a8272" },
    answer:    { icon: "✍️", label: "作答",   color: "#3f7a3f" },
  };
  const DISPOS = {
    sidebar: "进书 · 读者问答（默认）",
    rewrite: "进书 · 改写正文",
    chat:    "只聊 · 不改书",
  };
  const PRIORITY = { bug: 0, question: 1, answer: 2, suggest: 3, discuss: 4 };

  const state = { items: [], dialogOpen: false, stamp: 0 };

  /* ---------- 轻提示 toast ---------- */
  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "cb-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl?.classList.remove("show"), 2600);
  }

  /* ---------- 工具 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (iso) => new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* ---------- API ---------- */
  async function loadAll() {
    const r = await fetch("/annotations");
    if (!r.ok) throw new Error(r.status);
    state.items = await r.json();
  }
  async function save(item) {
    const r = await fetch("/annotations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item),
    });
    if (!r.ok) throw new Error(r.status);
    const saved = await r.json();
    const i = state.items.findIndex((x) => x.id === saved.id);
    i >= 0 ? (state.items[i] = saved) : state.items.push(saved);
    return saved;
  }

  /* ---------- 锚点：构建与查找（W3C TextQuoteSelector 风格） ---------- */
  // 章节文本地图：把 section.chapter 内所有文本节点拉平成全文 + 位置索引
  function textMap(chapter) {
    const nodes = [];
    const index = new Map();
    const walker = document.createTreeWalker(chapter, NodeFilter.SHOW_TEXT);
    let n, text = "";
    while ((n = walker.nextNode())) {
      index.set(n, text.length);
      nodes.push({ node: n, start: text.length });
      text += n.nodeValue;
    }
    return { nodes, index, text, end: text.length };
  }
  // range 端点→章节全文偏移：探针 range 从章节起点重到目标端点，
  // 其 toString 长度即偏移（文本/元素容器同构可靠，不依赖 TreeWalker 根语义）
  function endPointOffset(container, offset, chapter) {
    const probe = document.createRange();
    probe.setStart(chapter, 0);
    if (container.nodeType === Node.TEXT_NODE) {
      probe.setEnd(container, Math.min(offset, container.nodeValue.length));
    } else {
      probe.setEnd(container, Math.min(offset, container.childNodes.length));
    }
    return probe.toString().length;
  }
  function buildAnchor(range, chapter) {
    const map = textMap(chapter);
    const exact = range.toString();
    if (!exact.trim()) return null;
    // range 在章节全文中的起止（文本/元素容器均兼容）
    const start = endPointOffset(range.startContainer, range.startOffset, chapter);
    const end = endPointOffset(range.endContainer, range.endOffset, chapter);
    if (start < 0 || end < start || end > map.text.length) return null;
    if (map.text.slice(start, end) !== exact) return null; // 安全网
    const prefix = map.text.slice(Math.max(0, start - 32), start);
    const suffix = map.text.slice(end, end + 32);
    return {
      mode: "quote", exact, prefix, suffix,
      start, end, chapterTextLen: map.text.length,
    };
  }
  // 改写后重新定位：先 exact+prefix 精确匹配，退化为偏移，再退化为 fuzzy（去空白匹配）
  function findRange(item, chapter) {
    const map = textMap(chapter);
    const a = item.anchor;
    let idx = -1;
    const strict = a.prefix + a.exact;
    const at = map.text.indexOf(strict);
    if (at >= 0) idx = at + a.prefix.length;
    if (idx < 0) { // 偏移兜底（同章长度未剧变时）
      if (a.start != null && a.end <= map.text.length && map.text.slice(a.start, a.end) === a.exact) idx = a.start;
    }
    if (idx < 0) { // fuzzy：压缩空白后匹配
      const norm = (s) => s.replace(/\s+/g, "");
      const ne = norm(a.exact);
      let i = 0; const hits = [];
      while (i < map.text.length && hits.length < 5) {
        const j = norm(map.text.slice(i, i + ne.length + 40)).indexOf(ne);
        if (j < 0) break;
        i += Math.max(1, j); hits.push(i);
      }
      if (hits.length === 1) idx = hits[0];
    }
    if (idx < 0) return null;
    return offsetsToRange(map, idx, idx + a.exact.length);
  }
  function offsetsToRange(map, start, end) {
    const r = document.createRange();
    let s = null, e = null;
    for (const { node, start: ns } of map.nodes) {
      const len = node.nodeValue.length;
      if (s === null && start < ns + len) s = { node, off: start - ns };
      if (end <= ns + len) { e = { node, off: end - ns }; break; }
    }
    if (!s || !e) return null;
    r.setStart(s.node, Math.max(0, s.off));
    r.setEnd(e.node, Math.min(e.node.length, e.off));
    return r;
  }

  /* ---------- 高亮渲染 ---------- */
  function clearMarks() {
    document.querySelectorAll("mark.cb-anno").forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.normalize(); m.remove();
    });
  }
  function highlight(item, range) {
    // 跨元素选择：把相交的每个文本节点片段各自包一个 mark（共享 data-id）
    const map = (() => { // 局部：range 覆盖的文本节点
      const arr = []; const w = document.createTreeWalker(range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) if (range.intersectsNode(n)) arr.push(n);
      return arr;
    })();
    const t = TYPES[item.type] || TYPES.discuss;
    for (const node of map) {
      let s = 0, e = node.nodeValue.length;
      if (node === range.startContainer) s = range.startOffset;
      if (node === range.endContainer) e = range.endOffset;
      if (e <= s) continue;
      const mark = document.createElement("mark");
      mark.className = "cb-anno" + (item.status === "resolved" ? " resolved" : "");
      mark.dataset.id = item.id;
      mark.style.setProperty("--anno-color", t.color);
      node.splitText(e); const mid = node.splitText(s);
      mid.parentNode.insertBefore(mark, mid);
      mark.appendChild(mid);
      mark.addEventListener("click", () => openDialog(item, null));
    }
  }
  function render() {
    clearMarks();
    let lost = 0;
    for (const item of state.items) {
      if (item.status === "archived") continue; // 已吸收进正文：退役，不再渲染
      const ch = document.getElementById(item.chapter);
      if (!ch) { lost++; continue; }
      const range = item.anchor?.mode === "quote" && findRange(item, ch);
      if (!range) { lost++; badgeLost(item, ch); continue; }
      highlight(item, range);
    }
    renderPanel();
    return lost;
  }
  function badgeLost(item, chapter) {
    const host = chapter.querySelector(".chapter-opener") || chapter;
    if (host.querySelector(`.cb-lost[data-id="${item.id}"]`)) return;
    const b = document.createElement("span");
    b.className = "cb-lost"; b.dataset.id = item.id;
    b.textContent = `⚓ 锚点失效：${TYPES[item.type]?.icon ?? ""}${(item.note || "").slice(0, 24)}…`;
    b.addEventListener("click", () => openDialog(item, null));
    host.appendChild(b);
  }

  /* ---------- 浮动按钮 + 备注框 ---------- */
  let floatBtn = null;
  function hideFloat() { floatBtn?.remove(); floatBtn = null; }
  function showFloat(x, y, type) {
    hideFloat();
    floatBtn = document.createElement("button");
    floatBtn.className = "cb-float";
    const t = TYPES[type];
    floatBtn.innerHTML = `${t.icon} ${t.label === "作答" ? "作答" : "备注"}`;
    floatBtn.style.left = Math.min(x, innerWidth - 130) + "px";
    floatBtn.style.top = Math.max(8, y - 44) + "px";
    floatBtn.addEventListener("mousedown", (ev) => ev.preventDefault()); // 保住选区
    floatBtn.addEventListener("click", () => { hideFloat(); dialogFromSelection(type); });
    document.body.appendChild(floatBtn);
  }
  let pending = null; // {type, range, chapter, exercise?}
  function dialogFromSelection(type) {
    try {
      const sel = getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const chapter = range.startContainer.parentElement?.closest("section.chapter");
      if (!chapter) return;
      const anchor = buildAnchor(range, chapter);
      if (!anchor) { toast("⚠ 锚点构建失败，请重选一段文字再试"); return; }
      openDialog({ type, disposition: type === "answer" ? "answer" : "sidebar", chapter: chapter.id, anchor, note: "", exercise: exerciseIdOf(range) }, null);
    } catch (err) {
      console.error("[course-book] dialogFromSelection:", err);
      toast("⚠ 弹窗失败：" + err.message + "（请把控制台报错发给老师）");
    }
  }
  function exerciseIdOf(range) {
    const el = range.startContainer.parentElement?.closest(".exercise");
    if (!el) return null;
    const head = el.querySelector(".ex-head")?.textContent.match(/练习\s*[\d-]+[A-Z]/)?.[0];
    return head || null;
  }
  function dialogFromElement(el, type) { // 双击段落 / 练习作答
    try {
      const chapter = el.closest("section.chapter");
      if (!chapter) return;
      const r = document.createRange(); r.selectNodeContents(el);
      const anchor = buildAnchor(r, chapter);
      if (!anchor) { toast("⚠ 锚点构建失败（该元素无文本？），请改用划选文字备注"); return; }
      const isEx = el.classList.contains("exercise");
      openDialog({
        type: isEx ? "answer" : type || "question",
        disposition: isEx ? "answer" : "sidebar",
        chapter: chapter.id, anchor,
        note: "", exercise: isEx ? (el.querySelector(".ex-head")?.textContent.match(/练习\s*[\d-]+[A-Z]/)?.[0] || null) : null,
      }, null);
    } catch (err) {
      console.error("[course-book] dialogFromElement:", err);
      toast("⚠ 弹窗失败：" + err.message + "（请把控制台报错发给老师）");
    }
  }

  const dlg = document.createElement("div");
  dlg.className = "cb-dialog"; dlg.style.display = "none";
  dlg.innerHTML = `
    <div class="cb-card">
      <p class="cb-quote"></p>
      <div class="cb-types"></div>
      <textarea class="cb-note" placeholder="写下你的备注：不懂的地方提问；或直接写「重写：…」「改为：…」等明确指令，AI 将照做"></textarea>
      <div class="cb-dispo">
        <span class="cb-lbl">处理方式</span>
        <select class="cb-dispo-sel">
          <option value="sidebar">进书 · 读者问答（默认）</option>
          <option value="rewrite">进书 · 改写正文</option>
          <option value="chat">只聊 · 不改书</option>
        </select>
      </div>
      <p class="cb-hint"></p>
      <div class="cb-actions">
        <button class="cb-btn ghost cb-cancel">取消 (Esc)</button>
        <button class="cb-btn primary cb-ok">保存 (⌘↵)</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const q = (s) => dlg.querySelector(s);
  q(".cb-types").innerHTML = Object.entries(TYPES)
    .filter(([k]) => k !== "answer")
    .map(([k, t]) => `<button type="button" data-t="${k}" class="cb-type">${t.icon} ${t.label}</button>`).join("");
  function setType(t) {
    pending = { ...pending, type: t };
    q(".cb-types").querySelectorAll(".cb-type").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    q(".cb-dispo").style.display = t === "answer" ? "none" : "";
    q(".cb-hint").textContent = t === "answer" ? "作答由 AI 批改后补入书中答案栏" : "";
  }
  q(".cb-types").addEventListener("click", (e) => { const b = e.target.closest(".cb-type"); if (b) setType(b.dataset.t); });
  function openDialog(item, _patch) {
    state.dialogOpen = true;
    pending = { ...item };
    q(".cb-quote").textContent = item.anchor?.mode === "quote" ? `「${item.anchor.exact.slice(0, 90)}${item.anchor.exact.length > 90 ? "…" : ""}」` : "";
    q(".cb-note").value = item.note || "";
    q(".cb-dispo-sel").value = item.disposition === "answer" ? "sidebar" : item.disposition;
    q(".cb-dispo-sel").style.display = item.type === "answer" ? "none" : "";
    q(".cb-dispo").style.display = item.type === "answer" ? "none" : "";
    setType(item.type);
    dlg.style.display = "";
    q(".cb-note").focus();
    if (_patch) { // 已有备注：补出「标记解决」
      if (!q(".cb-resolve")) {
        const rb = document.createElement("button");
        rb.className = "cb-btn ghost cb-resolve"; rb.textContent = "标记已解决";
        q(".cb-actions").insertBefore(rb, q(".cb-ok"));
        rb.addEventListener("click", async () => {
          await save({ ...item, note: q(".cb-note").value, status: "resolved" });
          closeDialog(); render();
        });
      }
    }
  }
  function closeDialog() { state.dialogOpen = false; dlg.style.display = "none"; dlg.querySelector(".cb-resolve")?.remove(); }
  q(".cb-cancel").addEventListener("click", closeDialog);
  q(".cb-ok").addEventListener("click", submit);
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDialog();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  });
  async function submit() {
    if (!pending) return;
    const note = q(".cb-note").value.trim();
    if (!note) { q(".cb-note").focus(); return; }
    const item = {
      ...pending,
      note,
      disposition: pending.type === "answer" ? "answer" : q(".cb-dispo-sel").value,
      status: "open",
      created: new Date().toISOString(),
    };
    await save(item);
    closeDialog(); render(); flash(item.id);
  }

  /* ---------- 选区交互 ---------- */
  document.addEventListener("mouseup", (e) => {
    if (dlg.style.display !== "none" || e.target?.closest?.(".cb-panel,.cb-dialog,.cb-float")) return;
    setTimeout(() => {
      const sel = getSelection();
      const txt = sel?.toString().trim();
      if (!txt || txt.length < 2 || !sel.rangeCount) return hideFloat();
      const r = sel.getRangeAt(0);
      if (!r.startContainer.parentElement?.closest("section.chapter")) {
        hideFloat();
        if (e.target.closest?.("section.cover, nav.toc"))
          toast("此处是封面/目录，暂不支持备注——到章节正文划选文字或双击段落");
        return;
      }
      const rect = r.getBoundingClientRect();
      showFloat(e.clientX, rect.top + scrollY, "question");
    }, 10);
  });
  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest("p,li,h2,h3,.abstract,td,dd,figcaption,pre");
    if (!el || !el.closest("section.chapter")) return;
    dialogFromElement(el, "question");
  });

  /* ---------- 右侧面板 ---------- */
  const panel = document.createElement("aside");
  panel.className = "cb-panel";
  panel.innerHTML = `
    <button class="cb-toggle" title="备注面板">🗒 <span class="cb-count"></span></button>
    <div class="cb-body">
      <div class="cb-head"><strong>书稿备注</strong><span class="cb-sum"></span></div>
      <div class="cb-filter"></div>
      <ol class="cb-list"></ol>
    </div>`;
  document.body.appendChild(panel);
  panel.querySelector(".cb-toggle").addEventListener("click", () => panel.classList.toggle("open"));
  function renderPanel() {
    const open = state.items.filter((i) => i.status === "open");
    const visible = state.items.filter((i) => i.status !== "archived");
    const archived = state.items.length - visible.length;
    panel.querySelector(".cb-count").textContent = open.length || "";
    panel.querySelector(".cb-count").classList.toggle("any", open.length > 0);
    panel.querySelector(".cb-sum").textContent = open.length ? `${open.length} 待处理 · ${visible.length - open.length} 已解决` + (archived ? ` · 归档 ${archived}` : "") : visible.length ? "全部已解决 🎉" + (archived ? ` · 归档 ${archived}` : "") : "尚无备注";
    const list = panel.querySelector(".cb-list");
    list.innerHTML = [...visible]
      .sort((a, b) => (a.status === b.status ? (PRIORITY[a.type] ?? 9) - (PRIORITY[b.type] ?? 9) : a.status === "open" ? -1 : 1))
      .map((i) => {
        const t = TYPES[i.type] || TYPES.discuss;
        const res = i.status === "resolved" && i.resolution ? `<p class="cb-res">✅ ${esc(i.resolution.summary || "")}</p>` : "";
        const dispo = i.type === "answer" ? "作答" : (DISPOS[i.disposition] || "").split("（")[0];
        return `<li class="${i.status}" data-id="${i.id}" style="--anno-color:${t.color}">
          <p class="cb-li-head">${t.icon} ${t.label}<span class="cb-li-dispo">${dispo}</span><span class="cb-li-time">${fmtTime(i.created)}</span></p>
          <p class="cb-li-note">${esc((i.note || "").slice(0, 140))}${(i.note || "").length > 140 ? "…" : ""}</p>
          ${res}
        </li>`;
      }).join("");
    list.querySelectorAll("li").forEach((li) =>
      li.addEventListener("click", () => { flash(li.dataset.id); const it = state.items.find((x) => x.id === li.dataset.id); if (it) openDialog(it, true); }));
  }
  function flash(id) {
    const m = document.querySelector(`mark.cb-anno[data-id="${id}"]`);
    if (!m) return;
    m.scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelectorAll(".cb-flash").forEach((x) => x.classList.remove("cb-flash"));
    m.classList.add("cb-flash");
    setTimeout(() => m.classList.remove("cb-flash"), 1600);
  }

  /* ---------- 练习块作答按钮 ---------- */
  function injectAnswerButtons() {
    document.querySelectorAll(".exercise").forEach((ex) => {
      if (ex.querySelector(".cb-answer-btn")) return;
      const b = document.createElement("button");
      b.className = "cb-answer-btn"; b.textContent = "✍️ 在此作答";
      b.addEventListener("click", () => dialogFromElement(ex, "answer"));
      ex.appendChild(b);
    });
  }

  /* ---------- 代码块一键复制（全书所有 pre，file:// 亦有回退） ---------- */
  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); return true; }
    catch {
      const ta = document.createElement("textarea");
      ta.value = s; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { return document.execCommand("copy"); } catch { return false; } finally { ta.remove(); }
    }
  }
  document.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".cb-copy-btn")) return;
    const code = pre.innerText;               // 注入按钮前先存纯代码文本
    const btn = document.createElement("button");
    btn.className = "cb-copy-btn"; btn.type = "button"; btn.textContent = "复制";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const okFlag = await copyText(code);
      btn.textContent = okFlag ? "已复制 ✓" : "复制失败";
      btn.classList.add("ok");
      setTimeout(() => { btn.textContent = "复制"; btn.classList.remove("ok"); }, 1500);
    });
    pre.appendChild(btn);
  });

  /* ---------- 热刷新：记住滚动位置 ---------- */
  try {
    const saved = parseInt(sessionStorage.getItem("cb-scroll") || "", 10);
    if (saved > 0) setTimeout(() => scrollTo(0, saved), 60);
  } catch { /* 无 sessionStorage 则跳过 */ }

  /* ---------- 左侧目录：滚动高亮当前章 ---------- */
  const bookNav = document.querySelector(".book-nav ol");
  if (bookNav) {
    const links = [...bookNav.querySelectorAll("a")];
    const marks = links
      .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
      .filter(Boolean);
    let ticking = false;
    const spy = () => {
      ticking = false;
      const probe = scrollY + innerHeight * 0.3;
      let cur = -1;
      marks.forEach((el, i) => { if (el.offsetTop <= probe) cur = i; });
      links.forEach((a, i) => a.classList.toggle("on", i === cur));
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    spy();
    // 目录开关：窄屏作为覆盖层呼出，宽屏亦可手动开关
    const navBtn = document.createElement("button");
    navBtn.className = "cb-nav-toggle"; navBtn.textContent = "📑 目录"; navBtn.title = "章节目录";
    navBtn.addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("nav-open"); });
    document.body.appendChild(navBtn);
    document.addEventListener("click", (e) => {
      if (document.body.classList.contains("nav-open") && !e.target?.closest?.(".book-nav, .cb-nav-toggle"))
        document.body.classList.remove("nav-open");
    });
    bookNav.addEventListener("click", (e) => {
      if (!matchMedia("(min-width: 1100px)").matches && e.target?.closest?.("a"))
        document.body.classList.remove("nav-open");
    });
  }

  /* ---------- 热刷新轮询 ---------- */
  setInterval(async () => {
    if (state.dialogOpen) return;
    try {
      const r = await fetch(`/poll?stamp=${state.stamp}`);
      const j = await r.json();
      if (state.stamp && j.stamp > state.stamp) {
        try { sessionStorage.setItem("cb-scroll", String(Math.round(scrollY))); } catch {}
        location.reload();
      }
      state.stamp = j.stamp;
    } catch { /* 书桌离线则静默 */ }
  }, 2000);

  /* ---------- 启动 ---------- */
  (async () => {
    try {
      await loadAll();
      const r = await fetch("/poll"); state.stamp = (await r.json()).stamp;
      const lost = render();
      injectAnswerButtons();
      if (state.items.some((i) => i.status === "open")) panel.classList.add("open");
      if (lost) console.info(`[course-book] ${lost} 条备注锚点退化（改写后失锚），已显示章节级提示`);
      console.info("[course-book] annotate layer v0.3 booted（改动后请跑 selftest.mjs 回归）");
    } catch (err) {
      console.error("[course-book] boot:", err);
      /* 书桌离线则静默休眠；在线但启动失败要说话 */
      try { await fetch("/poll"); toast("⚠ 标注层启动失败：" + err.message); } catch { /* file:// 休眠 */ }
    }
  })();
})();
