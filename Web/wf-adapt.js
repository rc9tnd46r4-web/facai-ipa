/* ============================================================================
   发财 · 移动端适配脚本（外部注入，只改版式与取数通道，绝不碰页面业务算法）
   由内置 HTTP 服务在 </body> 前注入；file:// 兜底时由 WKUserScript 追加挂载。
   ========================================================================== */
(function () {
  'use strict';
  if (window.__WF_ADAPT_READY__) return;
  window.__WF_ADAPT_READY__ = 1;

  var WF_VERSION = '1.0';
  window.__WF_ADAPT__ = { version: WF_VERSION, blockedProxies: 0, cols: {} };

  /* ------------------------------------------------------------------ 0. 工具 */
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /**
   * 精确 emoji 码点判定。
   * 绝对不能用 cp > 0x2000 这种粗判：「选」= U+9009 落在 0x2000 以上，会被误判成图标，
   * 于是标题里的汉字被当图标剥掉、按钮排版被错误重排。这里只认真正的 emoji 区段。
   */
  function isEmojiCodePoint(cp) {
    if (cp < 0x203C) return false;                       // 0x2000~0x203B 全是普通标点/符号
    return (
      cp === 0x203C || cp === 0x2049 || cp === 0x2122 || cp === 0x2139 ||
      (cp >= 0x2194 && cp <= 0x21AA) ||
      (cp >= 0x231A && cp <= 0x231B) ||
      cp === 0x2328 ||
      (cp >= 0x23CF && cp <= 0x23FA) ||
      cp === 0x24C2 ||
      (cp >= 0x25AA && cp <= 0x25FE) ||
      (cp >= 0x2600 && cp <= 0x27BF) ||                  // ☀…➿ 杂项符号 + 装饰符号（含 💎 不在内，见下）
      (cp >= 0x2934 && cp <= 0x2935) ||
      (cp >= 0x2B05 && cp <= 0x2B55) ||
      cp === 0x3030 || cp === 0x303D ||
      (cp >= 0x3297 && cp <= 0x3299) ||
      (cp >= 0x1F000 && cp <= 0x1FAFF) ||                // 主要 emoji 平面
      (cp >= 0x1F1E6 && cp <= 0x1F1FF) ||                // 区域指示符（国旗）
      (cp >= 0xE0020 && cp <= 0xE007F)                   // tag 字符
    );
  }
  window.__wfIsEmoji = function (ch) {
    if (!ch) return false;
    var cp = ch.codePointAt(0);
    return isEmojiCodePoint(cp);
  };

  /** 剥掉元素文本开头的 emoji / 变体选择符 / 空白，返回被剥掉的图标 */
  function stripLeadingEmoji(el) {
    if (!el) return '';
    var t = el.textContent || '';
    var i = 0, found = false;
    while (i < t.length) {
      var cp = t.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      if (isEmojiCodePoint(cp) || cp === 0xFE0F || cp === 0xFE0E || cp === 0x200D) {
        i += ch.length; found = true; continue;
      }
      if (found && (cp === 0x20 || cp === 0xA0 || cp === 0x3000)) { i += ch.length; continue; }
      break;
    }
    if (!found || i === 0) return '';
    var icon = t.slice(0, i).trim();
    el.textContent = t.slice(i).replace(/^[\s\u3000]+/, '');
    return icon;
  }

  /* -------------------------------------------- 1. 数据通道：绝不过公共代理 */
  var PROXY_HOSTS = [
    'cors.eu.org', 'api.allorigins.win', 'allorigins.win', 'api.codetabs.com',
    'api.cors.lol', 'cors.lol', 'whateverorigin.org', 'www.whateverorigin.org',
    'corsproxy.io', 'proxy.corsfix.com', 'corsproxy.org', 'cors-anywhere.herokuapp.com',
    'thingproxy.freeboard.io', 'yacdn.org', 'crossorigin.me', 'jsonp.afeld.me',
    'cors.isomorphic-git.org', 'test.cors.workers.dev', 'proxy.cors.sh'
  ];
  var SRC_URLS = {
    xinao: 'https://www.wuweicb1.com/kj/CBAM1DHK1.txt',
    laogang: 'https://www.wuweicb1.com/kj/CBAMHK1.txt',
    xianggang: 'https://www.wuweicb1.com/kj/CBHK1.txt'
  };

  function hostOf(u) {
    try { return new URL(String(u), location.href).hostname.toLowerCase(); } catch (e) { return ''; }
  }
  function isProxyUrl(u) {
    var h = hostOf(u);
    if (!h) return false;
    for (var i = 0; i < PROXY_HOSTS.length; i++) {
      var d = PROXY_HOSTS[i];
      if (h === d || h.slice(-(d.length + 1)) === '.' + d) return true;
    }
    return false;
  }
  window.__wfIsProxyUrl = isProxyUrl;

  /**
   * 覆盖 window.srcBuildStages：只保留「本地服务 → 直连」两级。
   * 本地服务 = App 内自带的 http://127.0.0.1:4783x/api/history，由原生 URLSession 代取源站；
   * 直连 = 源站原始地址（手机端必被跨域拦，留作最后兜底）。
   * 任何第三方公共代理通道都不在列表里 —— 数据不经过别人服务器。
   */
  var wfBuildStages = function (key, cfg) {
    var stages = [];
    var online = (location.protocol !== 'file:');
    var srvOn = online;
    try { srvOn = (typeof LAGFIT_SRV_ON === 'undefined') ? online : !!LAGFIT_SRV_ON; } catch (e) { srvOn = online; }

    if (online && srvOn) {
      stages.push({
        name: '本地服务', kind: 'single',
        url: '/api/history?src=' + encodeURIComponent(key),
        timeout: 40000
      });
    }
    var direct = (cfg && cfg.url) || SRC_URLS[key] || '';
    if (direct) {
      stages.push({ name: '直连', kind: 'single', url: direct, timeout: 12000 });
    }
    return stages;
  };
  wfBuildStages.__wfNoproxy = true;
  window.srcBuildStages = wfBuildStages;
  window.__wfNoproxy = true;

  /* 页面若在某个分支里重新定义 srcBuildStages，定时兜底装回（打的是 __wfNoproxy 标记） */
  setInterval(function () {
    if (window.srcBuildStages !== wfBuildStages) window.srcBuildStages = wfBuildStages;
    window.__wfNoproxy = true;
  }, 1500);

  /* 劫持 fetch：代理域名直接 reject，请求根本不发出去 */
  var rawFetch = window.fetch;
  if (typeof rawFetch === 'function') {
    window.fetch = function (input, init) {
      var u = (typeof input === 'string') ? input : ((input && input.url) || '');
      if (u && isProxyUrl(u)) {
        window.__WF_ADAPT__.blockedProxies++;
        return Promise.reject(new Error('已拦截第三方公共代理：' + hostOf(u)));
      }
      return rawFetch.apply(this, arguments);
    };
  }
  /* XHR 兜底：代理地址直接改写成必然失败的本机地址 */
  if (window.XMLHttpRequest && XMLHttpRequest.prototype && XMLHttpRequest.prototype.open) {
    var rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      if (url && isProxyUrl(url)) {
        window.__WF_ADAPT__.blockedProxies++;
        args[1] = 'http://127.0.0.1:9/__wf_proxy_blocked__';
      }
      return rawOpen.apply(this, args);
    };
  }

  /* --------------------------------------------------- 2. 隐藏「更新记录」按钮 */
  /* 桌面版更新器入口（#updateBtn → /update），手机上无法调用。
     只隐藏不删除：页面里有 getElementById 引用，删了会报错。 */
  function hideUpdateBtn() {
    var b = document.getElementById('updateBtn');
    if (!b) return;
    if (b.style.display !== 'none') b.style.display = 'none';
    if (!b.hasAttribute('disabled')) b.setAttribute('disabled', 'disabled');
    if (b.getAttribute('aria-hidden') !== 'true') b.setAttribute('aria-hidden', 'true');
  }
  [0, 500, 1500, 3000].forEach(function (t) { setTimeout(hideUpdateBtn, t); });
  setInterval(hideUpdateBtn, 3000);
  document.addEventListener('DOMContentLoaded', function () {
    hideUpdateBtn();
    var b = document.getElementById('updateBtn');
    if (b && window.MutationObserver) {
      new MutationObserver(hideUpdateBtn).observe(b, {
        attributes: true, attributeFilter: ['style', 'disabled', 'class']
      });
    }
  });

  /* ------------------------------------------------------------ 3. 顶部两行栏 */
  function makeLogo() {
    var s = document.createElement('span');
    s.className = 'wf-logo';
    s.textContent = '财';
    return s;
  }
  function makeVer() {
    var s = document.createElement('span');
    s.className = 'wf-ver';
    s.textContent = 'v' + WF_VERSION;
    return s;
  }

  /** 4 个「十维」页：.upload-bar → 第一行(Logo+标题+版本+右侧状态) / 第二行(按钮等分) */
  function setupDarkBar() {
    var bar = q('.upload-bar');
    if (!bar || bar.dataset.wfBar) return;
    var h1 = q('h1', bar);
    var status = q('.status-text', bar) || q('#status', bar);
    if (!h1 || !status) return;
    bar.dataset.wfBar = '1';

    var line1 = document.createElement('div');
    line1.className = 'wf-topline';

    var statusWrap = document.createElement('div');
    statusWrap.className = 'wf-status';
    statusWrap.appendChild(status);

    line1.appendChild(makeLogo());
    stripLeadingEmoji(h1);
    h1.style.flex = '1 1 auto';
    h1.style.minWidth = '0';
    line1.appendChild(h1);
    line1.appendChild(makeVer());
    line1.appendChild(statusWrap);

    var btnrow = document.createElement('div');
    btnrow.className = 'wf-btnrow';

    bar.insertBefore(line1, bar.firstChild);
    qa('.upload-btn', bar).forEach(function (b) { btnrow.appendChild(b); });
    bar.appendChild(btnrow);
  }

  /** 853 生肖页：.header + .toolbar → 合成同一个 sticky 两行栏 */
  function setup853Bar() {
    var wrap = q('.wrap');
    var header = q('.header');
    var toolbar = q('.toolbar');
    if (!wrap || !header || !toolbar || wrap.dataset.wf853) return;
    wrap.dataset.wf853 = '1';

    var h1 = q('h1', header);
    var sub = q('.muted.small', header);
    var meta = q('.meta', header);
    var fileStatus = q('#fileStatus', toolbar);

    var top = document.createElement('div');
    top.className = 'wf-topbar';

    var line1 = document.createElement('div');
    line1.className = 'wf-topline';
    line1.appendChild(makeLogo());
    if (h1) {
      stripLeadingEmoji(h1);
      h1.style.flex = '1 1 auto';
      h1.style.minWidth = '0';
      line1.appendChild(h1);
    }
    line1.appendChild(makeVer());

    var statusWrap = document.createElement('div');
    statusWrap.className = 'wf-status';
    if (meta) { meta.classList.add('wf-status-line'); statusWrap.appendChild(meta); }
    if (fileStatus) { fileStatus.classList.add('wf-status-line'); statusWrap.appendChild(fileStatus); }
    line1.appendChild(statusWrap);

    toolbar.classList.add('wf-btnrow');
    top.appendChild(line1);
    top.appendChild(toolbar);
    wrap.insertBefore(top, wrap.firstChild);

    /* 第一个按钮原文「选择开奖记录文本」共 8 个字，320/360 屏等分后每格只有 66~78px，
       必然折行或被裁。这里只改文案（保留 <input type=file> 与所有事件），不动任何逻辑。 */
    var fileLabel = q('label.btn-file', toolbar);
    if (fileLabel) {
      for (var node = fileLabel.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === 3 && node.nodeValue.indexOf('选择开奖记录') >= 0) {
          node.nodeValue = '选择文件';
          break;
        }
      }
    }

    /* header 里那段长说明：压到栏下，最多两行 */
    if (sub) {
      sub.classList.add('wf-subnote');
      wrap.insertBefore(sub, top.nextSibling);
    }
    if (header.parentNode) header.parentNode.removeChild(header);
  }

  function setupTopBars() {
    try { setupDarkBar(); } catch (e) {}
    try { setup853Bar(); } catch (e) {}
  }

  /* --------------------------------------------------------------- 4. 矩阵修版 */
  /* 内联 grid-template-columns 优先级高于外部样式表，CSS 覆盖不了，只能 JS 改写。 */
  function matrixCols(m) {
    var tpl = m.style.gridTemplateColumns || '';
    var mm = tpl.match(/repeat\(\s*(\d+)/);
    if (mm) return parseInt(mm[1], 10);
    var heads = 0;
    for (var i = 0; i < m.children.length; i++) {
      if (m.children[i].classList.contains('mh')) heads++; else break;
    }
    return heads > 1 ? heads - 1 : 0;
  }

  function fixMatrix() {
    var mats = qa('.matrix');
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i];
      var n = matrixCols(m);
      if (!n) continue;

      var wrap = m.closest('.matrix-wrap') || m.parentElement;
      var avail = (wrap ? wrap.clientWidth : window.innerWidth) || window.innerWidth;
      var gap = n >= 12 ? 1 : 2;
      var first = n >= 12 ? 24 : 30;
      var minCell = n >= 12 ? 20 : 26;
      var cell = Math.floor((avail - first - gap * (n + 1)) / n);

      var sig = [n, avail, cell].join('/');
      if (m.dataset.wfSig === sig) continue;
      m.dataset.wfSig = sig;
      m.dataset.wfCols = String(n);
      window.__WF_ADAPT__.cols[n] = (window.__WF_ADAPT__.cols[n] || 0) + 1;

      if (n >= 12) {
        /* 12 列（生肖）：格子最窄，固定像素宽度，宁可容器横滑也不挤压 */
        cell = Math.max(minCell, cell);
        m.style.setProperty('grid-template-columns', first + 'px repeat(' + n + ', ' + cell + 'px)', 'important');
        m.style.setProperty('width', 'max-content', 'important');
        m.classList.add('wf-mx12');
        m.classList.remove('wf-mx10');
      } else {
        /* 其余维度（10 列）：铺满容器 */
        m.style.setProperty('grid-template-columns', first + 'px repeat(' + n + ', minmax(0, 1fr))', 'important');
        m.style.setProperty('width', '', 'important');
        m.classList.add('wf-mx10');
        m.classList.remove('wf-mx12');
      }
    }
  }

  /* ------------------------------------------------------------ 5. 柱状图横滑 */
  function wrapBars() {
    qa('.bar-chart').forEach(function (c) {
      var p = c.parentNode;
      if (!p || (p.classList && p.classList.contains('wf-bars'))) return;
      var w = document.createElement('div');
      w.className = 'wf-bars';
      p.insertBefore(w, c);
      w.appendChild(c);
    });
  }

  /* -------------------------------------------------------- 6. 宽表格横向滚动 */
  function wrapTables() {
    qa('table').forEach(function (t) {
      var anc = t.parentElement;
      while (anc && anc !== document.body) {
        var ox = '';
        try { ox = getComputedStyle(anc).overflowX; } catch (e) { ox = ''; }
        if (ox === 'auto' || ox === 'scroll') return;
        if (anc.classList && (anc.classList.contains('wf-xscroll') || anc.classList.contains('stat-scroll'))) return;
        anc = anc.parentElement;
      }
      var p = t.parentNode;
      if (!p) return;
      var w = document.createElement('div');
      w.className = 'wf-xscroll';
      p.insertBefore(w, t);
      w.appendChild(t);
    });
  }

  /* ------------------------------------------------------------ 7. 统一跑一遍 */
  var runTimer = null, lateTimer = null;
  function runAll() {
    try { setupTopBars(); } catch (e) {}
    try { hideUpdateBtn(); } catch (e) {}
    try { fixMatrix(); } catch (e) {}
    try { wrapBars(); } catch (e) {}
    try { wrapTables(); } catch (e) {}
    /* 兜底：页面若漏了 LAGFIT_SRV_ON 的 const，用 window 属性补上 */
    try {
      if (typeof window.LAGFIT_SRV_ON === 'undefined') {
        window.LAGFIT_SRV_ON = (location.protocol !== 'file:');
      }
    } catch (e) {}
  }
  function scheduleRun() {
    if (runTimer) return;
    runTimer = setTimeout(function () {
      runTimer = null;
      runAll();
      /* 页面分批插 DOM（表格最后才到位），再补一遍 */
      if (lateTimer) clearTimeout(lateTimer);
      lateTimer = setTimeout(function () { lateTimer = null; runAll(); }, 450);
    }, 120);
  }

  runAll();
  document.addEventListener('DOMContentLoaded', runAll);
  window.addEventListener('load', runAll);
  window.addEventListener('resize', scheduleRun);
  window.addEventListener('orientationchange', function () { setTimeout(runAll, 260); });

  /* 数据是异步渲染的（加载后才出矩阵/柱状图/表格），MutationObserver 兜住 */
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) { scheduleRun(); return; }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* 供验收脚本手动触发一次全量修版 */
  window.__wfRepair = runAll;
})();
