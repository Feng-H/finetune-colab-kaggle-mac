#!/usr/bin/env python3
"""course-book 组装器 + 书桌服务器。

用法：
  python3 build.py            # 组装 chapters/*.html → dist/book.html（单文件，内联 CSS+JS）
  python3 build.py --serve    # 书桌模式：http://127.0.0.1:8765
                              #   GET  /            书稿（chapters/ 变动自动重建+浏览器热刷新）
                              #   GET  /annotations 标注库 JSON
                              #   POST /annotations 新建/更新标注（AI 侧亦直接编辑此文件）
                              #   GET  /poll        构建时间戳（前端轮询热刷新）
碎片约定：
  00-cover.html        <section class="cover">…</section>
  NN-slug.html         <section class="chapter" id="chN" data-status="draft|final">…</section>
标注协议：W3C TextQuoteSelector 风格（anchor.exact/prefix/suffix/start/end + chapter），
  type: question|suggest|bug|discuss|answer；disposition: sidebar|rewrite|chat（answer 固定）
  status: open|resolved；resolved 时 resolution={at,summary}。
"""
import datetime
import json
import pathlib
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root = pathlib.Path(__file__).resolve().parent
chapters_dir = root / "chapters"
ann_file = root / "annotations.json"
anno_js = pathlib.Path(__file__).with_name("annotate.js")  # 与 build.py 同目录（技能资产）
dist_html = root / "dist" / "book.html"

# ---------------- 组装 ----------------

def read_css() -> str:
    return (root / "assets" / "book.css").read_text(encoding="utf-8")

def read_paging_js() -> str:
    p = root / "assets" / "paging.js"
    return p.read_text(encoding="utf-8") if p.exists() else ""

def read_js() -> str:
    js = anno_js.read_text(encoding="utf-8")
    # 书籍目录里 annotate.js 可能已被复制到根目录（bootstrap 副本），优先用同目录版
    local = root / "annotate.js"
    if local.exists():
        js = local.read_text(encoding="utf-8")
    return js

def chapter_entries(fragments):
    """提取 (cid, kicker_module, title, draft, [subsections]) 列表"""
    entries = []
    for f2 in fragments:
        t2 = f2.read_text(encoding="utf-8")
        m2 = re.search(r'<section[^>]*class="chapter[^"]*"[^>]*id="([^"]+)"[^>]*data-status="([^"]+)"', t2)
        if not m2:
            continue
        cid = m2.group(1)
        kicker_match = re.search(r'<p class="kicker">(.*?)</p>', t2, re.S)
        kicker = re.sub(r"<[^>]+>", "", kicker_match.group(1)).strip() if kicker_match else ""
        
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", t2, re.S)
        title = re.sub(r"<[^>]+>", "", h1.group(1)).strip() if h1 else cid
        
        # 抽取本章下所有的 h2 小节
        subsections = []
        for h2_match in re.finditer(r'<h2(?:[^>]*id="([^"]+)")?[^>]*>(.*?)</h2>', t2, re.S):
            sub_id = h2_match.group(1) or ""
            sub_title = re.sub(r"<[^>]+>", "", h2_match.group(2)).strip()
            if "本章小结" in sub_title or "毕业项目架构全景小结" in sub_title:
                continue
            subsections.append((sub_id, sub_title))
            
        entries.append((cid, kicker, title, m2.group(2) != "final", subsections))
    return entries

def build() -> float:
    fragments = sorted(chapters_dir.glob("*.html"))
    entries = chapter_entries(fragments)
    
    # 按照模块 (kicker) 进行分组聚合
    modules = {}
    for cid, kicker, title, draft, subs in entries:
        mod_key = kicker if kicker else "前置说明"
        if mod_key not in modules:
            modules[mod_key] = []
        modules[mod_key].append((cid, title, draft, subs))
        
    sidebar_parts = []
    toc_parts = []
    
    for mod_name, ch_list in modules.items():
        # 侧边栏模块标题
        sidebar_parts.append(f'<li class="nav-module-title">{mod_name}</li>')
        # 正式目录模块块
        toc_module_chapters = []
        
        for cid, title, draft, subs in ch_list:
            sidebar_parts.append(f'<li class="nav-chapter-item"><a href="#{cid}">{title}</a></li>')
            
            sub_html = ""
            if subs:
                sub_lines = []
                for sid, stitle in subs:
                    href = f"#{sid}" if sid else f"#{cid}"
                    sub_lines.append(f'<li class="toc-sub"><a href="{href}"><span class="toc-title">{stitle}</span><span class="toc-leader"></span><span class="toc-page"></span></a></li>')
                sub_html = f'<ul class="toc-sublist">\n' + "\n".join(sub_lines) + '\n</ul>'
                
            toc_module_chapters.append(
                f'<li class="toc-chapter"><a href="#{cid}"><span class="toc-title">{title}</span><span class="toc-leader"></span><span class="toc-page"></span></a>{sub_html}</li>'
            )
            
        toc_parts.append(
            f'<li class="toc-module"><div class="toc-module-header">{mod_name}</div><ol class="toc-chapter-list">\n'
            + "\n".join(toc_module_chapters) + '\n</ol></li>'
        )
        
    sidebar = ('<nav class="book-nav" id="book-nav"><h2 class="book-nav-title">目录树导航</h2><ul class="nav-tree">\n'
               + "\n".join(sidebar_parts) + '\n</ul></nav>') if sidebar_parts else ""
               
    body_parts, toc_done = [], False
    for frag in fragments:
        text = frag.read_text(encoding="utf-8")
        m = re.search(r'<section[^>]*class="chapter[^"]*"[^>]*id="([^"]+)"[^>]*data-status="([^"]+)"', text)
        if m and not toc_done:
            body_parts.append('<section class="front-matter"><nav class="toc-full" id="toc"><h1 class="toc-heading">全书架构大纲 · Contents</h1><ol class="toc-module-list">\n'
                               + "\n".join(toc_parts) + "\n</ol></nav></section>")
            toc_done = True
        body_parts.append(text)

    stamp = datetime.date.today().isoformat()
    doc = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{root.name}</title>
<style>
{read_css()}
</style>
</head>
<body>
<div class="book">
<p class="build-bar">built {stamp} · course-book</p>
{sidebar}
{chr(10).join(body_parts)}
</div>

<div class="page-controller" id="pageController">
  <button class="page-btn" id="prevPageBtn" title="上一页 (键盘 ←)">◀ 上一页</button>
  <span class="page-info" id="pageInfo">加载中...</span>
  <button class="page-btn" id="nextPageBtn" title="下一页 (键盘 →)">下一页 ▶</button>
  <button class="page-mode-toggle" id="modeToggleBtn">切换为长卷轴</button>
</div>

<script>
{read_js()}
</script>
<script>
{read_paging_js()}
</script>
</body>
</html>
"""
    dist_html.parent.mkdir(exist_ok=True)
    tmp = dist_html.with_suffix(".tmp")
    tmp.write_text(doc, encoding="utf-8")
    tmp.replace(dist_html)  # 原子替换，避免热刷新读到半成品
    return len(fragments)


def status_line() -> str:
    fragments = sorted(chapters_dir.glob("*.html"))
    lines, n_draft = [], 0
    for f in fragments:
        text = f.read_text(encoding="utf-8")
        m = re.search(r'data-status="([^"]+)"', text)
        st = m.group(1) if m else "?"
        n_draft += st not in ("final", "?")
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", text, re.S)
        title = re.sub(r"<[^>]+>", "", h1.group(1)).strip()[:30] if h1 else "(无标题)"
        lines.append(f"  {f.name:<28} {st:<6} {title}")
    return f"✓ {len(fragments)} fragments -> {dist_html.relative_to(root)}  (draft 章节: {n_draft})\n" + "\n".join(lines)

# ---------------- 标注库 ----------------

def load_annos() -> list:
    if ann_file.exists():
        return json.loads(ann_file.read_text(encoding="utf-8"))
    return []

def save_annos(items: list) -> None:
    tmp = ann_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(ann_file)

# ---------------- 书桌服务器 ----------------

class Desk(BaseHTTPRequestHandler):
    def log_message(self, *a):  # 安静模式
        pass

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/annotations"):
            body = json.dumps(load_annos(), ensure_ascii=False).encode("utf-8")
            self._send(200, body, "application/json; charset=utf-8")
        elif self.path.startswith("/poll"):
            self._send(200, json.dumps({"stamp": dist_html.stat().st_mtime}).encode(), "application/json")
        elif self.path in ("/", "/index.html", "/book.html"):
            self._send(200, dist_html.read_bytes(), "text/html; charset=utf-8")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        if not self.path.startswith("/annotations"):
            return self._send(404, b"not found", "text/plain")
        n = int(self.headers.get("Content-Length", 0))
        item = json.loads(self.rfile.read(n) or b"{}")
        items = load_annos()
        if not item.get("id"):
            item["id"] = "a-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S-") + f"{len(items)+1:03d}"
            items.append(item)
        else:
            for i, x in enumerate(items):
                if x.get("id") == item["id"]:
                    items[i] = {**x, **item}
                    item = items[i]
                    break
            else:
                items.append(item)
        save_annos(items)
        self._send(200, json.dumps(item, ensure_ascii=False).encode(), "application/json; charset=utf-8")

def watch_and_rebuild(stop: threading.Event):
    while not stop.wait(0.7):
        try:
            newest = max(p.stat().st_mtime for p in
                         [*chapters_dir.glob("*.html"), root / "assets" / "book.css",
                          *( [root / "annotate.js"] if (root / "annotate.js").exists() else [] )])
            if newest > dist_html.stat().st_mtime - 0.2:
                if newest > getattr(watch_and_rebuild, "last", 0):
                    n = build()
                    watch_and_rebuild.last = newest
                    print(f"↻ 检测到章节/样式变动，已重建（{n} fragments）")
        except FileNotFoundError:
            pass

def serve(port: int = 8765):
    build()
    stop = threading.Event()
    threading.Thread(target=watch_and_rebuild, args=(stop,), daemon=True).start()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Desk)
    print(f"📖 书桌已开张 → http://127.0.0.1:{port}")
    print("   划选文字/双击段落即可备注；练习块点「在此作答」；Ctrl+C 收摊")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        stop.set()
        print("\nbye")

if __name__ == "__main__":
    if "--serve" in sys.argv:
        port = 8765
        if "--port" in sys.argv:
            port = int(sys.argv[sys.argv.index("--port") + 1])
        serve(port)
    else:
        build()
        print(status_line())
