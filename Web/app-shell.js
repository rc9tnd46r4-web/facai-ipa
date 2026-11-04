/* ============================================================
   发财 App · 页面内行为适配（由原生壳注入，页面本体不修改）
   ============================================================ */
(function () {
  var doc = document;
  var html = doc.documentElement;
  html.classList.add('in-facai-app');

  function ready(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ---------- 顶栏重排 ---------- */

  /* 是否是 emoji / 符号图标（汉字码点也大于 0x2000，不能只用阈值判断） */
  function isEmojiChar(cp) {
    return (cp >= 0x1f000 && cp <= 0x1faff) ||   /* 😀 💎 📁 🌐 🐲 … */
           (cp >= 0x2600 && cp <= 0x27bf) ||     /* ☀ ✅ ✨ ➡ … */
           (cp >= 0x2b00 && cp <= 0x2bff) ||
           (cp >= 0x2190 && cp <= 0x21ff) ||
           cp === 0xfe0f || cp === 0x20e3;
  }

  /* 把 emoji 图标与文字拆开：'💎 转移概率分析' -> {icon:'💎', label:'转移概率分析'} */
  function splitLabel(text) {
    var raw = (text || '').replace(/\s+/g, ' ').trim();
    var cp = raw.codePointAt ? raw.codePointAt(0) || 0 : 0;
    if (isEmojiChar(cp)) {
      var len = cp > 0xffff ? 2 : 1;
      /* 吃掉随后的变体选择符 */
      while (raw.charCodeAt(len) === 0xfe0f) len += 1;
      return { icon: raw.slice(0, len), label: raw.slice(len).trim() };
    }
    return { icon: '', label: raw };
  }

  /* 按钮文案精简（App 内一行四等分，放不下长文案） */
  var SHORT_LABEL = {
    '加载数据': '加载',
    '选择开奖记录文本': '选择文件',
    '选择文件': '选择文件'
  };

  function buttonInner(btn) {
    /* label.btn-file 里藏着 file input，改写文案时要保留 */
    var keeper = btn.querySelector('input');
    var parts = splitLabel(btn.textContent);
    var label = SHORT_LABEL[parts.label] || parts.label;
    btn.textContent = '';
    if (keeper) btn.appendChild(keeper);
    if (parts.icon) {
      var ico = doc.createElement('span');
      ico.className = 'fc-bico';
      ico.textContent = parts.icon;
      btn.appendChild(ico);
    }
    var txt = doc.createElement('span');
    txt.className = 'fc-btxt';
    txt.textContent = label;
    btn.appendChild(txt);
  }

  function buildTopbar() {
    /* ---- 深色 4 页：.upload-bar 内 h1 + 5 按钮 + 状态原本挤一行 ---- */
    var bar = doc.querySelector('.upload-bar');
    if (bar && bar.getAttribute('data-fc-top') !== '1') {
      var h1 = bar.querySelector('h1');
      var status = bar.querySelector('.status-text');
      var btns = Array.prototype.filter.call(
        bar.querySelectorAll('.upload-btn'),
        function (b) { return b.id !== 'updateBtn' && b.tagName === 'BUTTON'; }
      );

      if (h1 && btns.length) {
        bar.setAttribute('data-fc-top', '1');
        var parts = splitLabel(h1.textContent);
        var variant = (doc.querySelector('meta[name="facai-variant"]') || {}).content || '';

        var head = doc.createElement('div');
        head.className = 'fc-head';

        var brand = doc.createElement('div');
        brand.className = 'fc-brand';
        var logo = doc.createElement('span');
        logo.className = 'fc-logo';
        logo.textContent = parts.icon || '财';
        var name = doc.createElement('span');
        name.className = 'fc-name';
        var strong = doc.createElement('b');
        strong.textContent = parts.label;
        name.appendChild(strong);
        if (variant) {
          var sub = doc.createElement('i');
          sub.textContent = variant;
          name.appendChild(sub);
        }
        brand.appendChild(logo);
        brand.appendChild(name);
        head.appendChild(brand);

        if (status) {
          var wrap = doc.createElement('div');
          wrap.className = 'fc-status';
          var dot = doc.createElement('span');
          dot.className = 'fc-dot';
          wrap.appendChild(dot);
          wrap.appendChild(status);
          head.appendChild(wrap);
        }

        var actions = doc.createElement('div');
        actions.className = 'fc-actions';
        btns.forEach(function (btn) {
          buttonInner(btn);
          actions.appendChild(btn);
        });

        bar.appendChild(head);
        bar.appendChild(actions);
        /* 隐藏控件（file input / 更新按钮）挪到末尾，不参与布局 */
        ['#fileInput', '#updateBtn'].forEach(function (sel) {
          var el = bar.querySelector(sel);
          if (el) bar.appendChild(el);
        });
      }
    }

    /* ---- 浅色页（853）：标题加 Logo，工具栏按钮与状态分行 ---- */
    var header = doc.querySelector('.header');
    if (header && !header.querySelector('.fc-brand')) {
      var title = header.querySelector('h1');
      if (title) {
        var b2 = doc.createElement('div');
        b2.className = 'fc-brand fc-brand-light';
        var lg = doc.createElement('span');
        lg.className = 'fc-logo fc-logo-light';
        lg.textContent = '🐲';
        title.parentNode.insertBefore(b2, title);
        b2.appendChild(lg);
        b2.appendChild(title);
      }
    }

    var toolbar = doc.querySelector('.toolbar');
    if (toolbar && toolbar.getAttribute('data-fc-top') !== '1') {
      var items = Array.prototype.filter.call(toolbar.children, function (el) {
        return el.tagName === 'BUTTON' || (el.tagName === 'LABEL' && el.classList.contains('btn-file'));
      });
      if (items.length >= 2) {
        toolbar.setAttribute('data-fc-top', '1');
        toolbar.classList.add('fc-toolbar');
        items.forEach(buttonInner);
      }
    }
  }

  function adaptMatrices() {
    Array.prototype.forEach.call(doc.querySelectorAll('.matrix'), function (m) {
      var tpl = m.style.gridTemplateColumns;
      if (!tpl) return;
      var mm = tpl.match(/repeat\((\d+)/);
      if (!mm) return;
      var n = parseInt(mm[1], 10);
      var labelW = n >= 11 ? 30 : 34;
      var minW = n >= 11 ? 24 : 26;
      var next = labelW + 'px repeat(' + n + ', minmax(' + minW + 'px, 1fr))';
      if (m.getAttribute('data-mcols') !== next) {
        m.setAttribute('data-mcols', next);
        m.style.gridTemplateColumns = next;
        Array.prototype.forEach.call(m.classList, function (c) {
          if (c.indexOf('mcols-') === 0) m.classList.remove(c);
        });
        m.classList.add('mcols-' + n);
      }
    });
  }
  ready(function () {
    /* 1) 桌面端专属：更新记录 / 退出程序（依赖本地 Python 服务，App 内无意义） */
    var ub = doc.getElementById('updateBtn');
    if (ub) ub.style.display = 'none';
    Array.prototype.forEach.call(doc.querySelectorAll('[onclick*="quitApp"]'), function (el) {
      el.style.display = 'none';
    });

    /* 2) iOS 无拖拽上传：把空态文案改成点击选择 */
    var dz = doc.querySelector('.dropzone-inner');
    if (dz) {
      var h = dz.querySelector('h2');
      if (h && h.textContent.indexOf('拖拽') >= 0) h.textContent = '点击选择数据文件';
      var p = dz.querySelector('p');
      if (p && p.textContent.indexOf('拖拽') >= 0) p.textContent = '支持 .txt / .csv，也可用顶部按钮直接联网加载';
      dz.style.width = '100%';
    }

    /* 3) 长说明块：点击展开 / 收起 */
    var notice = doc.querySelector('.notice');
    if (notice && notice.scrollHeight > notice.clientHeight + 8) {
      notice.classList.add('collapsed');
      var tip = doc.createElement('div');
      tip.textContent = '点击展开完整说明 ▾';
      tip.style.cssText = 'text-align:center;font-size:11px;color:#3b6ef5;padding:4px 0 0;';
      notice.parentNode.insertBefore(tip, notice.nextSibling);
      notice.addEventListener('click', function () {
        var open = notice.classList.toggle('expanded');
        tip.textContent = open ? '点击收起 ▴' : '点击展开完整说明 ▾';
      });
    }

    /* 4) 输入框（如有）字号不小于 16px，避免 iOS 聚焦自动放大 */
    Array.prototype.forEach.call(doc.querySelectorAll('input[type=text],input[type=number],select,textarea'), function (el) {
      el.style.fontSize = '16px';
    });

    /* 5) 顶栏重排：第一行 Logo + 状态，第二行按钮等分；浅色页做同样的分行 */
    buildTopbar();

    /* 6) 转移矩阵：渲染时用了内联列宽（桌面尺寸），这里改成手机可容纳的列宽 */
    adaptMatrices();
    if (window.MutationObserver) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; adaptMatrices(); });
      }).observe(doc.body, { childList: true, subtree: true });
    }
  });

})();
