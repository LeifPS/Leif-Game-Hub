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

/*lgh-ton-start*/
/* Lautstärke aus dem Spielmenü des Hubs. Gehört ans Ende von lgh-vorlade.js (eingefügt von lgh-ton-einbauen.py), muss vor dem Spielcode laufen.
   Der Hub kann in ein fremdes Spiel nicht hineinregeln, also macht das Spiel mit: Dieser Teil meldet dem Hub {lgh:'ton-bereit'} und bekommt
   dann {lgh:'ton', v:0..1, stumm:bool}. Die Lautstärke wirkt auf
   - Web Audio: alles, was an den Ausgang (destination) angeschlossen wird, läuft über einen gemeinsamen Lautstärkeregler (ein GainNode je AudioContext),
   - <audio>, <video> und new Audio(): die tatsächliche Lautstärke ist die vom Spiel gewünschte (volume) mal die Hub-Lautstärke; das Spiel liest weiter
     seinen eigenen Wert zurück.
   Nicht erfasst: Sprachausgabe (speechSynthesis) und Ton, der von woanders kommt (Videos in fremden Iframes). Ohne Hub (kein Elternfenster) tut dieser Teil nichts. */
(function () {
  if (window.parent === window || window.__lghTon) return;
  var hub = { v: 1, stumm: false };
  function faktor() { return hub.stumm ? 0 : hub.v; }
  function klemm(x) { x = Number(x); return x > 1 ? 1 : x >= 0 ? x : 0; }

  /* --- Web Audio --- */
  var AN = window.AudioNode, ADN = window.AudioDestinationNode, OAC = window.OfflineAudioContext;
  var regler = typeof WeakMap === 'function' ? new WeakMap() : null, kontexte = [];
  function meister(ctx) {
    if (!regler || (OAC && ctx instanceof OAC)) return null;
    var g = regler.get(ctx);
    if (!g) {
      try {
        g = ctx.createGain(); g.gain.value = faktor();
        origConnect.call(g, ctx.destination);
        regler.set(ctx, g); kontexte.push(typeof WeakRef === 'function' ? new WeakRef(ctx) : ctx);
      } catch (e) { return null; }
    }
    return g;
  }
  var origConnect = AN && AN.prototype.connect, origDisconnect = AN && AN.prototype.disconnect;
  if (AN && ADN && origConnect && regler) {
    AN.prototype.connect = function (ziel, a, b) {
      if (ziel instanceof ADN) {
        var m = meister(ziel.context);
        if (m && this !== m) { origConnect.call(this, m, a, 0); return ziel; }
      }
      return origConnect.apply(this, arguments);
    };
    AN.prototype.disconnect = function (ziel) {
      if (ziel instanceof ADN) {
        var m = meister(ziel.context);
        if (m && this !== m) return origDisconnect.call(this, m);
      }
      return origDisconnect.apply(this, arguments);
    };
  }
  function reglerSetzen() {
    var f = faktor();
    kontexte = kontexte.filter(function (r) {
      var ctx = typeof WeakRef === 'function' && r instanceof WeakRef ? r.deref() : r;
      if (!ctx) return false;
      var g = regler.get(ctx);
      if (g) { try { g.gain.setTargetAtTime(f, ctx.currentTime, 0.015); } catch (e) { g.gain.value = f; } }
      return true;
    });
  }

  /* --- <audio> und <video> --- */
  var MEL = window.HTMLMediaElement, vd = MEL && Object.getOwnPropertyDescriptor(MEL.prototype, 'volume');
  var elemente = [];
  function elem(r) { return typeof WeakRef === 'function' && r instanceof WeakRef ? r.deref() : r; }
  function wirkung(el) {
    if (el.__lghGraph) return;   // läuft über Web Audio (createMediaElementSource), dort wirkt schon der gemeinsame Regler
    try { vd.set.call(el, klemm((el.__lghV === undefined ? vd.get.call(el) : el.__lghV) * faktor())); } catch (e) { }
  }
  function merke(el) {
    if (el.__lghM) return; el.__lghM = true;
    if (el.__lghV === undefined) { try { el.__lghV = vd.get.call(el); } catch (e) { el.__lghV = 1; } }
    elemente.push(typeof WeakRef === 'function' ? new WeakRef(el) : el);
    if (elemente.length > 400 && typeof WeakRef !== 'function') elemente.shift();
  }
  if (MEL && vd && vd.get && vd.set) {
    Object.defineProperty(MEL.prototype, 'volume', {
      configurable: true, enumerable: vd.enumerable,
      get: function () { return this.__lghM && this.__lghV !== undefined ? this.__lghV : vd.get.call(this); },
      set: function (v) { vd.set.call(this, v); merke(this); this.__lghV = klemm(v); wirkung(this); }
    });
    var origPlay = MEL.prototype.play;
    MEL.prototype.play = function () { merke(this); wirkung(this); return origPlay.apply(this, arguments); };
    // Elemente, die von selbst starten (autoplay), melden sich mit dem Ereignis "play"
    document.addEventListener('play', function (e) { if (e.target && e.target.nodeType === 1) { merke(e.target); wirkung(e.target); } }, true);
    if (window.AudioContext || window.webkitAudioContext) {
      [window.AudioContext, window.webkitAudioContext].forEach(function (C) {
        if (!C || !C.prototype.createMediaElementSource) return;
        var o = C.prototype.createMediaElementSource;
        C.prototype.createMediaElementSource = function (el) { try { if (el) { el.__lghGraph = true; if (el.__lghM && el.__lghV !== undefined) vd.set.call(el, el.__lghV); } } catch (e) { } return o.apply(this, arguments); };
      });
    }
  }
  function elementeSetzen() {
    elemente = elemente.filter(function (r) { var el = elem(r); if (!el) return false; wirkung(el); return true; });
  }

  function anwenden() { reglerSetzen(); elementeSetzen(); }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window.parent || !d || d.lgh !== 'ton' || typeof d.v !== 'number') return;
    hub.v = klemm(d.v); hub.stumm = !!d.stumm; anwenden();
  });
  window.__lghTon = {   // auch zum Prüfen: gemeinsamer Regler eines Kontexts, tatsächliche Lautstärke eines Elements
    faktor: faktor, regler: function (ctx) { return regler ? regler.get(ctx) || null : null; },
    wirklich: function (el) { return vd.get.call(el); }
  };
  function melden() { try { window.parent.postMessage({ lgh: 'ton-bereit' }, '*'); } catch (e) { } }
  melden();
  window.addEventListener('load', melden);
})();
/*lgh-ton-ende*/
