/* Muss ganz vorn im Spiel stehen, vor dem Spielcode.
   1. Ist der Browser-Speicher (localStorage) hier gesperrt, etwa weil das Spiel eingebettet im Spiele-Hub läuft, gibt es einen Ersatz im Arbeitsspeicher.
      Der Spiele-Hub bewahrt den Stand dann auf (siehe Spielstand-Code-Modul).
   2. Der Hub hängt seinen gespeicherten Stand als #lgh=<Base64url(JSON)> an die Adresse. Er wird hier in den Speicher geschrieben und der Hash entfernt. */
(function () {
  var ok = true;
  try { var t0 = window.localStorage; t0.setItem('__lgh_t', '1'); t0.removeItem('__lgh_t'); } catch (e) { ok = false; }
  if (!ok) {
    var m = {}, melde = function () { if (window.__lghAenderung) window.__lghAenderung(); };
    var shim = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { if (window.__lghSperre) return; m[k] = String(v); melde(); },
      removeItem: function (k) { if (window.__lghSperre) return; delete m[k]; melde(); },
      clear: function () { if (window.__lghSperre) return; m = {}; melde(); },
      key: function (i) { var k = Object.keys(m); return i < k.length ? k[i] : null; }
    };
    Object.defineProperty(shim, 'length', { get: function () { return Object.keys(m).length; } });
    try { Object.defineProperty(window, 'localStorage', { get: function () { return shim; }, configurable: true }); window.__lghSpeicherErsatz = true; } catch (e) { }
  }
  /* Große Stände (über die Adresse nicht zuverlässig): Der Hub gibt sie dem Rahmen als window.name mit ('lgh:' + JSON-Text {t, d}).
     Das ist beim Start sofort da, das Spiel braucht keine Änderung. Hier wird der Stand in den Speicher geschrieben, window.name sofort geleert
     (damit er beim Neuladen nicht noch einmal und nie an fremde Seiten geht) und dem Hub {lgh:'fertig'} gemeldet. */
  try {
    if (typeof window.name === 'string' && window.name.indexOf('lgh:') === 0) {
      var nj = window.name.slice(4);
      window.name = '';
      var no = JSON.parse(nj);
      if (no && no.d && typeof no.d === 'object') {
        for (var nk in no.d) if (Object.prototype.hasOwnProperty.call(no.d, nk)) localStorage.setItem(nk, String(no.d[nk]));
        if (window.parent !== window) { try { window.parent.postMessage({ lgh: 'fertig' }, '*'); } catch (e2) { } }
      }
    }
  } catch (e) { }
  try {
    var h = location.hash;
    if (h.indexOf('#lgh=') !== 0) return;
    var t = h.slice(5).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var s = atob(t), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    var o = JSON.parse(new TextDecoder().decode(u));
    if (o && o.d && typeof o.d === 'object') for (var k in o.d) if (Object.prototype.hasOwnProperty.call(o.d, k)) localStorage.setItem(k, String(o.d[k]));
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) { }
})();
