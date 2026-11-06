/* Einstellungen + Spielstand-Code (Teil der Leif-Spiele)
   Der Spielstand liegt im Browser (localStorage) und ist pro Adresse getrennt. Im Spiele-Hub läuft das Spiel eingebettet,
   dort sehen Browser einen eigenen, leeren Speicher. Mit dem Code lässt sich der Spielstand von einem Fenster ins andere kopieren.
   Die Einstellungen öffnen mit LGH.oeffnen(). Ohne eigenen Knopf des Spiels (window.LGH_EIGENER_KNOPF = true) erscheint ein Zahnrad unten in der Mitte.
   Das Spiel kann eigene Schalter ergänzen: window.LGH_ZEILEN = function () { return [{ text: 'Ton', an: true, setze: function (v) { } }]; }
   Format: LGH1.<spiel>.<z|p>.<prüfsumme>.<daten>   (z = komprimiert, p = unkomprimiert, Daten = Base64url von {Schlüssel: Wert}) */
(function () {
  var SPIEL = window.LGH_SPIEL || 'spiel';
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
    for (var k in o.d) if (Object.prototype.hasOwnProperty.call(o.d, k)) { if (ls instanceof Storage) setItem.call(ls, k, String(o.d[k])); else ls.setItem(k, String(o.d[k])); }
    if (window.parent !== window) { try { window.parent.postMessage({ lgh: 'stand', spiel: SPIEL, t: Date.now(), d: dump() }, '*'); } catch (e) { } }
    if (window.__lghMeldenAus) window.__lghMeldenAus();
    Storage.prototype.setItem = function () { };
    location.reload();
  }

  var hubOk = 0;
  function zeigeStatus() {
    var s = document.getElementById('lgh-sc-status'); if (!s) return;
    if (window.parent === window) { s.textContent = ''; return; }
    s.textContent = hubOk ? 'Im Spiele-Hub gesichert um ' + new Date(hubOk).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' Uhr.' : 'Noch nicht im Spiele-Hub gesichert.' + (window.__lghSpeicherErsatz ? ' (Der Browser sperrt hier den Speicher, der Hub übernimmt das Sichern.)' : '');
  }

  /* Eingebettet im Spiele-Hub: Änderungen am Speicher an den Hub melden, der sie dauerhaft aufbewahrt (siehe Vorlade-Skript). */
  if (window.parent !== window) {
    var timer = 0, sperre = false;
    var melden = function () {
      clearTimeout(timer); timer = 0;
      if (sperre) return;
      try { var d = dump(); if (Object.keys(d).length) window.parent.postMessage({ lgh: 'stand', spiel: SPIEL, t: Date.now(), d: d }, '*'); } catch (e) { }
    };
    var plan = function () { if (!timer) timer = setTimeout(melden, 800); };
    window.__lghAenderung = plan;
    var rem = Storage.prototype.removeItem, clr = Storage.prototype.clear;
    Storage.prototype.setItem = function () { var r = setItem.apply(this, arguments); if (this === ls) plan(); return r; };
    Storage.prototype.removeItem = function () { var r = rem.apply(this, arguments); if (this === ls) plan(); return r; };
    Storage.prototype.clear = function () { var r = clr.apply(this, arguments); if (this === ls) plan(); return r; };
    window.addEventListener('pagehide', melden);
    document.addEventListener('visibilitychange', function () { if (document.hidden) melden(); });
    setTimeout(melden, 1500);
    window.__lghMeldenAus = function () { sperre = true; window.__lghSperre = true; };
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || !e.data || e.data.lgh !== 'ok') return;
      hubOk = e.data.t; zeigeStatus();
    });
  }

  // Lage des Zahnrads: window.LGH_POS = 'bc' (unten Mitte, Standard), 'br', 'bl', 'tr', 'tl', 'mr' (rechts Mitte), 'ml'
  var P = window.LGH_POS || 'bc', S6 = '6px', SAFE_B = 'calc(6px + env(safe-area-inset-bottom,0px))', SAFE_T = 'calc(6px + env(safe-area-inset-top,0px))';
  var POS = { bc: 'left:50%;transform:translateX(-50%);bottom:' + SAFE_B + ';', br: 'right:' + S6 + ';bottom:' + SAFE_B + ';', bl: 'left:' + S6 + ';bottom:' + SAFE_B + ';',
    tr: 'right:' + S6 + ';top:' + SAFE_T + ';', tl: 'left:' + S6 + ';top:' + SAFE_T + ';', mr: 'right:' + S6 + ';top:50%;margin-top:-17px;', ml: 'left:' + S6 + ';top:50%;margin-top:-17px;' }[P] || '';
  if (window.LGH_OHNE_MENUE) { window.LGH = { oeffnen: function () { } }; return; }
  var css = document.createElement('style');
  css.textContent =
    '#lgh-sc-knopf{position:fixed;z-index:2147483000;' + POS + 'width:34px;height:34px;padding:0;display:grid;place-items:center;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(20,26,45,.72);color:#fff;opacity:.6;cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:manipulation}' +
    '#lgh-sc-knopf:hover,#lgh-sc-knopf:focus-visible{opacity:1}#lgh-sc-knopf svg{width:18px;height:18px}' +
    '#lgh-sc{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(5,8,18,.72);font:15px/1.45 system-ui,-apple-system,sans-serif;color:#e9eefb;-webkit-user-select:text;user-select:text;touch-action:auto}' +
    '#lgh-sc.offen{display:flex}' +
    '#lgh-sc .box{width:min(460px,100%);max-height:100%;overflow:auto;padding:18px;border-radius:16px;background:#151b2e;border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.6)}' +
    '#lgh-sc h2{margin:0 0 6px;font-size:18px}#lgh-sc p{margin:0 0 10px;color:#aab4cc;font-size:13.5px}' +
    '#lgh-sc h3{margin:14px 0 6px;font-size:14px}' +
    '#lgh-sc textarea{display:block;width:100%;height:84px;resize:none;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0d1220;color:#e9eefb;font:12px/1.3 ui-monospace,Menlo,monospace;-webkit-user-select:text;user-select:text;box-sizing:border-box}' +
    '#lgh-sc .zeile{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center}' +
    '#lgh-sc button{padding:9px 14px;border-radius:10px;border:0;background:#3b6df0;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer}' +
    '#lgh-sc button.leise{background:#2a3350}' +
    '#lgh-sc .opt{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1);font-size:14.5px}' +
    '#lgh-sc .opt button{min-width:64px;background:#2a3350}#lgh-sc .opt button[aria-pressed=true]{background:#3b6df0}' +
    '#lgh-sc .meldung{min-height:18px;font-size:13px;color:#8fe3a3}#lgh-sc .meldung.fehler{color:#ff9d9d}';
  document.head.appendChild(css);

  var knopf = document.createElement('button');
  knopf.id = 'lgh-sc-knopf'; knopf.type = 'button'; knopf.setAttribute('aria-label', 'Einstellungen');
  knopf.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5a7.7 7.7 0 0 0 .06-1.5 7.7 7.7 0 0 0-.06-1.5l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14.1 2h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z"/></svg>';
  var dlg = document.createElement('div');
  dlg.id = 'lgh-sc'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', 'Einstellungen');
  dlg.innerHTML =
    '<div class="box"><h2>Einstellungen</h2><div id="lgh-sc-zeilen"></div>' +
    '<h3>Spielstand</h3><p id="lgh-sc-status"></p>' +
    '<h3>Spielstand-Code</h3>' +
    '<p>Übertrage deinen Spielstand in ein anderes Fenster, zum Beispiel vom normalen Spiel-Link in den Spiele-Hub.</p>' +
    '<h3>1. Code aus diesem Fenster</h3><textarea id="lgh-sc-aus" readonly></textarea>' +
    '<div class="zeile"><button type="button" id="lgh-sc-kopieren">Code kopieren</button></div>' +
    '<h3>2. Code hier einfügen</h3><textarea id="lgh-sc-ein" placeholder="Code einfügen"></textarea>' +
    '<div class="zeile"><button type="button" id="lgh-sc-laden">Spielstand laden</button></div>' +
    '<p style="margin-top:8px">Beim Laden wird der Spielstand in diesem Fenster ersetzt.</p>' +
    '<div class="meldung" id="lgh-sc-meldung" aria-live="polite"></div>' +
    '<div class="zeile"><button type="button" class="leise" id="lgh-sc-zu">Schließen</button></div></div>';
  if (!window.LGH_EIGENER_KNOPF) document.body.appendChild(knopf);
  document.body.appendChild(dlg);

  function el(id) { return document.getElementById(id); }
  function meldung(t, fehler) { var m = el('lgh-sc-meldung'); m.textContent = t || ''; m.className = 'meldung' + (fehler ? ' fehler' : ''); }
  function zeilen() {
    var box = el('lgh-sc-zeilen'); box.innerHTML = '';
    var liste = []; try { liste = typeof window.LGH_ZEILEN === 'function' ? window.LGH_ZEILEN() || [] : []; } catch (e) { }
    liste.forEach(function (z) {
      var d = document.createElement('div'); d.className = 'opt';
      var t = document.createElement('span'); t.textContent = z.text;
      var b = document.createElement('button'); b.type = 'button';
      function zeige(an) { b.setAttribute('aria-pressed', an ? 'true' : 'false'); b.textContent = an ? 'An' : 'Aus'; }
      zeige(z.an);
      b.addEventListener('click', function () { var neu = b.getAttribute('aria-pressed') !== 'true'; z.setze(neu); zeige(neu); });
      d.appendChild(t); d.appendChild(b); box.appendChild(d);
    });
  }
  function auf() {
    zeilen(); zeigeStatus();
    meldung('');
    el('lgh-sc-ein').value = '';
    el('lgh-sc-aus').value = 'Wird erzeugt …';
    dlg.classList.add('offen');
    erzeuge().then(function (c) { el('lgh-sc-aus').value = c; }, function () { el('lgh-sc-aus').value = ''; meldung('Der Code konnte nicht erzeugt werden.', true); });
  }
  function zu() { dlg.classList.remove('offen'); }
  knopf.addEventListener('click', auf);
  window.LGH = { oeffnen: auf };
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
