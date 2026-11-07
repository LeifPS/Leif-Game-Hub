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
  /* Große Stände kommen nicht über die Adresse, sondern per postMessage: Der Hub setzt dann nur #lgh=msg. Das Spiel fragt mit {lgh:'hallo'} nach,
     bekommt {lgh:'daten', json} (der JSON-Text {t, d}), schreibt ihn in den Speicher und meldet {lgh:'fertig'}.
     Der Spielcode muss dafür erst nach window.__lghBereit (ein Promise) gestartet werden (siehe index.html). Bis dahin meldet das Modul nichts an den Hub. */
  if (location.hash === '#lgh=msg' && window.parent !== window) {
    window.__lghWartet = true;
    window.__lghBereit = new Promise(function (fertig) {
      var erledigt = false;
      function ende() { if (erledigt) return; erledigt = true; window.__lghWartet = false; window.removeEventListener('message', hoere); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } fertig(); }
      function hoere(e) {
        if (e.source !== window.parent || !e.data || e.data.lgh !== 'daten' || typeof e.data.json !== 'string') return;
        try {
          var o = JSON.parse(e.data.json);
          if (o && o.d && typeof o.d === 'object') for (var k in o.d) if (Object.prototype.hasOwnProperty.call(o.d, k)) localStorage.setItem(k, String(o.d[k]));
          try { window.parent.postMessage({ lgh: 'fertig' }, '*'); } catch (e2) { }
        } catch (e3) { }
        ende();
      }
      window.addEventListener('message', hoere);
      try { window.parent.postMessage({ lgh: 'hallo' }, '*'); } catch (e) { }
      setTimeout(ende, 15000);   // Hub antwortet nicht: ohne Stand weiterstarten (der Hub nimmt dann nichts von diesem Rahmen an)
    });
    return;
  }
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
