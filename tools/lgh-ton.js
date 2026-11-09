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
