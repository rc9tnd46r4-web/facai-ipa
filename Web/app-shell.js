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

    /* 5) 转移矩阵：渲染时用了内联列宽（桌面尺寸），这里改成手机可容纳的列宽 */
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
})();
