// 공방지도·7질문 페이지가 쓰는 claude.use('db'|'user')를 Apps Script 웹 앱으로 바꿔 줘요. 로그인 없음.
// 진행자 화면: 주소 끝에 ?host=1 을 붙이면 진행자 모드(여러 사람 몫 대신 올리기, 앞 화면 크게).
(function () {
  var API = window.SALANGGA_API || '';
  var host = new URLSearchParams(location.search).get('host') === '1';
  var me = null;
  try { me = localStorage.getItem('salangga_id'); } catch (e) {}
  if (!me) {
    me = 'u' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { localStorage.setItem('salangga_id', me); } catch (e) {}
  }
  function rid() { return 'x' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }

  function post(kind, id, data) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ kind: kind, id: id, data: data }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'save failed'); });
  }
  function list(kind) {
    return fetch(API + '?kind=' + kind + '&t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'load failed'); return j.rows; });
  }

  function collection(kind) {
    var ord = null, lim = null;
    var c = {
      orderBy: function (f, d) { ord = [f, d || 'asc']; return c; },
      limit: function (n) { lim = n; return c; },
      onSnapshot: function (cb, onErr) {
        var stop = false, last = '';
        function tick() {
          if (stop) return;
          list(kind).then(function (rows) {
            if (ord) rows.sort(function (a, b) { return ((a.data[ord[0]] || 0) - (b.data[ord[0]] || 0)) * (ord[1] === 'desc' ? -1 : 1); });
            if (lim) rows = rows.slice(0, lim);
            var sig = JSON.stringify(rows);
            if (sig !== last) { last = sig; cb({ docs: rows.map(function (r) { return { id: r.id, data: function () { return r.data; } }; }) }); }
          }).catch(function (e) { last = ''; if (onErr) onErr(e); })
            .then(function () { if (!stop) setTimeout(tick, 4000); });
        }
        tick();
        return function () { stop = true; };
      },
      add: function (d) { return post(kind, rid(), d); },
      doc: function (id) { return { set: function (d) { return post(kind, id, d); } }; }
    };
    return c;
  }

  var db = API ? { collection: collection } : null;
  var user = { id: function () { return Promise.resolve(me); }, isOwner: function () { return Promise.resolve(host); }, canEdit: function () { return Promise.resolve(host); } };
  window.claude = { use: function (n) { return Promise.resolve(n === 'db' ? db : n === 'user' ? user : null); } };
})();
