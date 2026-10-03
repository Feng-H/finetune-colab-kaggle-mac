
// ==========================================================================
// 实体书真·A4 流式拆页与代码防跨页保护引擎 (True A4 Reflow & Anti-Split Engine)
// ==========================================
(function() {
  const MAX_A4_BODY_HEIGHT = 970; // A4 净版心可用像素高度 (1123px - 页眉28px - 页脚25px - 留白)
  let a4Pages = [];
  let currentPageIdx = 0;
  let idToPage = {}; // 锚点 id → { idx, el } 精准翻页索引
  let isPagedMode = localStorage.getItem('course_book_paged_mode') !== 'false';

  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const pageInfo = document.getElementById('pageInfo');
  const modeBtn = document.getElementById('modeToggleBtn');
  const bookContainer = document.querySelector('.book');

  // 创建一个空白的标准 A4 纸张 DOM
  function createA4PageDOM(pageNum, moduleName, chapterTitle) {
    const page = document.createElement('div');
    page.className = `a4-page ${pageNum % 2 === 0 ? 'even-page' : 'odd-page'}`;
    page.dataset.pageNum = pageNum;

    // 页眉 (Running Header：单行精炼版)
    // 模块名精炼：若带冒号，截取前半部分作为短模块名 (例如: 模块 5 · 上量部署)
    let shortModule = moduleName || '随课生长深度实战';
    if (shortModule.includes('：')) shortModule = shortModule.split('：')[0].trim();
    else if (shortModule.includes(':')) shortModule = shortModule.split(':')[0].trim();

    const header = document.createElement('header');
    header.className = 'a4-header';
    header.innerHTML = `
      <span class="hdr-left"><span class="hdr-module">${shortModule}</span><span class="hdr-sep">&bull;</span><span class="hdr-chapter">${chapterTitle || ''}</span></span>
      <span class="hdr-right">随课生长实战系列 · Feng-H</span>
    `;

    // 净版心内容区
    const body = document.createElement('div');
    body.className = 'a4-body';

    // 页脚 (Running Footer)
    const footer = document.createElement('footer');
    footer.className = 'a4-footer';
    footer.innerHTML = `
      <span class="ftr-left">通过 Google Colab / Kaggle 学习模型微调</span>
      <span class="ftr-page-num">— 第 ${pageNum} 页 —</span>
      <span class="ftr-right">Feng-H 著</span>
    `;

    page.appendChild(header);
    page.appendChild(body);
    page.appendChild(footer);
    return { page, body };
  }

  // 登记一张新 A4 纸到全局页册
  function registerPage(page, body, pageNum, title, chapterId) {
    bookContainer.appendChild(page);
    a4Pages.push({ element: page, body, pageNum, title, chapterId: chapterId || '' });
  }

  // =========================================================================
  // 目录 (TOC) 多页流式装订：目录条目远超一张 A4，必须按模块块拆页，
  // 否则 .a4-page 的 overflow:hidden 会把后半目录物理裁掉（目录不全）。
  // =========================================================================
  function paginateToc(tocSection, state) {
    const src = tocSection.querySelector('.toc-full');
    if (!src) return false;

    const heading = src.querySelector(':scope > .toc-heading');
    const modules = Array.from(src.querySelectorAll(':scope > .toc-module-list > .toc-module'));

    // 每页一张目录卡片壳（保留 .toc-full 版式），内部按模块流式填充
    const newTocShell = (withHeading) => {
      const shell = document.createElement('nav');
      shell.className = 'toc-full toc-paged';
      shell.style.margin = '0';
      if (withHeading && heading) shell.appendChild(heading.cloneNode(true));
      const list = document.createElement('ol');
      list.className = 'toc-module-list';
      shell.appendChild(list);
      return { shell, list };
    };

    let { page, body } = createA4PageDOM(state.num, '', '全书目录 · Contents');
    let shell = newTocShell(true);
    body.appendChild(shell.shell);
    registerPage(page, body, state.num, '全书目录');
    state.num++;

    const overflow = (b) => b.scrollHeight > MAX_A4_BODY_HEIGHT;

    const openContinuation = (modHeaderClone) => {
      // 新开一页目录，并生成「模块标题（续）」骨架
      const created = createA4PageDOM(state.num, '', '全书目录 · Contents');
      page = created.page; body = created.body;
      const s = newTocShell(false);
      if (modHeaderClone) {
        const li = document.createElement('li');
        li.className = 'toc-module';
        const hdr = modHeaderClone.cloneNode(true);
        hdr.textContent += '（续）';
        li.appendChild(hdr);
        const cl = document.createElement('ol');
        cl.className = 'toc-chapter-list';
        li.appendChild(cl);
        s.list.appendChild(li);
        shell = { shell: s.shell, list: s.list, contList: cl };
      } else {
        shell = { shell: s.shell, list: s.list, contList: null };
      }
      body.appendChild(shell.shell);
      registerPage(page, body, state.num, '全书目录');
      state.num++;
      return shell;
    };

    modules.forEach(mod => {
      const modHeader = mod.querySelector(':scope > .toc-module-header');
      const chapterLis = Array.from(mod.querySelectorAll(':scope > .toc-chapter-list > .toc-chapter'));

      // 常规路径：整块模块放入当前页
      const modClone = mod.cloneNode(true);
      shell.list.appendChild(modClone);
      if (!overflow(body)) return;

      // 放不下：回滚，改为按章条目粒度拆分
      shell.list.removeChild(modClone);
      let cur = openContinuation(modHeader);
      let contList = cur.contList;

      chapterLis.forEach(chLi => {
        contList.appendChild(chLi.cloneNode(true));
        if (overflow(body)) {
          contList.removeChild(contList.lastChild);
          cur = openContinuation(modHeader);
          contList = cur.contList;
          contList.appendChild(chLi.cloneNode(true));
        }
      });
    });

    // 隐藏原始目录区（已拆入多张 A4）
    tocSection.style.display = 'none';
    return true;
  }

  // 核心拆页排版主程序
  function reflowBookIntoA4() {
    const rawChapters = Array.from(document.querySelectorAll('.chapter'));

    // 如果已经拆过，不再重复拆
    if (document.querySelectorAll('.a4-page').length > 0) return;

    let globalPageNum = 1;
    const state = { get num() { return globalPageNum; }, set num(v) { globalPageNum = v; } };
    a4Pages = [];

    // 1. 封面/扉页/目录：扉页单页专属；目录走多页流式装订
    const fronts = Array.from(document.querySelectorAll('.cover, .front-matter'));
    fronts.forEach(c => {
      if (paginateToc(c, state)) return; // 目录已单独装订

      const a4 = document.createElement('div');
      a4.className = `a4-page ${globalPageNum % 2 === 0 ? 'even-page' : 'odd-page'} front-a4-page`;
      a4.dataset.pageNum = globalPageNum;

      // 封面/扉页内嵌原始内容
      const cloned = c.cloneNode(true);
      cloned.style.display = 'block';
      cloned.style.margin = '0';
      cloned.style.border = 'none';
      cloned.style.boxShadow = 'none';
      cloned.style.padding = '0';
      a4.appendChild(cloned);

      // 隐藏原容器
      c.style.display = 'none';
      bookContainer.appendChild(a4);

      a4Pages.push({
        element: a4,
        pageNum: globalPageNum,
        title: c.querySelector('h1, h2')?.innerText?.trim() || '封面/扉页'
      });
      globalPageNum++;
    });

    // 2. 正文各章流式装订
    rawChapters.forEach(chap => {
      // 提取模块名与章节名
      const moduleName = chap.querySelector('.kicker')?.innerText?.trim() || '';
      const chapterTitle = chap.querySelector('h1')?.innerText?.trim() || '';
      const chapId = chap.id;

      // 提取所有顶层子元素
      const children = Array.from(chap.children).filter(el => !el.classList.contains('kicker'));

      // 初始化本章第一张 A4 纸
      let currentA4 = createA4PageDOM(globalPageNum, moduleName, chapterTitle);
      registerPage(currentA4.page, currentA4.body, globalPageNum, chapterTitle, chapId);
      globalPageNum++;

      // 逐个元素流式排版
      children.forEach(child => {
        // 判断是否为原子不可拆分块（代码块、公式卡片、图片、表格、练习盒）
        const isAtomic = child.matches('pre, .example, .figure, .tablewrap, .formula-block, .lo, .summary, .callout');
        const cloned = child.cloneNode(true);

        currentA4.body.appendChild(cloned);

        // 测量当前 A4 版心是否溢出
        if (currentA4.body.scrollHeight > MAX_A4_BODY_HEIGHT) {
          // 溢出了！从当前页移除
          currentA4.body.removeChild(cloned);

          // 开启新一张 A4 纸！
          currentA4 = createA4PageDOM(globalPageNum, moduleName, chapterTitle);
          registerPage(currentA4.page, currentA4.body, globalPageNum, chapterTitle, chapId);
          globalPageNum++;

          // 将该元素作为新页面的首个元素放入
          currentA4.body.appendChild(cloned);
        }
      });

      // 隐藏未拆排的原始长章节
      chap.classList.add('chapter-raw-source');
    });

    buildIdIndex();
    fillTocPageNumbers();
  }

  // =========================================================================
  // 锚点 id → 页码索引：扫描每张 A4 纸版心内带 id 的元素 + 章节首页登记
  // =========================================================================
  function buildIdIndex() {
    idToPage = {};
    a4Pages.forEach((p, idx) => {
      if (p.chapterId && !(p.chapterId in idToPage)) {
        idToPage[p.chapterId] = { idx, el: p.element };
      }
      const root = p.body || p.element;
      root.querySelectorAll('[id]').forEach(el => {
        if (!(el.id in idToPage)) idToPage[el.id] = { idx, el };
      });
    });
  }

  // 目录点导线末端的实体页码（.toc-page 原本一直是空的）
  function fillTocPageNumbers() {
    document.querySelectorAll('.toc-full a[href^="#"]').forEach(a => {
      const targetId = a.getAttribute('href').slice(1);
      const hit = idToPage[targetId];
      const pageSpan = a.querySelector('.toc-page');
      if (hit && pageSpan) pageSpan.textContent = String(a4Pages[hit.idx].pageNum);
    });
  }

  // 3. 视图与翻页切换控制
  function updateView() {
    if (isPagedMode) {
      document.body.classList.add('paged-mode');
      a4Pages.forEach((p, idx) => {
        if (idx === currentPageIdx) {
          p.element.classList.add('active-page');
          p.element.style.display = 'flex';
        } else {
          p.element.classList.remove('active-page');
          p.element.style.display = 'none';
        }
      });

      if (prevBtn) prevBtn.disabled = currentPageIdx === 0;
      if (nextBtn) nextBtn.disabled = currentPageIdx === a4Pages.length - 1;

      const cur = a4Pages[currentPageIdx];
      let displayTitle = cur ? cur.title : '';
      if (displayTitle.length > 20) displayTitle = displayTitle.substring(0, 20) + '...';

      if (pageInfo) {
        pageInfo.innerText = `[${cur ? cur.pageNum : 1} / ${a4Pages.length} 页] ${displayTitle}`;
      }
      if (modeBtn) modeBtn.innerText = "切换为长卷轴";
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      document.body.classList.remove('paged-mode');
      a4Pages.forEach(p => {
        p.element.classList.remove('active-page');
        p.element.style.display = 'flex';
      });
      if (pageInfo) pageInfo.innerText = `长卷轴模式 (共 ${a4Pages.length} 页)`;
      if (modeBtn) modeBtn.innerText = "切换为单页翻书";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
    }
    localStorage.setItem('course_book_paged_mode', isPagedMode);
  }

  function goToPage(idx) {
    if (idx < 0 || idx >= a4Pages.length) return;
    currentPageIdx = idx;
    updateView();
  }

  // 4. 事件监听与键盘左右翻页
  if (prevBtn) prevBtn.onclick = () => goToPage(currentPageIdx - 1);
  if (nextBtn) nextBtn.onclick = () => goToPage(currentPageIdx + 1);

  if (modeBtn) modeBtn.onclick = () => {
    isPagedMode = !isPagedMode;
    updateView();
  };

  window.addEventListener('keydown', (e) => {
    if (!isPagedMode) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      goToPage(currentPageIdx - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      if (e.key === ' ') e.preventDefault();
      goToPage(currentPageIdx + 1);
    }
  });

  // 5. 目录与侧边栏锚点拦截：点击任意链接精准定位到具体的 A4 纸与小节！
  //    （原始章节源容器是 display:none 的，浏览器默认锚点跳转会指向隐身原件而纹丝不动）
  function jumpToAnchor(targetId) {
    const hit = idToPage[targetId];
    if (!hit) return false;
    if (isPagedMode) {
      goToPage(hit.idx);
      hit.el.scrollIntoView({ block: 'start' });
    } else {
      hit.el.scrollIntoView({ block: 'start' });
    }
    return true;
  }

  // 事件委托：目录/侧边栏克隆副本不会携带 addEventListener，必须挂在整个文档上
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const targetId = a.getAttribute('href').substring(1);
    if (!targetId) return;
    if (jumpToAnchor(targetId)) e.preventDefault();
  });

  // 初始 hash 直达（例如 book.html#ch3-gpu-basics）—— 需在拆页索引建立后执行
  function applyInitialHash() {
    if (location.hash.length > 1) {
      const targetId = decodeURIComponent(location.hash.slice(1));
      if (idToPage[targetId]) {
        currentPageIdx = idToPage[targetId].idx;
      }
    }
  }

  // 执行 A4 流式拆页并渲染
  reflowBookIntoA4();
  applyInitialHash();
  updateView();
})();
