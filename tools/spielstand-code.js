/* Spielstand-Code (Teil der Leif-Spiele)
   Der Spielstand liegt im Browser (localStorage) und ist pro Adresse getrennt. Im Spiele-Hub läuft das Spiel eingebettet,
   dort sehen Browser einen eigenen, leeren Speicher. Mit dem Code lässt sich der Spielstand von einem Fenster ins andere kopieren.
   Format: LGH1.<spiel>.<z|p>.<prüfsumme>.<daten>   (z = komprimiert, p = unkomprimiert, Daten = Base64url von {Schlüssel: Wert}) */
(function () {
  var SPIEL = 'schleimmerge';
  if (window.__lghSpielstandCode) return;
  window.__lghSpielstandCode = true;

  var ls;
  try { ls = window.localStorage; ls.length; } catch (e) { return; }
  var setItem = Storage.prototype.setItem;

  function dump() {
    var o = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); o[k] = ls.getItem(k); }
    return o;
  }
  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(t) {
    t = t.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var s = atob(t), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  function summe(t) {
    var h = 0;
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function pipe(bytes, Ctor, mode) {
    var st = new Ctor(mode), w = st.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(st.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  var KANN_ZIP = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  function erzeuge() {
    var roh = new TextEncoder().encode(JSON.stringify({ t: Date.now(), d: dump() }));
    var p = KANN_ZIP ? pipe(roh, CompressionStream, 'deflate-raw') : Promise.resolve(roh);
    return p.then(function (b) {
      var daten = toB64(b);
      return 'LGH1.' + SPIEL + '.' + (KANN_ZIP ? 'z' : 'p') + '.' + summe(daten) + '.' + daten;
    });
  }
  function lies(code) {
    var t = String(code || '').replace(/\s+/g, '');
    var m = /^LGH1\.([a-z0-9-]+)\.([zp])\.([a-z0-9]+)\.([A-Za-z0-9_-]+)$/.exec(t);
    if (!m) return Promise.reject(new Error('Das ist kein gültiger Spielstand-Code.'));
    if (m[1] !== SPIEL) return Promise.reject(new Error('Dieser Code gehört zu einem anderen Spiel.'));
    if (summe(m[4]) !== m[3]) return Promise.reject(new Error('Der Code ist unvollständig kopiert. Bitte noch einmal ganz kopieren.'));
    var bytes;
    try { bytes = fromB64(m[4]); } catch (e) { return Promise.reject(new Error('Der Code ist beschädigt.')); }
    var p;
    if (m[2] === 'z') {
      if (!KANN_ZIP) return Promise.reject(new Error('Dieser Browser kann den Code nicht lesen (zu alt).'));
      p = pipe(bytes, DecompressionStream, 'deflate-raw');
    } else p = Promise.resolve(bytes);
    return p.then(function (b) {
      var o = JSON.parse(new TextDecoder().decode(b));
      if (!o || typeof o.d !== 'object') throw new Error('Der Code ist beschädigt.');
      return o;
    }, function () { throw new Error('Der Code ist beschädigt.'); });
  }
  function einspielen(o) {
    // Das Spiel speichert ggf. beim Verlassen noch einmal. Das würde den neuen Stand überschreiben, deshalb Schreiben bis zum Neuladen sperren.
    for (var k in o.d) if (Object.prototype.hasOwnProperty.call(o.d, k)) setItem.call(ls, k, String(o.d[k]));
    Storage.prototype.setItem = function () { };
    location.reload();
  }

  var css = document.createElement('style');
  css.textContent =
    '#lgh-sc-knopf{position:fixed;z-index:2147483000;left:50%;transform:translateX(-50%);bottom:calc(3px + env(safe-area-inset-bottom,0px));padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(20,26,45,.72);color:#fff;font:600 11px/1 system-ui,-apple-system,sans-serif;opacity:.6;cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:manipulation}' +
    '#lgh-sc-knopf:hover,#lgh-sc-knopf:focus-visible{opacity:1}' +
    '#lgh-sc{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(5,8,18,.72);font:15px/1.45 system-ui,-apple-system,sans-serif;color:#e9eefb;-webkit-user-select:text;user-select:text;touch-action:auto}' +
    '#lgh-sc.offen{display:flex}' +
    '#lgh-sc .box{width:min(460px,100%);max-height:100%;overflow:auto;padding:18px;border-radius:16px;background:#151b2e;border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.6)}' +
    '#lgh-sc h2{margin:0 0 6px;font-size:18px}#lgh-sc p{margin:0 0 10px;color:#aab4cc;font-size:13.5px}' +
    '#lgh-sc h3{margin:14px 0 6px;font-size:14px}' +
    '#lgh-sc textarea{display:block;width:100%;height:84px;resize:none;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0d1220;color:#e9eefb;font:12px/1.3 ui-monospace,Menlo,monospace;-webkit-user-select:text;user-select:text;box-sizing:border-box}' +
    '#lgh-sc .zeile{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center}' +
    '#lgh-sc button{padding:9px 14px;border-radius:10px;border:0;background:#3b6df0;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer}' +
    '#lgh-sc button.leise{background:#2a3350}' +
    '#lgh-sc .meldung{min-height:18px;font-size:13px;color:#8fe3a3}#lgh-sc .meldung.fehler{color:#ff9d9d}';
  document.head.appendChild(css);

  var knopf = document.createElement('button');
  knopf.id = 'lgh-sc-knopf'; knopf.type = 'button'; knopf.textContent = 'Spielstand-Code';
  var dlg = document.createElement('div');
  dlg.id = 'lgh-sc'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', 'Spielstand-Code');
  dlg.innerHTML =
    '<div class="box"><h2>Spielstand-Code</h2>' +
    '<p>Hier kannst du deinen Spielstand in ein anderes Fenster übertragen, zum Beispiel vom normalen Spiel-Link in den Spiele-Hub.</p>' +
    '<h3>1. Code aus diesem Fenster</h3><textarea id="lgh-sc-aus" readonly></textarea>' +
    '<div class="zeile"><button type="button" id="lgh-sc-kopieren">Code kopieren</button></div>' +
    '<h3>2. Code hier einfügen</h3><textarea id="lgh-sc-ein" placeholder="Code einfügen"></textarea>' +
    '<div class="zeile"><button type="button" id="lgh-sc-laden">Spielstand laden</button></div>' +
    '<p style="margin-top:8px">Beim Laden wird der Spielstand in diesem Fenster ersetzt.</p>' +
    '<div class="meldung" id="lgh-sc-meldung" aria-live="polite"></div>' +
    '<div class="zeile"><button type="button" class="leise" id="lgh-sc-zu">Schließen</button></div></div>';
  document.body.appendChild(knopf);
  document.body.appendChild(dlg);

  function el(id) { return document.getElementById(id); }
  function meldung(t, fehler) { var m = el('lgh-sc-meldung'); m.textContent = t || ''; m.className = 'meldung' + (fehler ? ' fehler' : ''); }
  function auf() {
    meldung('');
    el('lgh-sc-ein').value = '';
    el('lgh-sc-aus').value = 'Wird erzeugt …';
    dlg.classList.add('offen');
    erzeuge().then(function (c) { el('lgh-sc-aus').value = c; }, function () { el('lgh-sc-aus').value = ''; meldung('Der Code konnte nicht erzeugt werden.', true); });
  }
  function zu() { dlg.classList.remove('offen'); }
  knopf.addEventListener('click', auf);
  el('lgh-sc-zu').addEventListener('click', zu);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) zu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dlg.classList.contains('offen')) zu(); });
  el('lgh-sc-kopieren').addEventListener('click', function () {
    var ta = el('lgh-sc-aus'), t = ta.value;
    if (!t || t.indexOf('LGH1.') !== 0) return;
    function fallback() {
      ta.focus(); ta.select(); ta.setSelectionRange(0, t.length);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { }
      meldung(ok ? 'Code kopiert.' : 'Bitte den markierten Code selbst kopieren.', !ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { meldung('Code kopiert.'); }, fallback);
    else fallback();
  });
  el('lgh-sc-laden').addEventListener('click', function () {
    lies(el('lgh-sc-ein').value).then(function (o) {
      var wann = o.t ? new Date(o.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'unbekannt';
      if (window.confirm('Spielstand vom ' + wann + ' laden? Der Spielstand in diesem Fenster wird ersetzt.')) einspielen(o);
    }, function (e) { meldung(e.message, true); });
  });
})();
