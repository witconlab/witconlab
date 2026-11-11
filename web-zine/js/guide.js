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
    i = Math.max(0, Math.min(n - 1, k));
    steps.forEach(function (s, j) { s.classList.toggle('on', j === i); });
    Array.prototype.forEach.call(bar.children, function (b, j) { b.classList.toggle('on', j <= i); });
    pos.textContent = pad(i + 1) + ' / ' + pad(n);
    min.textContent = steps[i].dataset.min || '';
    prev.disabled = i === 0;
    nextLabel.textContent = i === n - 1 ? lastLabel : '다음';
    history.replaceState(null, '', '#' + (i + 1));
  }
  function forward() { go(i === n - 1 ? 0 : i + 1); }

  prev.addEventListener('click', function () { go(i - 1); });
  next.addEventListener('click', forward);
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // 발표용 리모컨은 대부분 PageDown/PageUp 또는 화살표를 보낸다.
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        if (e.key === 'Enter' && e.target.closest && e.target.closest('button, a')) return;
        e.preventDefault(); if (i < n - 1) go(i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); go(i - 1); break;
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

  function fromHash() { go((parseInt(location.hash.slice(1), 10) || 1) - 1); }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
