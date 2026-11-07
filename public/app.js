(function () {
  'use strict';

  var spiele = [];
  var suche = '';
  var filter = 'Alle';
  var homeScroll = 0;
  var aktuell = null;
  var hinweisTimer = null;
  var artZaehler = 0;
  var versionen = {};
  var logCache = {};
  var LOG_SEITE = 8;
  var ARTEN = { start: 'Start', major: 'Major', minor: 'Minor', patch: 'Patch', build: 'Build' };

  var body = document.body;
  var inhalt = document.getElementById('inhalt');
  var bibliothek = document.getElementById('bibliothek');
  var rahmen = document.getElementById('rahmen');
  var buehne = document.getElementById('buehne');
  var hinweis = document.getElementById('hinweis');

  /* ---------- Hilfsfunktionen ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Version ohne überflüssige Nullen am Ende (mindestens Major.Minor): 0.1.0.0 → 0.1, 1.2.4.0 → 1.2.4, 0.1.0.1 bleibt 0.1.0.1
  function vz(v) { var t = String(v || '').split('.'); while (t.length > 2 && t[t.length - 1] === '0') t.pop(); return t.join('.'); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hexToHue(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return 215;
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return h;
  }
  function hsl(h, s, l, a) { h = ((h % 360) + 360) % 360; return a == null ? 'hsl(' + h.toFixed(0) + ',' + s + '%,' + l + '%)' : 'hsla(' + h.toFixed(0) + ',' + s + '%,' + l + '%,' + a + ')'; }
  var datumFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
  var tagFmt = new Intl.DateTimeFormat('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Berlin' });
  function tagKey(iso) { return tagFmt.format(new Date(iso)); }
  function datumText(iso) { return datumFmt.format(new Date(iso)); }
  function ver(sp) { return versionen[sp.id] || null; }
  function kategorien(sp) { return sp.kategorien || []; }
  function spielbar() { return spiele.filter(function (s) { return s.url; }); }
  function alphabetisch() { return sortiert().slice().sort(function (x, y) { return x.name.localeCompare(y.name, 'de', { numeric: true, sensitivity: 'base' }); }); }
  function sortiert() { return spielbar().concat(spiele.filter(function (s) { return !s.url; })); }

  /* ---------- Automatisch gezeichnete Titelbilder (Platzhalter, bis es echte Bilder gibt: Feld "bild" in games.json) ---------- */
  function art(sp, W, H) {
    if (sp.wallpaper && W / H > 1.6) return '<img class="art" src="' + esc(sp.wallpaper) + '" alt="" style="object-position:' + esc(sp.fokus || '60% 50%') + '" decoding="async">';
    if (sp.icon && W === H) return '<img class="art" src="' + esc(sp.icon) + '" alt="" loading="lazy" decoding="async">';
    if (sp.icon) return '<div class="art icon-art"><img class="bg" src="' + esc(sp.icon) + '" alt="" decoding="async"><img class="fg" src="' + esc(sp.icon) + '" alt="" decoding="async"></div>';
    var bild = (W / H > 1.6 && sp.banner) ? sp.banner : sp.bild;
    if (bild) return '<img class="art" src="' + esc(bild) + '" alt="" loading="lazy" decoding="async">';
    var uid = 'g' + (artZaehler++);
    var seed = hash(sp.id), r = rng(seed);
    var h = hexToHue(sp.farbe), S = Math.min(W, H), M = Math.max(W, H);
    var c1 = hsl(h, 58, 40), c2 = hsl(h + 34, 64, 14), c3 = hsl(h + 46, 85, 68, .28), c4 = 'rgba(255,255,255,.07)';
    var s = '<svg class="art" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
    s += '<defs><linearGradient id="' + uid + 'l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient>';
    s += '<radialGradient id="' + uid + 'r"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>';
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + uid + 'l)"/>';
    var stil = seed % 4, i;
    if (stil === 0) {
      for (i = 0; i < 4; i++) s += '<circle cx="' + (r() * W).toFixed(0) + '" cy="' + (r() * H).toFixed(0) + '" r="' + (S * (0.35 + r() * 0.55)).toFixed(0) + '" fill="' + (i % 2 ? c4 : c3) + '"/>';
    } else if (stil === 1) {
      var step = S * 0.22;
      for (var x = -H; x < W + H; x += step) s += '<path d="M' + x.toFixed(0) + ' ' + H + 'L' + (x + H).toFixed(0) + ' 0" stroke="rgba(255,255,255,.07)" stroke-width="' + (S * 0.07).toFixed(0) + '"/>';
      s += '<circle cx="' + (W * (0.3 + r() * 0.4)).toFixed(0) + '" cy="' + (H * (0.25 + r() * 0.3)).toFixed(0) + '" r="' + (S * 0.3).toFixed(0) + '" fill="' + c3 + '"/>';
    } else if (stil === 2) {
      var cx = W * (0.3 + r() * 0.5), cy = H * (0.25 + r() * 0.4);
      for (i = 1; i <= 6; i++) s += '<circle cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" r="' + (S * 0.17 * i).toFixed(0) + '" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="' + Math.max(2, S * 0.012).toFixed(1) + '"/>';
      s += '<circle cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" r="' + (S * 0.13).toFixed(0) + '" fill="' + c3 + '"/>';
    } else {
      for (i = 0; i < 3; i++) {
        var px = r() * W, py = r() * H, q = S * (0.5 + r() * 0.5), p = '';
        for (var k = 0; k < 3; k++) { var a = r() * Math.PI * 2; p += (px + Math.cos(a) * q).toFixed(0) + ',' + (py + Math.sin(a) * q).toFixed(0) + ' '; }
        s += '<polygon points="' + p + '" fill="' + (i % 2 ? c4 : c3) + '"/>';
      }
    }
    s += '<circle cx="' + (W * r()).toFixed(0) + '" cy="' + (H * r() * 0.5).toFixed(0) + '" r="' + M + '" fill="url(#' + uid + 'r)"/>';
    return s + '</svg>';
  }

  /* ---------- Bausteine ---------- */
  function pills(sp) { return '<div class="pills">' + kategorien(sp).map(function (k) { return '<span class="pill">' + esc(k) + '</span>'; }).join('') + '</div>'; }
  function playIcon() { return '<svg aria-hidden="true"><use href="#i-play"/></svg>'; }

  // Entwicklungsstand: Alpha (games.json: "phase": "alpha"), sonst Beta, ab 1.0 Offiziell
  function phaseName(sp, v) { return v && v.offiziell ? 'Offiziell' : sp.phase === 'alpha' ? 'Alpha' : 'Beta'; }
  function tile(sp) {
    var offen = !!sp.url, detail = offen || !!sp.wartung, id = encodeURIComponent(sp.id), v = ver(sp);   // Spiele in Wartung haben weiter ihre Detailseite, nur Spielen geht nicht
    var s = '<article class="tile' + (offen ? '' : ' off') + '">';
    s += detail ? '<a class="tile-link" href="#spiel/' + id + '" aria-label="' + esc(sp.name) + '">' : '<div class="tile-link">';
    s += '<div class="tile-art">' + art(sp, 400, 400);
    if (!offen) s += '<span class="badge">' + (sp.wartung ? 'Wartung' : 'Bald') + '</span>';
    else if (v) s += '<span class="ver-tag">' + (v.offiziell ? '' : phaseName(sp, v) + ' ') + esc(vz(v.version)) + '</span>';
    s += '</div>';
    s += '<div class="tile-text"><strong>' + esc(sp.name) + '</strong><span>' + esc(kategorien(sp).join(', ')) + '</span></div>';
    s += detail ? '</a>' : '</div>';
    if (offen) s += '<a class="play" href="#spiel/' + id + '/play" aria-label="' + esc(sp.name) + ' spielen">' + playIcon() + '</a>';
    return s + '</article>';
  }

  function passt(sp) {
    if (filter !== 'Alle' && kategorien(sp).indexOf(filter) < 0) return false;
    if (!suche) return true;
    return (sp.name + ' ' + (sp.text || '') + ' ' + kategorien(sp).join(' ')).toLowerCase().indexOf(suche) >= 0;
  }

  /* ---------- Ansichten ---------- */
  var seiteFertig = false;
  function renderSide(aktivId, freundeAktiv) {
    if (seiteFertig) {
      var as = bibliothek.querySelectorAll('.lib-item');
      for (var i = 0; i < as.length; i++) {
        var hr = as[i].getAttribute('href');
        var ist = hr === '#freunde' ? !!freundeAktiv : hr === '#' ? (!aktivId && !freundeAktiv) : (aktivId && hr === '#spiel/' + encodeURIComponent(aktivId));
        as[i].classList.toggle('aktiv', !!ist);
      }
      return;
    }
    seiteFertig = true;
    var s = '<a class="lib-item' + (aktivId ? '' : ' aktiv') + '" href="#"><span class="lib-home-icon"><svg width="20" height="20" aria-hidden="true"><use href="#i-home"/></svg></span><span class="name">Startseite</span></a>';
    s += '<a class="lib-item' + (freundeAktiv ? ' aktiv' : '') + '" href="#freunde"><span class="lib-home-icon"><svg width="20" height="20" aria-hidden="true"><use href="#i-people"/></svg></span><span class="name">Freunde</span><span class="freunde-abz" hidden></span></a>';
    s += '<div class="nav-label">Bibliothek</div>';
    alphabetisch().forEach(function (sp) {
      var offen = !!sp.url;
      var inner = '<span class="lib-icon">' + art(sp, 100, 100) + '</span><span class="name">' + esc(sp.name) + '</span>' + (offen ? '' : '<small>' + (sp.wartung ? 'Wartung' : 'Bald') + '</small>');
      s += offen || sp.wartung
        ? '<a class="lib-item' + (offen ? '' : ' off') + (sp.id === aktivId ? ' aktiv' : '') + '" href="#spiel/' + encodeURIComponent(sp.id) + '">' + inner + '</a>'
        : '<div class="lib-item off">' + inner + '</div>';
    });
    bibliothek.innerHTML = s;
    if (window.LghKonto) LghKonto.abzeichen();
    var n = spielbar().length;
    document.getElementById('side-fuss').innerHTML = n + (n === 1 ? ' Spiel' : ' Spiele') + ' spielbar · <a href="kontakt.html">Kontakt</a> · <a href="credits.html">Quellen</a>';
  }

  function renderHome() {
    var liste = sortiert().filter(passt);
    var hero = null;
    if (filter === 'Alle' && !suche) hero = spielbar().filter(function (s) { return s.featured; })[0] || spielbar()[0];
    var h = '';
    if (hero && hero.wallpaper) {
      h += '<section class="hero hero-titel" aria-label="Empfohlen"><h1 class="sr-only">' + esc(hero.name) + '</h1>';
      h += '<a class="hero-bild" href="#spiel/' + encodeURIComponent(hero.id) + '"><img src="' + esc(hero.wallpaper) + '" alt="' + esc(hero.name) + '" decoding="async"></a>';
      h += '<div class="hero-leiste"><div class="hero-text"><p>' + esc(hero.text) + '</p></div>';
      h += '<div class="btn-row"><a class="btn btn-primary" href="#spiel/' + encodeURIComponent(hero.id) + '/play">' + playIcon() + 'Jetzt spielen</a>';
      h += '<a class="btn btn-ghost" href="#spiel/' + encodeURIComponent(hero.id) + '">Mehr erfahren</a></div></div></section>';
    } else if (hero) {
      h += '<section class="hero" aria-label="Empfohlen">' + art(hero, 1200, 480) + '<div class="hero-body">';
      h += '<h1>' + esc(hero.name) + '</h1><p>' + esc(hero.text) + '</p>';
      h += '<div class="btn-row"><a class="btn btn-primary" href="#spiel/' + encodeURIComponent(hero.id) + '/play">' + playIcon() + 'Jetzt spielen</a>';
      h += '<a class="btn btn-ghost" href="#spiel/' + encodeURIComponent(hero.id) + '">Mehr erfahren</a></div></div></section>';
    }
    var alle = {};
    spiele.forEach(function (sp) { kategorien(sp).forEach(function (k) { alle[k] = 1; }); });
    var chips = ['Alle'].concat(Object.keys(alle).sort(function (a, b) { return a.localeCompare(b, 'de'); }));
    h += '<div class="abschnitt"><h2>' + (suche ? 'Suchergebnisse' : 'Alle Spiele') + '</h2><span class="zahl">' + liste.length + '</span>';
    h += '<div class="chips" role="group" aria-label="Kategorien">' + chips.map(function (k) {
      return '<button type="button" class="chip" data-k="' + esc(k) + '" aria-pressed="' + (k === filter) + '">' + esc(k) + '</button>';
    }).join('') + '</div></div>';
    h += '<div class="grid">' + (liste.length ? liste.map(tile).join('') : '<div class="leer">Keine Spiele gefunden.</div>') + '</div>';
    inhalt.innerHTML = h;
  }

  var SCHRIFTEN = { fredoka: 700, cinzel: 900, lilita: 400, anton: 400, bangers: 400, marker: 400, silkscreen: 700 };
  function schriftAttr(sp) {
    var t = sp.schrift;
    if (!t || !SCHRIFTEN[t.familie]) return null;
    var st = "font-family:'T-" + t.familie + "',system-ui,sans-serif;font-weight:" + SCHRIFTEN[t.familie] + ';letter-spacing:' + (t.abstand || 0) + 'em' + (t.versalien ? ';text-transform:uppercase' : '');
    if (t.fuell) st += ';--fuell:' + t.fuell;
    if (t.rand) st += ';--rand:' + t.rand + ';--randbreite:' + (t.randbreite || 0.1) + 'em';
    return st;
  }
  function titelHtml(sp) {
    var st = schriftAttr(sp), n = esc(sp.name);
    if (!st) return '<h1>' + n + '</h1>';
    return '<h1 class="titelschrift" style="' + st + '"><span class="tt"><span class="tt-b" aria-hidden="true">' + n + '</span><span class="tt-f">' + n + '</span></span></h1>';
  }

  /* ---------- Detailseite im Stil einer Shop-Seite ---------- */
  /* Der Galerie-Zustand hängt am Galerie-Element der jeweiligen Detailseite (nicht an einer globalen Variable):
     Detailseiten bleiben als fertige Knoten gespeichert und werden beim Zurückkehren wieder eingehängt, ohne neu gebunden zu werden. */
  var GALERIE_LEER = { liste: [], i: 0, name: '' };
  function G() { var r = document.querySelector('.gal'); return (r && r._g) || GALERIE_LEER; }
  /* Einträge der Galerie: Text = Bild-Adresse, Objekt {video, poster} = Trailer (läuft stumm von allein, Klick schaltet den Ton ein) */
  function bilderVon(sp) {
    var l = (sp.screenshots && sp.screenshots.length) ? sp.screenshots.slice() : (sp.banner ? [sp.banner] : []);
    if (sp.trailer && sp.trailer.video) l.unshift({ video: sp.trailer.video, poster: sp.trailer.poster || '' });
    return l;
  }
  function istVideo(it) { return !!it && typeof it === 'object'; }
  function bildUrl(it) { return istVideo(it) ? it.poster : it; }
  function galerieHtml(sp) {
    var b = bilderVon(sp);
    if (!b.length) return '';
    var v0 = istVideo(b[0]);
    var h = '<div class="gal" aria-label="Screenshots"><div class="gal-haupt">';
    h += '<button type="button" class="gal-bild" id="gal-bild" aria-label="Screenshot vergrößern"' + (v0 ? ' hidden' : '') + '><img id="gal-img" src="' + esc(bildUrl(b[0])) + '" alt="' + (v0 ? 'Trailer von ' : 'Screenshot 1 von ') + esc(sp.name) + '" decoding="async"></button>';
    if (b.some(istVideo)) {
      var vv = b.filter(istVideo)[0];
      h += '<div class="gal-video" id="gal-video-box"' + (v0 ? '' : ' hidden') + '><video id="gal-video" muted loop playsinline preload="metadata" poster="' + esc(vv.poster) + '" src="' + esc(vv.video) + '"' + (v0 ? ' autoplay' : '') + ' aria-label="Trailer von ' + esc(sp.name) + '"></video>' +
        '<button type="button" class="gal-ton" id="gal-ton" aria-label="Ton einschalten">Ton an</button>' +
        '<button type="button" class="gal-voll" id="gal-voll" aria-label="Vollbild">&#x26F6;</button></div>';
    }
    if (b.length > 1) h += '<button type="button" class="gal-pfeil links" id="gal-zu" aria-label="Voriger Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button><button type="button" class="gal-pfeil rechts" id="gal-vor" aria-label="Nächster Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button>';
    h += '</div>';
    if (b.length > 1) {
      h += '<div class="gal-reihe" id="gal-reihe" role="tablist">' + b.map(function (u, k) {
        return '<button type="button" class="gal-mini' + (k === 0 ? ' aktiv' : '') + (istVideo(u) ? ' video' : '') + '" data-k="' + k + '" role="tab" aria-label="' + (istVideo(u) ? 'Trailer' : 'Screenshot ' + k) + '"><img src="' + esc(bildUrl(u)) + '" alt="" loading="lazy" decoding="async">' + (istVideo(u) ? '<span class="gal-play" aria-hidden="true"></span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    return h + '</div>';
  }
  function tonAnzeige() {
    var v = document.getElementById('gal-video'), t = document.getElementById('gal-ton');
    if (v && t) { t.textContent = v.muted ? 'Ton an' : 'Ton aus'; t.setAttribute('aria-label', v.muted ? 'Ton einschalten' : 'Ton ausschalten'); }
  }
  /* Video nur laufen lassen, wenn die Detailseite mit Trailer gerade sichtbar ist (sonst würde der Ton im Hintergrund weiterlaufen) */
  function videoSteuern() {
    var v = document.getElementById('gal-video'), g = G();
    var soll = !!v && body.getAttribute('data-view') === 'detail' && istVideo(g.liste[g.i]);
    var alle = document.querySelectorAll('video');
    for (var j = 0; j < alle.length; j++) if (!(soll && alle[j] === v)) { alle[j].pause(); alle[j]._lief = false; }
    /* Wer die Detailseite (oder den Trailer-Reiter) neu öffnet, sieht den Trailer wieder von vorne */
    if (soll) { v.muted = true; tonAnzeige(); if (!v._lief) { try { v.currentTime = 0; } catch (e) { } } v._lief = true; var pr = v.play(); if (pr && pr.catch) pr.catch(function () { }); }
  }
  function galerieZeige(k, richtung) {
    var n = G().liste.length;
    if (!n) return;
    var lbAuf = document.getElementById('lightbox') && document.getElementById('lightbox').classList.contains('offen');
    k = (k + n) % n;
    if (lbAuf && istVideo(G().liste[k]) && n > 1) return galerieZeige(k + (richtung || 1), richtung || 1);   // in der Großansicht gibt es nur Bilder
    G().i = k;
    var it = G().liste[k];
    var img = document.getElementById('gal-img'), bildBtn = document.getElementById('gal-bild'), box = document.getElementById('gal-video-box');
    if (box) box.hidden = !istVideo(it);
    if (bildBtn) bildBtn.hidden = istVideo(it);
    if (!istVideo(it) && img) { img.src = it; img.alt = 'Screenshot ' + (G().i + 1) + ' von ' + G().name; }
    var minis = document.querySelectorAll('.gal-mini');
    for (var j = 0; j < minis.length; j++) {
      var an = j === G().i;
      minis[j].classList.toggle('aktiv', an);
      if (an && minis[j].scrollIntoView) { var r = document.getElementById('gal-reihe'); if (r) r.scrollTo({ left: minis[j].offsetLeft - r.clientWidth / 2 + minis[j].clientWidth / 2, behavior: 'smooth' }); }
    }
    videoSteuern();
    var lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('offen') && !istVideo(it)) document.getElementById('lb-img').src = it;
  }
  function galerieBinden(sp) {
    var wurzel = document.querySelector('.gal');
    if (!wurzel) return;
    wurzel._g = { liste: bilderVon(sp), i: 0, name: sp.name };
    if (!wurzel._g.liste.length) return;
    var reihe = document.getElementById('gal-reihe');
    if (reihe) reihe.addEventListener('click', function (e) { var m = e.target.closest('.gal-mini'); if (m) galerieZeige(+m.getAttribute('data-k')); });
    var vor = document.getElementById('gal-vor'), zu = document.getElementById('gal-zu');
    if (vor) vor.addEventListener('click', function () { galerieZeige(G().i + 1, 1); });
    if (zu) zu.addEventListener('click', function () { galerieZeige(G().i - 1, -1); });
    var bild = document.getElementById('gal-bild'), haupt = wurzel.querySelector('.gal-haupt');
    bild.addEventListener('click', lightboxAuf);
    var vid = document.getElementById('gal-video'), ton = document.getElementById('gal-ton'), voll = document.getElementById('gal-voll');
    if (vid) {
      var umschalten = function () { vid.muted = !vid.muted; if (!vid.muted) { vid.volume = 1; var pr = vid.play(); if (pr && pr.catch) pr.catch(function () { }); } tonAnzeige(); };
      vid.addEventListener('click', umschalten);
      ton.addEventListener('click', umschalten);
      voll.addEventListener('click', function () { var f = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.webkitEnterFullscreen; if (f) { try { f.call(vid); } catch (e) { } } });
    }
    var x0 = null;
    haupt.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    haupt.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) { galerieZeige(G().i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); haupt.setAttribute('data-wisch', '1'); setTimeout(function () { haupt.removeAttribute('data-wisch'); }, 300); }
    });
    haupt.addEventListener('click', function (e) { if (haupt.getAttribute('data-wisch')) e.stopImmediatePropagation(); }, true);
  }
  function lightboxAuf() {
    var lb = document.getElementById('lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Screenshot');
      lb.innerHTML = '<button type="button" class="lb-zu" aria-label="Schließen">&times;</button><button type="button" class="gal-pfeil links" id="lb-zurueck" aria-label="Voriger Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button><img id="lb-img" alt=""><button type="button" class="gal-pfeil rechts" id="lb-weiter" aria-label="Nächster Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button>';
      document.body.appendChild(lb);
      lb.addEventListener('click', function (e) {
        if (e.target.id === 'lb-zurueck') galerieZeige(G().i - 1, -1);
        else if (e.target.closest && e.target.closest('#lb-zurueck')) galerieZeige(G().i - 1, -1);
        else if (e.target.closest && e.target.closest('#lb-weiter')) galerieZeige(G().i + 1, 1);
        else if (e.target.id !== 'lb-img') lightboxZu();
      });
    }
    lb.querySelector('#lb-img').src = bildUrl(G().liste[G().i]);
    var mehrere = G().liste.filter(function (u) { return !istVideo(u); }).length > 1;
    lb.querySelector('#lb-zurueck').style.display = lb.querySelector('#lb-weiter').style.display = mehrere ? '' : 'none';
    lb.classList.add('offen');
  }
  function lightboxZu() { var lb = document.getElementById('lightbox'); if (lb) lb.classList.remove('offen'); }
  document.addEventListener('keydown', function (e) {
    var lb = document.getElementById('lightbox');
    var offen = lb && lb.classList.contains('offen');
    if (e.key === 'Escape' && offen) lightboxZu();
    else if (e.key === 'ArrowRight' && (offen || document.getElementById('gal-img'))) galerieZeige(G().i + 1, 1);
    else if (e.key === 'ArrowLeft' && (offen || document.getElementById('gal-img'))) galerieZeige(G().i - 1, -1);
  });

  function faktZeile(k, v) { return v ? '<div class="fakt"><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>' : ''; }
  function aehnliche(sp) {
    var meine = kategorien(sp);
    return spielbar().filter(function (s) { return s.id !== sp.id; }).map(function (s) {
      var gem = kategorien(s).filter(function (k) { return meine.indexOf(k) >= 0; }).length;
      return { s: s, gem: gem };
    }).sort(function (a, b) { return b.gem - a.gem; }).slice(0, 6).map(function (x) { return x.s; });
  }

  function renderDetail(sp) {
    var id = encodeURIComponent(sp.id);
    var titel = !!sp.wallpaper;
    var v = ver(sp);
    var online = kategorien(sp).indexOf('Online') >= 0;
    var h = '<div class="detail-banner' + (titel ? ' titel' : '') + '">' + (titel ? '<img class="titelbild" src="' + esc(sp.wallpaper) + '" alt="' + esc(sp.name) + '" decoding="async">' : art(sp, 1400, 420)) + '<a class="zurueck-link" href="#"><svg aria-hidden="true"><use href="#i-back"/></svg>Alle Spiele</a></div>';
    h += '<div class="shop' + (titel ? ' titel' : '') + '">';
    h += '<div class="shop-titelzeile">' + titelHtml(sp) + '<div class="spiel-aktion"><div class="spielinfo" hidden></div>' + (sp.url ? '<a class="btn btn-primary btn-spielen" href="#spiel/' + id + '/play">' + playIcon() + 'Spielen</a>' : '<span class="btn btn-spielen gesperrt" aria-disabled="true">Wartung</span>') + '</div></div>';
    var gal = galerieHtml(sp);
    var text = (sp.beschreibung && sp.beschreibung !== sp.text) ? '<section class="shop-text"><h2>Über dieses Spiel</h2><p>' + esc(sp.beschreibung) + '</p></section>' : '';
    h += '<div class="shop-oben' + (gal ? '' : ' ohne-galerie') + '">' + (gal ? '<div class="shop-haupt">' + gal + text + '</div>' : '');
    h += '<aside class="shop-info"><div class="shop-kopf"><div class="shop-icon">' + art(sp, 300, 300) + '</div><p class="kurz">' + esc(sp.text) + '</p></div><dl class="fakten">';
    if (v && v.erste) h += faktZeile('Erschienen', esc(datumText(v.erste)));
    if (sp.offiziell_ab) {
      var vorbei = sp.offiziell_ab <= new Date().toISOString().slice(0, 10);
      h += faktZeile(vorbei ? 'Offiziell seit' : 'Offiziell ab', esc(datumText(sp.offiziell_ab + 'T12:00:00+02:00')));
    }
    if (v) h += faktZeile('Status', '<span class="ver-pill' + (v.offiziell ? ' offiziell' : sp.phase === 'alpha' ? ' alpha' : '') + '">' + phaseName(sp, v) + '</span> Version ' + esc(vz(v.version)));
    if (v && v.datum) h += faktZeile('Zuletzt aktualisiert', esc(datumText(v.datum)));
    h += faktZeile('Entwickler', 'Leif (LeifPS)');
    h += faktZeile('Spielmodus', online ? 'Mehrspieler (online)' : 'Einzelspieler');
    h += faktZeile('Plattform', 'Browser · Deutsch');
    h += '</dl>';
    if (kategorien(sp).length) h += '<div class="tags-titel">Beliebte Tags</div>' + pills(sp);
    h += '</aside></div>';
    if (!gal) h += text;
    h += '<section class="log" id="log"><h2>Neuigkeiten und Updates</h2><div class="log-liste" id="log-liste"><div class="log-leer">Lädt …</div></div></section>';
    h += '<details class="sysreq"><summary>Systemanforderungen</summary><ul><li>Läuft direkt im Browser, ohne Download und ohne Installation.</li><li>Aktueller Browser (Chrome, Safari, Edge oder Firefox) auf PC, Handy oder Tablet.</li><li>Bedienung mit Maus oder Touch.</li>' + (online ? '<li>Internetverbindung erforderlich.</li>' : '') + '</ul></details>';
    var mehr = aehnliche(sp);
    if (mehr.length) h += '<section class="mehr"><h2>Ähnliche Spiele</h2><div class="grid">' + mehr.map(tile).join('') + '</div></section>';
    inhalt.innerHTML = h + '</div>';
    galerieBinden(sp);
    ladeLog(sp);
  }

  /* ---------- Update-Log ---------- */
  function ladeLog(sp) {
    var ziel = document.getElementById('log-liste');
    if (!ver(sp)) { ziel.innerHTML = '<div class="log-leer">Für dieses Spiel gibt es noch keinen Update-Log.</div>'; return; }
    var fertig = function (d) { if (aktuell === null && document.getElementById('log-liste') === ziel) zeigeLog(sp, ziel, d.eintraege || [], LOG_SEITE); };
    if (logCache[sp.id]) return fertig(logCache[sp.id]);
    fetch('changelog/' + encodeURIComponent(sp.id) + '.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { logCache[sp.id] = d; fertig(d); })
      .catch(function () { ziel.innerHTML = '<div class="log-leer">Der Update-Log konnte nicht geladen werden.</div>'; });
  }
  function zeigeLog(sp, ziel, liste, anzahl) {
    var sicht = liste.slice(0, anzahl), h = '', tag = null;
    sicht.forEach(function (e) {
      var k = tagKey(e.datum);
      if (k !== tag) { tag = k; h += '<div class="log-tag">' + esc(datumText(e.datum)) + '</div>'; }
      var art = ARTEN[e.art] ? e.art : 'build';
      h += '<div class="log-eintrag"><span class="log-v">' + esc(vz(e.v)) + '</span><span class="log-art ' + art + '">' + ARTEN[art] + '</span><span class="log-text">' + esc(e.text) + '</span>';
      if (!sp.privat && sp.repo && e.sha) h += '<a class="log-sha" href="https://github.com/' + esc(sp.repo) + '/commit/' + esc(e.sha) + '" target="_blank" rel="noopener" aria-label="Commit ansehen">' + esc(e.sha.slice(0, 7)) + '</a>';
      h += '</div>';
    });
    if (liste.length > anzahl) h += '<button type="button" class="btn btn-ghost log-mehr" data-mehr="' + (anzahl + LOG_SEITE) + '">Mehr laden (' + (liste.length - anzahl) + ' weitere)</button>';
    ziel.innerHTML = h;
    var b = ziel.querySelector('.log-mehr');
    if (b) b.addEventListener('click', function () { zeigeLog(sp, ziel, liste, parseInt(b.getAttribute('data-mehr'), 10)); });
  }

  /* ---------- Spieleansicht ---------- */
  // Der iframe wird jedes Mal komplett ersetzt, damit er keine eigenen Einträge im Browser-Verlauf anlegt.
  /* Ein verlassenes Spiel bleibt noch kurz (versteckt) am Leben: Das Spiel meldet Änderungen mit bis zu 0,8 s Verzögerung an den Hub.
     Würde der Rahmen sofort entfernt, ginge die letzte Änderung verloren. Die Meldungen der abgehenden Rahmen nimmt der Hub weiter an. */
  var ABGANG_MS = 1300;
  var abgehende = [];   // { fenster, id, url }
  function neuerRahmen(url, beiLaden, sp, uebergabe) {
    var alt = rahmen, n = alt.cloneNode(false);
    // Große Stände gehen nicht durch die Adresse (siehe standUebergabe): entweder als window.name des Rahmens oder per postMessage ins Spiel
    n._uebergabe = uebergabe && uebergabe.json ? { json: uebergabe.json, art: uebergabe.art, fertig: false } : null;
    n.removeAttribute('src');
    if (n._uebergabe && n._uebergabe.art === 'name') n.name = 'lgh:' + n._uebergabe.json; else n.removeAttribute('name');
    if (n._uebergabe) {
      // Meldet das Spiel nicht binnen 6 Sekunden nach dem Laden, dass es den Stand übernommen hat (z. B. ältere Spielversion), sagt der Hub das.
      var u = n._uebergabe;
      n.addEventListener('load', function () { setTimeout(function () { if (!u.fertig && n.parentNode && aktuell && rahmen === n) zeigeStandHinweis(); }, 6000); });
    }
    if (sp) { n.setAttribute('data-sid', sp.id); n.setAttribute('data-surl', sp.url); }
    else { n.removeAttribute('data-sid'); n.removeAttribute('data-surl'); }
    if (beiLaden) n.addEventListener('load', beiLaden);
    if (url) n.src = url;
    var sid = alt.getAttribute('data-sid'), fenster = alt.contentWindow;
    if (sid && fenster && alt.getAttribute('src')) {
      var eintrag = { fenster: fenster, id: sid, url: alt.getAttribute('data-surl'), el: alt };
      abgehende.push(eintrag);
      alt.removeAttribute('id'); alt.style.display = 'none'; alt.setAttribute('aria-hidden', 'true'); alt.setAttribute('tabindex', '-1');
      alt.parentNode.insertBefore(n, alt);
      setTimeout(function () {
        abgehende = abgehende.filter(function (x) { return x !== eintrag; });
        if (alt.parentNode) alt.parentNode.removeChild(alt);
      }, ABGANG_MS);
    } else alt.parentNode.replaceChild(n, alt);
    rahmen = n;
  }
  /* Spielstand im Hub: Spiele laufen hier eingebettet, und manche Browser (vor allem die installierte App auf dem iPhone) behalten den Speicher
     eingebetteter Seiten nicht. Deshalb schickt das Spiel jede Änderung per postMessage an den Hub, der sie im eigenen Speicher ablegt
     und beim nächsten Start über #lgh=<Base64url(JSON)> an die Spieladresse zurückgibt. */
  var STAND = 'lgh.stand.';
  function bytesZuB64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  /* Kleine Stände hängen direkt an der Adresse (#lgh=<Base64url>). Große gehen nicht durch die Adresse (Browser, vor allem Safari auf dem iPhone,
     und eine Obergrenze machen das unzuverlässig): Dann steht nur #lgh=msg dort, das Spiel fragt mit {lgh:'hallo'} nach, bekommt den Stand per
     postMessage und meldet {lgh:'fertig'}. Bis dahin nimmt der Hub keine Stände von diesem Rahmen an, damit ein Spiel, das den Stand nicht
     bekommen hat (etwa eine ältere Version ohne diese Funktion), den gesicherten Stand nie mit einem leeren überschreibt. */
  var HASH_MAX = 100000;
  /* Spiele, die ihren Start abwarten (games.json: "uebergabe": "msg", bisher nur das Tierspiel) holen große Stände per postMessage.
     Alle anderen bekommen sie als window.name ('lgh:' + JSON): Das Vorlade-Skript liest es sofort beim Start, ohne dass das Spiel etwas abwarten muss. */
  function standUebergabe(id, sp) {
    try {
      var j = localStorage.getItem(STAND + id);
      if (!j) return { hash: '', json: null };
      var h = bytesZuB64(new TextEncoder().encode(j));
      if (h.length <= HASH_MAX) return { hash: '#lgh=' + h, json: null };
      return sp && sp.uebergabe === 'msg' ? { hash: '#lgh=msg', json: j, art: 'msg' } : { hash: '', json: j, art: 'name' };
    } catch (e) { return { hash: '', json: null }; }
  }
  function zeigeStandHinweis() {
    var b = document.getElementById('stand-hinweis');
    if (!b) {
      b = document.createElement('div'); b.id = 'stand-hinweis'; b.className = 'stand-hinweis'; b.setAttribute('role', 'status');
      b.innerHTML = '<span>Dein Spielstand liegt sicher im Hub, das Spiel hat ihn aber nicht übernommen. Lade das Spiel neu. Hilft das nicht, geht es über Konto → Spielstände.</span><button type="button" class="btn btn-ghost" data-zu>OK</button>';
      b.querySelector('[data-zu]').addEventListener('click', function () { b.remove(); });
      buehne.appendChild(b);
    }
  }
  function absender(e) {
    if (aktuell && rahmen.contentWindow && e.source === rahmen.contentWindow) return { id: aktuell.id, url: aktuell.url, abgang: false, el: rahmen };
    for (var i = 0; i < abgehende.length; i++) if (e.source === abgehende[i].fenster) return { id: abgehende[i].id, url: abgehende[i].url, abgang: true, el: abgehende[i].el };
    return null;
  }
  // Die Anbindung ans Konto darf nie das Speichern oder Spielen stören
  function ausKonto(f) { try { if (window.LghKonto) f(window.LghKonto); } catch (x) { } }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || (d.lgh !== 'stand' && d.lgh !== 'status' && d.lgh !== 'hallo' && d.lgh !== 'fertig')) return;
    var q = absender(e);
    if (!q) return;
    try { if (e.origin !== new URL(q.url).origin) return; } catch (x) { return; }
    // Übergabe großer Stände: Spiel fragt nach dem Stand (hallo) und meldet, dass es ihn eingelesen hat (fertig)
    if (d.lgh === 'hallo') { var u = q.el && q.el._uebergabe; if (u && u.art === 'msg') { try { e.source.postMessage({ lgh: 'daten', json: u.json }, e.origin); } catch (x) { } } return; }
    if (d.lgh === 'fertig') { if (q.el && q.el._uebergabe) q.el._uebergabe.fertig = true; return; }
    if (d.spiel !== q.id) return;
    if (q.el && q.el._ignorieren) return;   // Rahmen, dessen Stand gerade durch eine Wiederherstellung ersetzt wurde: sein letzter Stand darf ihn nicht überschreiben
    if (q.el && q.el._uebergabe && !q.el._uebergabe.fertig) return;   // Spiel hat den gesicherten Stand noch nicht übernommen: nichts überschreiben
    // Optional: ein Spiel kann einen Raumcode melden ({lgh:'status', spiel, raum:'ABC123'}), den Freunde dann sehen
    if (d.lgh === 'status') { if (!q.abgang) ausKonto(function (k) { k.raum(d.raum); }); return; }
    if (!d.d || typeof d.d !== 'object' || !Object.keys(d.d).length) return;
    var neu = JSON.stringify({ t: d.t || Date.now(), d: d.d });
    try {
      // Sicherheitsnetz: schrumpft der Stand plötzlich stark (z. B. leerer Neustart), bleibt der bisherige als Kopie erhalten
      var alt = localStorage.getItem(STAND + q.id);
      if (alt && alt.length > 3000 && neu.length < alt.length * 0.4 && alt.length < 1500000) { try { localStorage.setItem(STAND + q.id + '.sicher', alt); } catch (x2) { } }
    } catch (x) { }
    try { localStorage.setItem(STAND + q.id, neu); } catch (x) { return; }
    ausKonto(function (k) { k.stand(q.id, d.d); if (q.abgang) k.beimVerlassen(q.id); });   // nur still mitschreiben, das Spiel hängt nicht davon ab
    try { e.source.postMessage({ lgh: 'ok', t: Date.now() }, e.origin); } catch (x) { }
  });
  /* Wiederherstellen (Konto → Spielstände, siehe konto.js): schreibt einen älteren Stand als aktuellen Hub-Stand. Der bisherige bleibt als
     lgh.stand.<id>.vorher erhalten. Läuft das Spiel gerade, werden seine Rahmen ab jetzt ignoriert und es startet mit dem neuen Stand neu. */
  function standAnwenden(id, d) {
    try {
      var neu = JSON.stringify({ t: Date.now(), d: d }), alt = localStorage.getItem(STAND + id);
      if (alt) localStorage.setItem(STAND + id + '.vorher', alt);
      localStorage.setItem(STAND + id, neu);
    } catch (e) { return false; }
    if (aktuell && aktuell.id === id && rahmen) rahmen._ignorieren = true;
    abgehende.forEach(function (a) { if (a.id === id && a.el) a.el._ignorieren = true; });
    if (aktuell && aktuell.id === id) ladeRahmen(aktuell, ++startZaehler);
    return true;
  }
  function standLokal(id) { try { var j = localStorage.getItem(STAND + id); return j ? JSON.parse(j) : null; } catch (e) { return null; } }
  function standSicherungen(id) {
    var r = [];
    [['vorher', 'Vor der letzten Wiederherstellung'], ['sicher', 'Vor einem plötzlichen Schrumpfen des Stands']].forEach(function (a) {
      try { var j = localStorage.getItem(STAND + id + '.' + a[0]); if (!j) return; var o = JSON.parse(j); if (o && o.d) r.push({ art: a[0], text: a[1], t: Math.floor((o.t || 0) / 1000), groesse: j.length, d: o.d }); } catch (e) { }
    });
    return r;
  }
  var startZaehler = 0;
  // Startet den Rahmen mit dem Stand aus dem Hub. Läuft dasselbe Spiel gerade noch als abgehender Rahmen, wird gewartet, bis seine letzte Meldung da ist.
  function ladeRahmen(sp, zaehler) {
    var warte = abgehende.some(function (a) { return a.id === sp.id; }) ? ABGANG_MS + 150 : 0;
    setTimeout(function () {
      if (aktuell !== sp || zaehler !== startZaehler) return;
      clearTimeout(hinweisTimer);
      hinweisTimer = setTimeout(function () { hinweis.classList.add('sichtbar'); }, 7000);
      var ue = standUebergabe(sp.id, sp);
      var alt = document.getElementById('stand-hinweis'); if (alt) alt.remove();
      neuerRahmen(sp.url + ue.hash, function () { clearTimeout(hinweisTimer); hinweis.classList.remove('sichtbar'); }, sp, ue);
    }, warte);
  }
  function starteSpiel(sp) {
    aktuell = sp;
    document.getElementById('spieltitel').textContent = sp.name;
    document.getElementById('hinweis-link').href = sp.url;
    document.getElementById('vollbild').hidden = !(buehne.requestFullscreen || buehne.webkitRequestFullscreen);
    hinweis.classList.remove('sichtbar');
    clearTimeout(hinweisTimer);
    var zaehler = ++startZaehler;
    // Ohne Anmeldung startet nichts (auch nicht über einen direkten Link). Ist das Konto-Modul nicht da, geht es trotzdem los.
    var bereit; try { bereit = window.LghKonto ? window.LghKonto.bereit() : Promise.resolve(); } catch (x) { bereit = Promise.resolve(); }
    bereit.then(function () {
      if (aktuell !== sp || zaehler !== startZaehler) return;
      ausKonto(function (k) { k.spiel(sp.id); });
      ladeRahmen(sp, zaehler);
    });
  }
  function stoppeSpiel() {
    clearTimeout(hinweisTimer);
    hinweis.classList.remove('sichtbar');
    var id = aktuell && aktuell.id;
    neuerRahmen(null);
    if (id) ausKonto(function (k) { k.beimVerlassen(id); k.spiel(null); });
    aktuell = null;
    startZaehler++;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
  }

  /* ---------- Freunde ---------- */
  var freundeTimer = null, freundeDaten = null, entfernenFrage = null;
  function relZeit(sek) {
    if (sek < 90) return 'gerade eben';
    var m = Math.round(sek / 60); if (m < 60) return 'vor ' + m + ' Min.';
    var h = Math.round(sek / 3600); if (h < 24) return 'vor ' + h + ' Std.';
    var t = Math.round(sek / 86400); return t === 1 ? 'gestern' : 'vor ' + t + ' Tagen';
  }
  function spielName(id) { var sp = spiele.filter(function (x) { return x.id === id; })[0]; return sp ? sp.name : id; }
  function anz(f) { return f.anzeige || f.name; }
  function frItem(av, f, status, akt) {
    return '<div class="fr-item"><a class="fr-hl" href="#profil/' + encodeURIComponent(f.name) + '"' + (f.spiel ? ' data-fr="' + esc(f.name) + '"' : '') + ' aria-label="Profil von ' + esc(anz(f)) + '">' + LghKonto.avatar('avatar', f.name, anz(f), f.av) +
      '<div class="fr-text"><div class="fr-name">' + esc(anz(f)) + '<span class="fr-at">@' + esc(f.name) + '</span></div><div class="fr-status">' + status + '</div></div></a><div class="fr-akt">' + akt + '</div></div>';
  }
  function zeichneFreunde(z, d) {
    var h = '', n = esc;
    if (d.eingehend.length) {
      h += '<h2 class="fr-abschnitt">Anfragen <span class="fr-zahl">' + d.eingehend.length + '</span></h2><div class="fr-liste">';
      d.eingehend.forEach(function (x) {
        h += frItem(0, x, 'möchte dein Freund sein',
          '<button type="button" class="btn btn-primary fr-btn" data-a="annehmen" data-n="' + n(x.name) + '">Annehmen</button>' +
          '<button type="button" class="btn btn-ghost fr-btn" data-a="ablehnen" data-n="' + n(x.name) + '">Ablehnen</button>');
      });
      h += '</div>';
    }
    h += '<h2 class="fr-abschnitt">Freunde <span class="fr-zahl">' + d.freunde.length + '</span></h2>';
    if (!d.freunde.length) h += '<div class="fr-leer">Noch keine Freunde. Gib oben den @Benutzernamen deines Freundes ein und schick ihm eine Anfrage.</div>';
    else {
      var rang = function (f) { return f.spiel ? 0 : f.online ? 1 : 2; };
      h += '<div class="fr-liste">';
      d.freunde.slice().sort(function (a, b) { return rang(a) - rang(b) || anz(a).toLowerCase().localeCompare(anz(b).toLowerCase()); }).forEach(function (f) {
        var status, akt = '';
        if (f.spiel) {
          var offen = spielbar().some(function (s) { return s.id === f.spiel; });
          status = '<span class="punkt an"></span>Spielt <b>' + n(spielName(f.spiel)) + '</b>' + (f.raum ? ' · Raum <code>' + n(f.raum) + '</code>' : '');
          if (offen) akt += '<a class="btn btn-primary fr-btn" href="#spiel/' + encodeURIComponent(f.spiel) + '/play">Mitspielen</a>';
          if (f.raum) akt += '<button type="button" class="btn btn-ghost fr-btn" data-a="kopie" data-n="' + n(f.raum) + '">Code kopieren</button>';
        } else if (f.online) status = '<span class="punkt an"></span>Im Hub';
        else status = '<span class="punkt"></span>' + (f.zuletzt ? 'Zuletzt online ' + relZeit(Math.max(0, d.jetzt - f.zuletzt)) : 'Noch nie online');
        akt += entfernenFrage === f.name
          ? '<button type="button" class="btn btn-ghost fr-btn gefahr" data-a="entfernen" data-n="' + n(f.name) + '">Wirklich entfernen?</button>'
          : '<button type="button" class="btn btn-ghost fr-btn leise" data-a="frage" data-n="' + n(f.name) + '" aria-label="' + n(anz(f)) + ' entfernen">Entfernen</button>';
        h += frItem(0, f, status, akt);
      });
      h += '</div>';
    }
    if (d.ausgehend.length) {
      h += '<h2 class="fr-abschnitt">Gesendet <span class="fr-zahl">' + d.ausgehend.length + '</span></h2><div class="fr-liste">';
      d.ausgehend.forEach(function (x) {
        h += frItem(0, x, 'wartet auf Antwort', '<button type="button" class="btn btn-ghost fr-btn leise" data-a="ablehnen" data-n="' + n(x.name) + '">Zurückziehen</button>');
      });
      h += '</div>';
    }
    z.innerHTML = h;
  }
  function ladeFreunde() {
    if (document.hidden || !window.LghKonto || !LghKonto.angemeldet()) return;
    LghKonto.freunde.liste().then(function (res) {
      var z = document.getElementById('fr-liste');
      if (body.getAttribute('data-view') !== 'freunde' || !z) return;
      if (!res.ok) { if (!freundeDaten) z.innerHTML = '<div class="fr-leer">Die Freunde konnten gerade nicht geladen werden.</div>'; return; }
      freundeDaten = leisteDaten = res.j;
      LghKonto.setzeOffene(res.j.eingehend.length);
      zeichneFreunde(z, res.j);
    });
  }
  /* ---------- Freunde-Leiste ganz oben auf der Startseite (wie bei Roblox) ---------- */
  var leisteDaten = null, leisteTimer = null;
  function zeichneLeiste() {
    var z = document.getElementById('fr-leiste');
    if (!z) return;
    var sichtbar = body.getAttribute('data-view') === 'home' && !suche && !!leisteDaten;
    z.hidden = !sichtbar;
    if (!sichtbar) return;
    var d = leisteDaten, n = esc;
    var rang = function (f) { return f.spiel ? 0 : f.online ? 1 : 2; };
    var liste = d.freunde.slice().sort(function (a, b) { return rang(a) - rang(b) || anz(a).toLowerCase().localeCompare(anz(b).toLowerCase()); });
    var h = '<a class="fr-kopf" href="#freunde">Freunde (' + d.freunde.length + ')<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      (d.eingehend.length ? '<span class="fr-neu">' + d.eingehend.length + (d.eingehend.length === 1 ? ' Anfrage' : ' Anfragen') + '</span>' : '') + '</a>';
    h += '<div class="fr-reihe">';
    h += '<a class="fr-karte" href="#freunde"><span class="fr-kreis fr-plus"><svg aria-hidden="true" width="34" height="34"><use href="#i-people"/></svg></span><span class="fr-n">Hinzufügen</span><span class="fr-s">&nbsp;</span></a>';
    liste.forEach(function (f) {
      var ziel = '#freunde', status = '&nbsp;';
      if (f.spiel) {
        if (spielbar().some(function (s) { return s.id === f.spiel; })) ziel = '#spiel/' + encodeURIComponent(f.spiel);
        status = esc(spielName(f.spiel));
      } else if (f.online) status = 'Im Hub';
      h += '<a class="fr-karte' + (f.spiel || f.online ? '' : ' aus') + '" href="' + ziel + '"' + (f.spiel ? ' data-fr="' + n(f.name) + '"' : '') + ' title="' + n(anz(f)) + ' (@' + n(f.name) + ')' + (f.spiel ? ' spielt ' + n(spielName(f.spiel)) : f.online ? ' ist im Hub' : '') + '">' +
        LghKonto.avatar('fr-kreis', f.name, anz(f), f.av, f.spiel || f.online ? '<span class="fr-punkt"></span>' : '') +
        '<span class="fr-n">' + n(anz(f)) + '</span><span class="fr-s">' + status + '</span></a>';
    });
    z.innerHTML = h + '</div>';
  }
  /* Freund im Spiel angeklickt: Profil ansehen, beitreten oder das Spiel ansehen */
  function frAuswahl(f) {
    var offen = spielbar().some(function (s) { return s.id === f.spiel; }), sid = encodeURIComponent(f.spiel);
    var pfeil = '<svg class="pfeil" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5L15 12l-5.5 5.5"/></svg>';
    var zeile = function (a, t, h) { return '<button type="button" class="dlg-zeile" data-fa="' + a + '"><span class="dlg-ztext"><b>' + t + '</b>' + (h ? '<small>' + h + '</small>' : '') + '</span>' + pfeil + '</button>'; };
    var hinter = document.createElement('div');
    hinter.className = 'dlg-hinter';
    hinter.innerHTML = '<div class="dlg" role="dialog" aria-modal="true"><div class="dlg-kopf">' + LghKonto.avatar('avatar gross', f.name, anz(f), f.av) +
      '<div class="dlg-kopftext"><div class="dlg-titel">' + esc(anz(f)) + '</div><div class="dlg-sub">Spielt ' + esc(spielName(f.spiel)) + (f.raum ? ' · Raum ' + esc(f.raum) : '') + '</div></div>' +
      '<button type="button" class="dlg-x" data-zu aria-label="Schließen"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dlg-gruppe" style="margin-top:14px">' + zeile('profil', 'Profil ansehen') +
      (offen ? zeile('beitreten', 'Beitreten', f.raum ? 'Raumcode ' + esc(f.raum) + ' wird kopiert' : 'Spiel öffnen') : '') +
      zeile('spiel', 'Spiel ansehen', esc(spielName(f.spiel))) + '</div></div>';
    function zu() { hinter.remove(); document.removeEventListener('keydown', taste); }
    function taste(e) { if (e.key === 'Escape') zu(); }
    hinter.addEventListener('click', function (e) {
      if (e.target === hinter || (e.target.closest && e.target.closest('[data-zu]'))) return zu();
      var b = e.target.closest ? e.target.closest('[data-fa]') : null;
      if (!b) return;
      var a = b.getAttribute('data-fa');
      zu();
      if (a === 'profil') location.hash = '#profil/' + encodeURIComponent(f.name);
      else if (a === 'spiel') location.hash = '#spiel/' + sid;
      else if (a === 'beitreten') {
        if (f.raum) { try { navigator.clipboard.writeText(f.raum); } catch (x) { } }
        location.hash = '#spiel/' + sid + '/play';
      }
    });
    document.addEventListener('keydown', taste);
    document.body.appendChild(hinter);
    var erst = hinter.querySelector('[data-fa]'); if (erst) erst.focus();
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-fr]') : null;
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    var nm = a.getAttribute('data-fr');
    var d = [leisteDaten, freundeDaten].filter(Boolean), f = null;
    d.forEach(function (x) { x.freunde.forEach(function (y) { if (y.name === nm && y.spiel) f = y; }); });
    if (!f) return;   // Freund spielt nicht mehr: normaler Link
    e.preventDefault();
    frAuswahl(f);
  });
  function ladeLeiste() {
    if (document.hidden || !window.LghKonto || !LghKonto.angemeldet()) return;
    if (body.getAttribute('data-view') !== 'home') return;
    LghKonto.freunde.liste().then(function (res) {
      if (!res.ok) return;
      leisteDaten = res.j;
      LghKonto.setzeOffene(res.j.eingehend.length);
      zeichneLeiste();
    });
  }
  function leisteStart() {
    zeichneLeiste();
    ladeLeiste();
    if (!leisteTimer) leisteTimer = setInterval(ladeLeiste, 20000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) ladeLeiste(); });

  var FR_FEHLER = {
    unbekannter_name: 'Es gibt kein Konto mit diesem Benutzernamen.', selbst: 'Das bist du selbst.', schon_freunde: 'Ihr seid schon Freunde.',
    schon_angefragt: 'Du hast dieser Person schon eine Anfrage geschickt.', zu_viele_freunde: 'Du hast schon die höchste Zahl an Freunden.',
    zu_viele_offen: 'Du hast schon sehr viele offene Anfragen. Warte, bis einige beantwortet sind.', netz: 'Keine Verbindung zum Server.',
  };
  function frMeldung(t, fehler) { var m = document.getElementById('fr-meldung'); if (m) { m.textContent = t || ''; m.className = 'fr-meldung' + (fehler ? ' fehler' : ''); } }
  function renderFreunde() {
    freundeDaten = null; entfernenFrage = null;
    inhalt.innerHTML = '<div class="fr-wrap"><h1 class="fr-titel">Freunde</h1>' +
      '<p class="fr-sub">Sieh, wer gerade spielt, und spring direkt mit ins Spiel.</p>' +
      '<form class="fr-form" id="fr-form" novalidate><input id="fr-name" type="text" placeholder="@Benutzername deines Freundes" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="21" aria-label="Benutzername deines Freundes">' +
      '<button class="btn btn-primary" type="submit">Anfrage senden</button></form>' +
      '<div class="fr-meldung" id="fr-meldung" role="status"></div><div id="fr-liste"><div class="fr-leer">Lädt …</div></div></div>';
    ladeFreunde();
    clearInterval(freundeTimer); freundeTimer = setInterval(ladeFreunde, 15000);
  }
  inhalt.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'fr-form') return;
    e.preventDefault();
    var feld = document.getElementById('fr-name'), name = feld.value.trim().replace(/^@/, '');
    if (!name) return;
    frMeldung('');
    LghKonto.freunde.anfrage(name).then(function (res) {
      if (res.ok) { feld.value = ''; frMeldung(res.j.freunde ? 'Du und ' + (res.j.anzeige || res.j.name) + ' (@' + res.j.name + ') seid jetzt Freunde.' : 'Anfrage an ' + (res.j.anzeige || res.j.name) + ' (@' + res.j.name + ') gesendet.'); ladeFreunde(); }
      else frMeldung(res.j.fehler === 'zu_viele' ? 'Zu viele Anfragen in kurzer Zeit. Bitte später noch einmal.' : (FR_FEHLER[res.j.fehler] || 'Das hat nicht geklappt.'), true);
    });
  });
  inhalt.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.fr-btn[data-a]') : null;
    if (!b || !window.LghKonto) return;
    var a = b.getAttribute('data-a'), nm = b.getAttribute('data-n');
    if (a === 'kopie') { try { navigator.clipboard.writeText(nm); frMeldung('Code kopiert.'); } catch (x) { frMeldung('Code: ' + nm); } return; }
    if (a === 'frage') { entfernenFrage = nm; zeichneFreunde(document.getElementById('fr-liste'), freundeDaten); setTimeout(function () { if (entfernenFrage === nm) { entfernenFrage = null; if (freundeDaten && document.getElementById('fr-liste')) zeichneFreunde(document.getElementById('fr-liste'), freundeDaten); } }, 5000); return; }
    var f = { annehmen: 'annehmen', ablehnen: 'ablehnen', entfernen: 'entfernen' }[a];
    if (!f) return;
    b.disabled = true; frMeldung('');
    LghKonto.freunde[f](nm).then(function (res) {
      entfernenFrage = null;
      if (!res.ok) frMeldung('Das hat nicht geklappt.', true);
      ladeFreunde();
    });
  });

  /* ---------- Profil ---------- */
  var profilZaehler = 0;
  function dauer(sek) {
    if (sek < 60) return sek > 0 ? 'unter 1 Min.' : '0 Min.';
    var m = Math.round(sek / 60); if (m < 60) return m + ' Min.';
    var h = Math.floor(m / 60); m = m % 60; return h + ' Std.' + (m ? ' ' + m + ' Min.' : '');
  }
  /* Detailseite: "Zuletzt gespielt" und "Spielzeit" neben dem Spielen-Knopf (aus den Profildaten des Kontos; nur sichtbar, wenn schon gespielt) */
  var eigenSpiele = { t: 0, liste: null, lauf: false }, spielInfoLauscher = false;
  /* Nur aufs Datum genau: Heute, Gestern, "5. Sep" (dieses Jahr), "2. Juli 2024" (früher) */
  function spielTag(ts) {
    var d = new Date(ts * 1000), n = new Date();
    var tage = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (tage <= 0) return 'Heute';
    if (tage === 1) return 'Gestern';
    var lang = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    var kurz = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return d.getFullYear() === n.getFullYear() ? d.getDate() + '. ' + kurz[d.getMonth()] : d.getDate() + '. ' + lang[d.getMonth()] + ' ' + d.getFullYear();
  }
  /* Spielzeit wie bei Steam: unter einer Stunde in Minuten, sonst Stunden mit einer Nachkommastelle ("5,7 Stunden") */
  function spielzeitText(sek) {
    if (sek < 60) return 'unter 1 Minute';
    if (sek < 3570) { var m = Math.round(sek / 60); return m + (m === 1 ? ' Minute' : ' Minuten'); }
    return (Math.round(sek / 360) / 10).toFixed(1).replace('.', ',') + ' Stunden';
  }
  function spielInfoZeigen(id) {
    var el = inhalt.querySelector('.spielinfo');
    if (!el) return;
    var x = null;
    if (eigenSpiele.liste) x = eigenSpiele.liste.filter(function (g) { return g.spiel === id; })[0] || null;
    if (!x || !x.zuletzt) { el.hidden = true; el.innerHTML = ''; aktionPassen(); return; }
    var ico = function (pfad) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + pfad + '</svg>'; };
    var uhr = ico('<circle cx="12" cy="12" r="9.2"/><path d="M12 6.8V12l3.4 2"/>'), kal = ico('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
    el.innerHTML = '<div class="si">' + kal + '<span><small>Zuletzt gespielt</small><b>' + esc(spielTag(x.zuletzt)) + '</b></span></div>' +
      '<div class="si si-zeit">' + uhr + '<span><small>Spielzeit</small><b>' + esc(spielzeitText(x.sekunden)) + '</b></span></div>';
    el.hidden = false;
    aktionPassen();
  }
  /* Reicht die Breite nicht für Titel, Zuletzt gespielt, Spielzeit und Spielen-Knopf in einer Zeile, fällt zuerst die Spielzeit weg;
     reicht es dann immer noch nicht, rutscht die Aktion (Knopf) in die zweite Zeile. Auf dem Handy (unter 900 px) gilt das eigene Layout. */
  function aktionPassen() {
    var zeile = inhalt.querySelector('.shop-titelzeile');
    if (!zeile) return;
    if (!zeile._beobachter) {
      zeile._beobachter = true;
      if (window.ResizeObserver) { var ro = new ResizeObserver(function () { aktionPassen(); }); ro.observe(zeile); var t = zeile.querySelector('h1'); if (t) ro.observe(t); }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { aktionPassen(); });
    }
    var h1 = zeile.querySelector('h1'), ak = zeile.querySelector('.spiel-aktion');
    if (!h1 || !ak || !zeile.offsetWidth) return;
    zeile.classList.remove('ohne-zeit');
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) return;
    if (ak.getBoundingClientRect().top < h1.getBoundingClientRect().bottom - 1) return;   // passt in eine Zeile
    zeile.classList.add('ohne-zeit');
  }
  function spielInfoLaden(id, nochmal) {
    if (!window.LghKonto || !LghKonto.angemeldet || !LghKonto.angemeldet()) {
      eigenSpiele.liste = null; spielInfoZeigen(id);
      if (nochmal !== false) setTimeout(function () { if (location.hash === '#spiel/' + encodeURIComponent(id)) spielInfoLaden(id, false); }, 1800);   // das Konto wird beim Start erst kurz nach der Seite geladen
      return;
    }
    if (!spielInfoLauscher && LghKonto.beiAenderung) { spielInfoLauscher = true; LghKonto.beiAenderung(function () { eigenSpiele.t = 0; var m = /^#spiel\/([^\/]+)$/.exec(location.hash); if (m) spielInfoLaden(decodeURIComponent(m[1])); }); }
    spielInfoZeigen(id);   // zuerst mit dem, was schon da ist
    if (eigenSpiele.lauf || Date.now() - eigenSpiele.t < 15000) return;
    eigenSpiele.lauf = true;
    LghKonto.profil().then(function (res) {
      eigenSpiele.lauf = false;
      if (res && res.ok && res.j && res.j.spiele) { eigenSpiele.liste = res.j.spiele; eigenSpiele.t = Date.now(); }
      var m = /^#spiel\/([^\/]+)$/.exec(location.hash);
      if (m && decodeURIComponent(m[1]) === id) spielInfoZeigen(id);
    }, function () { eigenSpiele.lauf = false; });
  }
  function renderProfil(name) {
    inhalt.innerHTML = '<div class="pf-wrap"><div class="fr-leer">Lädt …</div></div>';
    var tok = ++profilZaehler;
    if (!window.LghKonto) return;
    LghKonto.profil(name).then(function (res) {
      var w = inhalt.querySelector('.pf-wrap');
      if (tok !== profilZaehler || !w || body.getAttribute('data-view') !== 'profil') return;
      if (!res.ok) {
        w.innerHTML = '<h1 class="fr-titel">Profil</h1><div class="fr-leer">' + (res.status === 404 ? 'Dieses Profil gibt es nicht oder es ist nur für Freunde sichtbar.' : 'Das Profil konnte nicht geladen werden.') + '</div><a class="btn btn-ghost" href="#freunde">Zu den Freunden</a>';
        return;
      }
      var p = res.j, jetzt = Math.floor(Date.now() / 1000), gesamt = 0, gespielt = 0;
      var seit = p.seit ? new Date(p.seit * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      var sicher = {}; (p.staende || []).forEach(function (x) { sicher[x.spiel] = x; });
      var zeilen = '';
      (p.spiele || []).forEach(function (x) {
        var sp = spiele.filter(function (g) { return g.id === x.spiel; })[0];
        if (!sp) return;
        if (!p.eigen) gespielt++; else { gesamt += x.sekunden; if (x.sekunden > 0) gespielt++; }
        var st = sicher[x.spiel];
        zeilen += '<a class="pf-spiel" href="#spiel/' + encodeURIComponent(sp.id) + '"><span class="pf-icon">' + art(sp, 100, 100) + '</span><span class="pf-text"><b>' + esc(sp.name) + '</b>' +
          (p.eigen ? '<small>Zuletzt ' + relZeit(Math.max(0, jetzt - x.zuletzt)) + ' · Spielzeit ' + dauer(x.sekunden) + (st ? ' · ' + st.versionen + (st.versionen === 1 ? ' Sicherung' : ' Sicherungen') + ' auf dem Server' : '') + '</small>' : '') + '</span></a>';
      });
      var status = p.online ? '<span class="pf-punkt"></span>Online' + (p.spiel ? ' · spielt ' + esc(spielName(p.spiel)) : '') : (p.zuletzt ? 'Zuletzt online ' + relZeit(Math.max(0, jetzt - p.zuletzt)) : 'Noch nie online');
      w.innerHTML = '<div class="pf-kopf">' + LghKonto.avatar('avatar gross', p.name, p.anzeige, p.av) +
        '<div class="pf-kopftext"><h1 class="pf-name">' + esc(p.anzeige) + '</h1><div class="pf-at">@' + esc(p.name) + (seit ? ' · dabei seit ' + esc(seit) : '') + '</div><div class="pf-status">' + status + '</div></div></div>' +
        '<div class="pf-zahlen">' + (p.eigen ? '<div><b>' + esc(dauer(gesamt)) + '</b><small>Spielzeit gesamt</small></div>' : '') + '<div><b>' + gespielt + '</b><small>' + (gespielt === 1 ? 'Spiel gespielt' : 'Spiele gespielt') + '</small></div><div><b>' + p.freunde + '</b><small>' + (p.freunde === 1 ? 'Freund' : 'Freunde') + '</small></div></div>' +
        (p.eigen ? '<div class="pf-aktionen"><button type="button" class="btn btn-ghost" data-pf="bild">Profilbild ändern</button><button type="button" class="btn btn-ghost" data-pf="anz">Anzeigename ändern</button><button type="button" class="btn btn-ghost" data-pf="stand">Spielstände sichern und zurückholen</button><button type="button" class="btn btn-ghost" data-pf="konto">Konto</button></div>' : '') +
        '<h2 class="fr-abschnitt">' + (p.eigen ? 'Zuletzt gespielt' : 'Gespielte Spiele') + '</h2>' +
        (zeilen ? '<div class="pf-liste">' + zeilen + '</div>' : '<div class="fr-leer">' + (p.eigen ? 'Noch nichts gespielt. Die Spielzeit wird ab jetzt gezählt.' : 'Noch nichts gespielt.') + '</div>');
    });
  }
  inhalt.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-pf]') : null;
    if (!b || !window.LghKonto) return;
    var a = b.getAttribute('data-pf');
    window.LghKonto.kontoDialog(a === 'konto' ? null : a);
  });

  /* ---------- Navigation ---------- */
  /* Ansichten bleiben als fertige Knoten erhalten: beim Zurück- oder Weiterklicken werden sie nur wieder eingehängt,
     so laden Bilder nicht jedes Mal neu und Galerie, Scrollstand und Update-Log bleiben, wie sie sind. */
  var ansichtSpeicher = {}, ansichtKey = null;
  function homeKey() { return 'home|' + filter + '|' + suche; }
  function zeigeAnsicht(key, rendern) {
    if (ansichtKey === key && inhalt.firstChild) return;
    if (ansichtKey === 'freunde' || String(ansichtKey).indexOf('profil|') === 0) inhalt.innerHTML = '';
    else if (ansichtKey !== null) { var alt = document.createElement('div'); while (inhalt.firstChild) alt.appendChild(inhalt.firstChild); var vs = alt.querySelectorAll('video'); for (var vi = 0; vi < vs.length; vi++) { vs[vi].pause(); vs[vi]._lief = false; } ansichtSpeicher[ansichtKey] = alt; }
    var neu = ansichtSpeicher[key];
    if (neu) { delete ansichtSpeicher[key]; while (neu.firstChild) inhalt.appendChild(neu.firstChild); }
    else rendern();
    ansichtKey = key;
  }
  function route() { routeEx(); videoSteuern(); }
  var alphaOk = null;
  function alphaWarnung(sp) {
    if (document.querySelector('.dlg-alpha')) return;
    var hinter = document.createElement('div');
    hinter.className = 'dlg-hinter dlg-alpha';
    hinter.innerHTML = '<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="alpha-t"><div class="dlg-titel" id="alpha-t" style="margin-bottom:10px"><span class="ver-pill alpha">Alpha</span> ' + esc(sp.name) + '</div>' +
      '<p style="margin:0 0 6px;line-height:1.5">Dieses Spiel ist noch in einer frühen Entwicklungsphase. Es kann Fehler geben, Teile können fehlen oder sich ändern, und durch Updates kann dein Spielstand beschädigt werden oder verloren gehen.</p>' +
      '<div class="dlg-fuss" style="gap:10px"><button type="button" class="btn btn-ghost" data-zu>Zurück</button><button type="button" class="btn btn-primary" data-los>Trotzdem spielen</button></div></div>';
    function zu() { hinter.remove(); document.removeEventListener('keydown', taste); }
    function taste(e) { if (e.key === 'Escape') zu(); }
    hinter.addEventListener('click', function (e) {
      if (e.target === hinter || (e.target.closest && e.target.closest('[data-zu]'))) return zu();
      if (e.target.closest && e.target.closest('[data-los]')) { zu(); alphaOk = sp.id; location.hash = '#spiel/' + encodeURIComponent(sp.id) + '/play'; }
    });
    document.addEventListener('keydown', taste);
    document.body.appendChild(hinter);
    var b = hinter.querySelector('[data-los]'); if (b) b.focus();
  }
  function routeEx() {
    var m = /^#spiel\/([^\/]+)(\/play)?$/.exec(location.hash);
    var sp = null;
    if (m) { var id = decodeURIComponent(m[1]); sp = spiele.filter(function (s) { return s.id === id && (s.url || s.wartung); })[0] || null; }
    if (m && !sp) { location.replace('#'); return; }
    if (m && m[2] && !sp.url) { location.replace('#spiel/' + encodeURIComponent(sp.id)); return; }   // in Wartung: nur die Detailseite

    lightboxZu();
    var vorher = body.getAttribute('data-view');
    if (vorher === 'play') { stoppeSpiel(); alphaOk = null; }
    if (vorher === 'freunde' && location.hash !== '#freunde') { clearInterval(freundeTimer); freundeTimer = null; }
    var pm = /^#profil(?:\/([^\/]+))?$/.exec(location.hash);
    if (pm) {
      var pn = pm[1] ? decodeURIComponent(pm[1]) : '';
      body.setAttribute('data-view', 'profil');
      if (String(ansichtKey).indexOf('profil|') === 0) ansichtKey = null;
      zeigeAnsicht('profil|' + pn, function () { renderProfil(pn); }); renderSide(null, true);
      document.title = 'Profil – Leif Game Hub';
      window.scrollTo(0, 0);
      return;
    }
    if (location.hash === '#freunde') {
      body.setAttribute('data-view', 'freunde');
      if (ansichtKey === 'freunde') ansichtKey = null;   // immer frisch laden (Spiel dazwischen: sonst fehlt der Aktualisierungstakt)
      zeigeAnsicht('freunde', renderFreunde); renderSide(null, true);
      document.title = 'Freunde – Leif Game Hub';
      window.scrollTo(0, 0);
      return;
    }

    if (sp && m[2] && sp.phase === 'alpha' && alphaOk !== sp.id) {   // Alpha: erst die Warnung, das Spiel startet erst nach "Trotzdem spielen"
      location.replace('#spiel/' + encodeURIComponent(sp.id));
      alphaWarnung(sp);
      return;
    }
    if (sp && m[2]) {
      body.setAttribute('data-view', 'play');
      starteSpiel(sp);
      document.title = sp.name + ' – Leif Game Hub';
      return;
    }
    if (sp) {
      body.setAttribute('data-view', 'detail');
      zeigeAnsicht('detail|' + sp.id, function () { renderDetail(sp); }); renderSide(sp.id);
      spielInfoLaden(sp.id);
      document.title = sp.name + ' – Leif Game Hub';
      window.scrollTo(0, 0);
      return;
    }
    body.setAttribute('data-view', 'home');
    zeigeAnsicht(homeKey(), renderHome); renderSide(null);
    leisteStart();
    document.title = 'Leif Game Hub';
    window.scrollTo(0, vorher === 'home' ? window.scrollY : homeScroll);
  }

  /* ---------- Ereignisse ---------- */
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', function () { if (body.getAttribute('data-view') === 'home') homeScroll = window.scrollY; }, { passive: true });

  document.getElementById('suche').addEventListener('input', function (e) {
    suche = e.target.value.trim().toLowerCase();
    zeichneLeiste();
    if (body.getAttribute('data-view') !== 'home') location.hash = ''; else { renderHome(); ansichtKey = homeKey(); }
  });
  inhalt.addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('.chip') : null;
    if (!c) return;
    filter = c.getAttribute('data-k');
    renderHome(); ansichtKey = homeKey();
  });

  document.getElementById('zurueck').addEventListener('click', function () {
    if (aktuell) location.replace('#spiel/' + encodeURIComponent(aktuell.id)); else location.replace('#');
  });
  document.getElementById('neuladen').addEventListener('click', function () {
    if (!aktuell) return;
    var sp = aktuell, zaehler = ++startZaehler;
    neuerRahmen(null);        // der laufende Rahmen meldet noch seinen letzten Stand
    ladeRahmen(sp, zaehler);
  });
  document.getElementById('vollbild').addEventListener('click', function () {
    var voll = document.fullscreenElement || document.webkitFullscreenElement;
    if (voll) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (buehne.requestFullscreen || buehne.webkitRequestFullscreen).call(buehne);
  });

  window.LghStand = { spielName: function (id) { return spielName(id); }, anwenden: standAnwenden, lokal: standLokal, sicherungen: standSicherungen };

  var BILD_V = '4';
  function json(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  Promise.all([json('games.json'), json('versions.json').catch(function () { return {}; })])
    .then(function (d) {
      spiele = d[0].games || []; versionen = d[1] || {};
      // Beim Ersetzen eines Bildes die Nummer BILD_V hochzählen: alle Browser holen dann die neue Datei statt der zwischengespeicherten.
      // "wartung": true in games.json sperrt ein Spiel vorübergehend (wie "Bald", aber mit Hinweis "Wartung"); zum Freigeben das Feld entfernen.
      spiele.forEach(function (sp) { if (sp.wartung) sp.url = ''; });
      spiele.forEach(function (sp) { ['bild', 'banner', 'icon', 'wallpaper'].forEach(function (k) { if (typeof sp[k] === 'string' && sp[k].indexOf('?') < 0) sp[k] += '?v=' + BILD_V; }); });
      route();
    })
    .catch(function () { inhalt.innerHTML = '<div class="leer" style="padding:80px 28px">Die Spieleliste konnte nicht geladen werden.</div>'; });
})();
