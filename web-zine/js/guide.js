// 차시 안내 페이지: .step 을 한 장씩 보여 주고 키보드·리모컨으로 넘긴다.
// 일반 <script>로 둔다: 파일을 더블클릭해 file:// 로 열어도 동작하도록(모듈은 막힘).
(function () {
  var steps = Array.prototype.slice.call(document.querySelectorAll('.step'));
  var n = steps.length, i = 0;
  var bar = document.querySelector('.progress');
  var pos = document.getElementById('pos'), min = document.getElementById('min');
  var prev = document.querySelector('.nav .prev'), next = document.querySelector('.nav .next');
  var nextLabel = next.querySelector('span');
  var lastLabel = next.dataset.last || '처음으로';

  steps.forEach(function (s, k) {
    s.dataset.n = String(k + 1).padStart(2, '0');
    bar.appendChild(document.createElement('span'));
  });
  // data-href 는 이 페이지 기준 상대 주소 → 화면에 실제 주소를 보여 준다.
  document.querySelectorAll('[data-href]').forEach(function (a) {
    var url = new URL(a.dataset.href, location.href);
    a.href = url.href;
    var show = a.querySelector('.mono');
    if (show && /^https?:/.test(url.protocol)) show.textContent = url.host + url.pathname;
  });

  function pad(x) { return String(x).padStart(2, '0'); }
  function go(k) {
    var was = i;
    i = Math.max(0, Math.min(n - 1, k));
    var bk = steps[i].querySelector('.book[data-src]');
    if (bk && bk.book && was !== i) bk.book.reset();
    steps.forEach(function (s, j) { s.classList.toggle('on', j === i); });
    Array.prototype.forEach.call(bar.children, function (b, j) { b.classList.toggle('on', j <= i); });
    pos.textContent = pad(i + 1) + ' / ' + pad(n);
    min.textContent = steps[i].dataset.min || '';
    prev.disabled = i === 0;
    nextLabel.textContent = i === n - 1 ? lastLabel : '다음';
    history.replaceState(null, '', '#' + (i + 1));
  }
  // 웹도서: data-src 의 {n} 자리에 쪽 번호. 표지 → 2–3 → 4–5 → 6–7 → 뒷표지 순으로 펼친다.
  document.querySelectorAll('.book[data-src]').forEach(function (el) {
    var total = +el.dataset.n || 8, src = el.dataset.src, spreads = [[1]];
    for (var p = 2; p < total; p += 2) spreads.push(p + 1 < total ? [p, p + 1] : [p]);
    spreads.push([total]);
    el.innerHTML = '<div class="book__stage"></div><div class="book__bar"><button type="button" class="book__prev" aria-label="앞 쪽">‹</button><span class="book__pos mono"></span><button type="button" class="book__next" aria-label="다음 쪽">›</button></div>';
    var stage = el.querySelector('.book__stage'), pos = el.querySelector('.book__pos'), at = 0;
    function show(k, dir) {
      at = k;
      var s = spreads[k];
      stage.innerHTML = '<div class="book__spread' + (s.length === 1 ? ' is-single' : '') + (dir ? ' turn-' + dir : '') + '">' +
        s.map(function (p) { return '<img src="' + src.replace('{n}', p) + '" alt="' + p + '쪽">'; }).join('') + '</div>';
      pos.textContent = (s.length === 1 ? s[0] : s[0] + '–' + s[1]) + ' / ' + total + '쪽';
      el.querySelector('.book__prev').disabled = k === 0;
      el.querySelector('.book__next').disabled = k === spreads.length - 1;
    }
    el.book = {
      next: function () { if (at >= spreads.length - 1) return false; show(at + 1, 'next'); return true; },
      prev: function () { if (at <= 0) return false; show(at - 1, 'prev'); return true; },
      reset: function () { show(0); }
    };
    el.querySelector('.book__prev').addEventListener('click', el.book.prev);
    el.querySelector('.book__next').addEventListener('click', el.book.next);
    show(0);
  });
  function book() { return steps[i].querySelector('.book[data-src]'); }

  function forward() { if (book() && book().book.next()) return; go(i === n - 1 ? 0 : i + 1); }

  prev.addEventListener('click', function () { if (book() && book().book.prev()) return; go(i - 1); });
  next.addEventListener('click', forward);
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // 발표용 리모컨은 대부분 PageDown/PageUp 또는 화살표를 보낸다.
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        if (e.key === 'Enter' && e.target.closest && e.target.closest('button, a')) return;
        // 웹도서가 있는 장에서는 책장을 먼저 넘기고, 마지막 쪽이면 다음 장으로.
        e.preventDefault(); if (book() && book().book.next()) break; if (i < n - 1) go(i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); if (book() && book().book.prev()) break; go(i - 1); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(n - 1); break;
      case 'f': case 'F': toggleFull(); break;
    }
  });
  var fullBtn = document.getElementById('full');
  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
  if (fullBtn) fullBtn.addEventListener('click', toggleFull);

  // QR: 공개 주소를 그대로 담는다(교실 컴퓨터의 localhost·file:// 주소가 아니라).
  document.querySelectorAll('[data-qr]').forEach(function (el) {
    if (!window.qrcode) { el.textContent = el.dataset.qr; return; }
    var q = qrcode(0, 'M'); q.addData(el.dataset.qr); q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  });

  function fromHash() { go((parseInt(location.hash.slice(1), 10) || 1) - 1); }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
