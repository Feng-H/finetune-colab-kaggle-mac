
// ==========================================================================
// 实体书真·A4 流式拆页与代码防跨页保护引擎 (True A4 Reflow & Anti-Split Engine)
// ==========================================
(function() {
  const MAX_A4_BODY_HEIGHT = 970; // A4 净版心可用像素高度 (1123px - 页眉28px - 页脚25px - 留白)
  let a4Pages = [];
  let currentPageIdx = 0;
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

  // 核心拆页排版主程序
  function reflowBookIntoA4() {
    const rawChapters = Array.from(document.querySelectorAll('.chapter'));
    const covers = Array.from(document.querySelectorAll('.cover, .front-matter'));

    // 如果已经拆过，不再重复拆
    if (document.querySelectorAll('.a4-page').length > 0) return;

    let globalPageNum = 1;
    a4Pages = [];

    // 1. 封面与扉页作为专属 A4 首页
    covers.forEach(c => {
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
      bookContainer.appendChild(currentA4.page);
      a4Pages.push({
        element: currentA4.page,
        pageNum: globalPageNum,
        title: chapterTitle,
        chapterId: chapId
      });
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
          bookContainer.appendChild(currentA4.page);
          a4Pages.push({
            element: currentA4.page,
            pageNum: globalPageNum,
            title: chapterTitle,
            chapterId: chapId,
            targetId: child.id || ''
          });
          globalPageNum++;

          // 将该元素作为新页面的首个元素放入
          currentA4.body.appendChild(cloned);
        }
      });

      // 隐藏未拆排的原始长章节
      chap.classList.add('chapter-raw-source');
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

  // 5. 目录与侧边栏锚点拦截：点击任意链接精准定位到具体的 A4 纸！
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const targetId = a.getAttribute('href').substring(1);
      if (!targetId) return;

      const pIdx = a4Pages.findIndex(p => p.chapterId === targetId || p.targetId === targetId);
      if (pIdx !== -1) {
        if (isPagedMode) {
          e.preventDefault();
          goToPage(pIdx);
        }
      }
    });
  });

  // 执行 A4 流式拆页并渲染
  reflowBookIntoA4();
  updateView();
})();
