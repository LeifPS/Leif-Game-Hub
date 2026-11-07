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

  function tile(sp) {
    var offen = !!sp.url, id = encodeURIComponent(sp.id), v = ver(sp);
    var s = '<article class="tile' + (offen ? '' : ' off') + '">';
    s += offen ? '<a class="tile-link" href="#spiel/' + id + '" aria-label="' + esc(sp.name) + '">' : '<div class="tile-link">';
    s += '<div class="tile-art">' + art(sp, 400, 400);
    if (!offen) s += '<span class="badge">Bald</span>';
    else if (v) s += '<span class="ver-tag">' + (v.offiziell ? '' : 'Beta ') + esc(v.version) + '</span>';
    s += '</div>';
    s += '<div class="tile-text"><strong>' + esc(sp.name) + '</strong><span>' + esc(kategorien(sp).join(', ')) + '</span></div>';
    s += offen ? '</a>' : '</div>';
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
      var inner = '<span class="lib-icon">' + art(sp, 100, 100) + '</span><span class="name">' + esc(sp.name) + '</span>' + (offen ? '' : '<small>Bald</small>');
      s += offen
        ? '<a class="lib-item' + (sp.id === aktivId ? ' aktiv' : '') + '" href="#spiel/' + encodeURIComponent(sp.id) + '">' + inner + '</a>'
        : '<div class="lib-item off">' + inner + '</div>';
    });
    bibliothek.innerHTML = s;
    if (window.LghKonto) LghKonto.abzeichen();
    var n = spielbar().length;
    document.getElementById('side-fuss').innerHTML = n + (n === 1 ? ' Spiel' : ' Spiele') + ' spielbar · <a href="kontakt.html">Kontakt</a>';
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
  var galerie = { liste: [], i: 0, name: '' };
  function bilderVon(sp) {
    if (sp.screenshots && sp.screenshots.length) return sp.screenshots;
    return sp.banner ? [sp.banner] : [];
  }
  function galerieHtml(sp) {
    var b = bilderVon(sp);
    if (!b.length) return '';
    var h = '<div class="gal" aria-label="Screenshots"><div class="gal-haupt"><button type="button" class="gal-bild" id="gal-bild" aria-label="Screenshot vergrößern"><img id="gal-img" src="' + esc(b[0]) + '" alt="Screenshot 1 von ' + esc(sp.name) + '" decoding="async"></button>';
    if (b.length > 1) h += '<button type="button" class="gal-pfeil links" id="gal-zu" aria-label="Voriger Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button><button type="button" class="gal-pfeil rechts" id="gal-vor" aria-label="Nächster Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button>';
    h += '</div>';
    if (b.length > 1) {
      h += '<div class="gal-reihe" id="gal-reihe" role="tablist">' + b.map(function (u, k) {
        return '<button type="button" class="gal-mini' + (k === 0 ? ' aktiv' : '') + '" data-k="' + k + '" role="tab" aria-label="Screenshot ' + (k + 1) + '"><img src="' + esc(u) + '" alt="" loading="lazy" decoding="async"></button>';
      }).join('') + '</div>';
    }
    return h + '</div>';
  }
  function galerieZeige(k) {
    var n = galerie.liste.length;
    if (!n) return;
    galerie.i = (k + n) % n;
    var img = document.getElementById('gal-img');
    if (img) { img.src = galerie.liste[galerie.i]; img.alt = 'Screenshot ' + (galerie.i + 1) + ' von ' + galerie.name; }
    var minis = document.querySelectorAll('.gal-mini');
    for (var j = 0; j < minis.length; j++) {
      var an = j === galerie.i;
      minis[j].classList.toggle('aktiv', an);
      if (an && minis[j].scrollIntoView) { var r = document.getElementById('gal-reihe'); if (r) r.scrollTo({ left: minis[j].offsetLeft - r.clientWidth / 2 + minis[j].clientWidth / 2, behavior: 'smooth' }); }
    }
    var lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('offen')) document.getElementById('lb-img').src = galerie.liste[galerie.i];
  }
  function galerieBinden(sp) {
    galerie = { liste: bilderVon(sp), i: 0, name: sp.name };
    if (!galerie.liste.length) return;
    var reihe = document.getElementById('gal-reihe');
    if (reihe) reihe.addEventListener('click', function (e) { var m = e.target.closest('.gal-mini'); if (m) galerieZeige(+m.getAttribute('data-k')); });
    var vor = document.getElementById('gal-vor'), zu = document.getElementById('gal-zu');
    if (vor) vor.addEventListener('click', function () { galerieZeige(galerie.i + 1); });
    if (zu) zu.addEventListener('click', function () { galerieZeige(galerie.i - 1); });
    document.getElementById('gal-bild').addEventListener('click', lightboxAuf);
    var x0 = null, bild = document.getElementById('gal-bild');
    bild.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    bild.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) { galerieZeige(galerie.i + (dx < 0 ? 1 : -1)); bild.setAttribute('data-wisch', '1'); setTimeout(function () { bild.removeAttribute('data-wisch'); }, 300); }
    });
    bild.addEventListener('click', function (e) { if (bild.getAttribute('data-wisch')) e.stopImmediatePropagation(); }, true);
  }
  function lightboxAuf() {
    var lb = document.getElementById('lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Screenshot');
      lb.innerHTML = '<button type="button" class="lb-zu" aria-label="Schließen">&times;</button><button type="button" class="gal-pfeil links" id="lb-zurueck" aria-label="Voriger Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button><img id="lb-img" alt=""><button type="button" class="gal-pfeil rechts" id="lb-weiter" aria-label="Nächster Screenshot"><svg aria-hidden="true"><use href="#i-back"/></svg></button>';
      document.body.appendChild(lb);
      lb.addEventListener('click', function (e) {
        if (e.target.id === 'lb-zurueck') galerieZeige(galerie.i - 1);
        else if (e.target.closest && e.target.closest('#lb-zurueck')) galerieZeige(galerie.i - 1);
        else if (e.target.closest && e.target.closest('#lb-weiter')) galerieZeige(galerie.i + 1);
        else if (e.target.id !== 'lb-img') lightboxZu();
      });
    }
    lb.querySelector('#lb-img').src = galerie.liste[galerie.i];
    var mehrere = galerie.liste.length > 1;
    lb.querySelector('#lb-zurueck').style.display = lb.querySelector('#lb-weiter').style.display = mehrere ? '' : 'none';
    lb.classList.add('offen');
  }
  function lightboxZu() { var lb = document.getElementById('lightbox'); if (lb) lb.classList.remove('offen'); }
  document.addEventListener('keydown', function (e) {
    var lb = document.getElementById('lightbox');
    var offen = lb && lb.classList.contains('offen');
    if (e.key === 'Escape' && offen) lightboxZu();
    else if (e.key === 'ArrowRight' && (offen || document.getElementById('gal-img'))) galerieZeige(galerie.i + 1);
    else if (e.key === 'ArrowLeft' && (offen || document.getElementById('gal-img'))) galerieZeige(galerie.i - 1);
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
    h += '<div class="shop-titelzeile">' + titelHtml(sp) + '<a class="btn btn-primary btn-spielen" href="#spiel/' + id + '/play">' + playIcon() + 'Spielen</a></div>';
    var gal = galerieHtml(sp);
    var text = (sp.beschreibung && sp.beschreibung !== sp.text) ? '<section class="shop-text"><h2>Über dieses Spiel</h2><p>' + esc(sp.beschreibung) + '</p></section>' : '';
    h += '<div class="shop-oben' + (gal ? '' : ' ohne-galerie') + '">' + (gal ? '<div class="shop-haupt">' + gal + text + '</div>' : '');
    h += '<aside class="shop-info"><div class="shop-kopf"><div class="shop-icon">' + art(sp, 300, 300) + '</div><p class="kurz">' + esc(sp.text) + '</p></div><dl class="fakten">';
    if (v && v.erste) h += faktZeile('Erschienen', esc(datumText(v.erste)));
    if (sp.offiziell_ab) {
      var vorbei = sp.offiziell_ab <= new Date().toISOString().slice(0, 10);
      h += faktZeile(vorbei ? 'Offiziell seit' : 'Offiziell ab', esc(datumText(sp.offiziell_ab + 'T12:00:00+02:00')));
    }
    if (v) h += faktZeile('Status', '<span class="ver-pill' + (v.offiziell ? ' offiziell' : '') + '">' + (v.offiziell ? 'Offiziell' : 'Beta') + '</span> Version ' + esc(v.version));
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
      h += '<div class="log-eintrag"><span class="log-v">' + esc(e.v) + '</span><span class="log-art ' + art + '">' + ARTEN[art] + '</span><span class="log-text">' + esc(e.text) + '</span>';
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
  function neuerRahmen(url, beiLaden, sp) {
    var alt = rahmen, n = alt.cloneNode(false);
    n.removeAttribute('src');
    if (sp) { n.setAttribute('data-sid', sp.id); n.setAttribute('data-surl', sp.url); }
    else { n.removeAttribute('data-sid'); n.removeAttribute('data-surl'); }
    if (beiLaden) n.addEventListener('load', beiLaden);
    if (url) n.src = url;
    var sid = alt.getAttribute('data-sid'), fenster = alt.contentWindow;
    if (sid && fenster && alt.getAttribute('src')) {
      var eintrag = { fenster: fenster, id: sid, url: alt.getAttribute('data-surl') };
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
  function standHash(id) {
    try {
      var j = localStorage.getItem(STAND + id);
      if (!j) return '';
      var h = bytesZuB64(new TextEncoder().encode(j));
      return h.length < 1500000 ? '#lgh=' + h : '';
    } catch (e) { return ''; }
  }
  function absender(e) {
    if (aktuell && rahmen.contentWindow && e.source === rahmen.contentWindow) return { id: aktuell.id, url: aktuell.url, abgang: false };
    for (var i = 0; i < abgehende.length; i++) if (e.source === abgehende[i].fenster) return { id: abgehende[i].id, url: abgehende[i].url, abgang: true };
    return null;
  }
  // Die Anbindung ans Konto darf nie das Speichern oder Spielen stören
  function ausKonto(f) { try { if (window.LghKonto) f(window.LghKonto); } catch (x) { } }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || (d.lgh !== 'stand' && d.lgh !== 'status')) return;
    var q = absender(e);
    if (!q || d.spiel !== q.id) return;
    try { if (e.origin !== new URL(q.url).origin) return; } catch (x) { return; }
    // Optional: ein Spiel kann einen Raumcode melden ({lgh:'status', spiel, raum:'ABC123'}), den Freunde dann sehen
    if (d.lgh === 'status') { if (!q.abgang) ausKonto(function (k) { k.raum(d.raum); }); return; }
    if (!d.d || typeof d.d !== 'object' || !Object.keys(d.d).length) return;
    try { localStorage.setItem(STAND + q.id, JSON.stringify({ t: d.t || Date.now(), d: d.d })); } catch (x) { return; }
    ausKonto(function (k) { k.stand(q.id, d.d); if (q.abgang) k.beimVerlassen(q.id); });   // nur still mitschreiben, das Spiel hängt nicht davon ab
    try { e.source.postMessage({ lgh: 'ok', t: Date.now() }, e.origin); } catch (x) { }
  });
  var startZaehler = 0;
  // Startet den Rahmen mit dem Stand aus dem Hub. Läuft dasselbe Spiel gerade noch als abgehender Rahmen, wird gewartet, bis seine letzte Meldung da ist.
  function ladeRahmen(sp, zaehler) {
    var warte = abgehende.some(function (a) { return a.id === sp.id; }) ? ABGANG_MS + 150 : 0;
    setTimeout(function () {
      if (aktuell !== sp || zaehler !== startZaehler) return;
      clearTimeout(hinweisTimer);
      hinweisTimer = setTimeout(function () { hinweis.classList.add('sichtbar'); }, 7000);
      neuerRahmen(sp.url + standHash(sp.id), function () { clearTimeout(hinweisTimer); hinweis.classList.remove('sichtbar'); }, sp);
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
  function frItem(av, name, status, akt) {
    return '<div class="fr-item"><span class="avatar" style="' + LghKonto.avatarStil(name) + '">' + esc(name.charAt(0).toUpperCase()) + '</span>' +
      '<div class="fr-text"><div class="fr-name">' + esc(name) + '</div><div class="fr-status">' + status + '</div></div><div class="fr-akt">' + akt + '</div></div>';
  }
  function zeichneFreunde(z, d) {
    var h = '', n = esc;
    if (d.eingehend.length) {
      h += '<h2 class="fr-abschnitt">Anfragen <span class="fr-zahl">' + d.eingehend.length + '</span></h2><div class="fr-liste">';
      d.eingehend.forEach(function (x) {
        h += frItem(0, x.name, 'möchte dein Freund sein',
          '<button type="button" class="btn btn-primary fr-btn" data-a="annehmen" data-n="' + n(x.name) + '">Annehmen</button>' +
          '<button type="button" class="btn btn-ghost fr-btn" data-a="ablehnen" data-n="' + n(x.name) + '">Ablehnen</button>');
      });
      h += '</div>';
    }
    h += '<h2 class="fr-abschnitt">Freunde <span class="fr-zahl">' + d.freunde.length + '</span></h2>';
    if (!d.freunde.length) h += '<div class="fr-leer">Noch keine Freunde. Gib oben den Namen deines Freundes ein und schick ihm eine Anfrage.</div>';
    else {
      var rang = function (f) { return f.spiel ? 0 : f.online ? 1 : 2; };
      h += '<div class="fr-liste">';
      d.freunde.slice().sort(function (a, b) { return rang(a) - rang(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); }).forEach(function (f) {
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
          : '<button type="button" class="btn btn-ghost fr-btn leise" data-a="frage" data-n="' + n(f.name) + '" aria-label="' + n(f.name) + ' entfernen">Entfernen</button>';
        h += frItem(0, f.name, status, akt);
      });
      h += '</div>';
    }
    if (d.ausgehend.length) {
      h += '<h2 class="fr-abschnitt">Gesendet <span class="fr-zahl">' + d.ausgehend.length + '</span></h2><div class="fr-liste">';
      d.ausgehend.forEach(function (x) {
        h += frItem(0, x.name, 'wartet auf Antwort', '<button type="button" class="btn btn-ghost fr-btn leise" data-a="ablehnen" data-n="' + n(x.name) + '">Zurückziehen</button>');
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
    var liste = d.freunde.slice().sort(function (a, b) { return rang(a) - rang(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
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
      h += '<a class="fr-karte' + (f.spiel || f.online ? '' : ' aus') + '" href="' + ziel + '" title="' + n(f.name) + (f.spiel ? ' spielt ' + n(spielName(f.spiel)) : f.online ? ' ist im Hub' : '') + '">' +
        '<span class="fr-kreis" style="' + LghKonto.avatarStil(f.name) + '">' + n(f.name.charAt(0).toUpperCase()) + (f.spiel || f.online ? '<span class="fr-punkt"></span>' : '') + '</span>' +
        '<span class="fr-n">' + n(f.name) + '</span><span class="fr-s">' + status + '</span></a>';
    });
    z.innerHTML = h + '</div>';
  }
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
    unbekannter_name: 'Es gibt kein Konto mit diesem Namen.', selbst: 'Das bist du selbst.', schon_freunde: 'Ihr seid schon Freunde.',
    schon_angefragt: 'Du hast dieser Person schon eine Anfrage geschickt.', zu_viele_freunde: 'Du hast schon die höchste Zahl an Freunden.',
    zu_viele_offen: 'Du hast schon sehr viele offene Anfragen. Warte, bis einige beantwortet sind.', netz: 'Keine Verbindung zum Server.',
  };
  function frMeldung(t, fehler) { var m = document.getElementById('fr-meldung'); if (m) { m.textContent = t || ''; m.className = 'fr-meldung' + (fehler ? ' fehler' : ''); } }
  function renderFreunde() {
    freundeDaten = null; entfernenFrage = null;
    inhalt.innerHTML = '<div class="fr-wrap"><h1 class="fr-titel">Freunde</h1>' +
      '<p class="fr-sub">Sieh, wer gerade spielt, und spring direkt mit ins Spiel.</p>' +
      '<form class="fr-form" id="fr-form" novalidate><input id="fr-name" type="text" placeholder="Name deines Freundes" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" aria-label="Name deines Freundes">' +
      '<button class="btn btn-primary" type="submit">Anfrage senden</button></form>' +
      '<div class="fr-meldung" id="fr-meldung" role="status"></div><div id="fr-liste"><div class="fr-leer">Lädt …</div></div></div>';
    ladeFreunde();
    clearInterval(freundeTimer); freundeTimer = setInterval(ladeFreunde, 15000);
  }
  inhalt.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'fr-form') return;
    e.preventDefault();
    var feld = document.getElementById('fr-name'), name = feld.value.trim();
    if (!name) return;
    frMeldung('');
    LghKonto.freunde.anfrage(name).then(function (res) {
      if (res.ok) { feld.value = ''; frMeldung(res.j.freunde ? 'Du und ' + res.j.name + ' seid jetzt Freunde.' : 'Anfrage an ' + res.j.name + ' gesendet.'); ladeFreunde(); }
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

  /* ---------- Navigation ---------- */
  /* Ansichten bleiben als fertige Knoten erhalten: beim Zurück- oder Weiterklicken werden sie nur wieder eingehängt,
     so laden Bilder nicht jedes Mal neu und Galerie, Scrollstand und Update-Log bleiben, wie sie sind. */
  var ansichtSpeicher = {}, ansichtKey = null;
  function homeKey() { return 'home|' + filter + '|' + suche; }
  function zeigeAnsicht(key, rendern) {
    if (ansichtKey === key && inhalt.firstChild) return;
    if (ansichtKey === 'freunde') inhalt.innerHTML = '';
    else if (ansichtKey !== null) { var alt = document.createElement('div'); while (inhalt.firstChild) alt.appendChild(inhalt.firstChild); ansichtSpeicher[ansichtKey] = alt; }
    var neu = ansichtSpeicher[key];
    if (neu) { delete ansichtSpeicher[key]; while (neu.firstChild) inhalt.appendChild(neu.firstChild); }
    else rendern();
    ansichtKey = key;
  }
  function route() {
    var m = /^#spiel\/([^\/]+)(\/play)?$/.exec(location.hash);
    var sp = null;
    if (m) { var id = decodeURIComponent(m[1]); sp = spielbar().filter(function (s) { return s.id === id; })[0] || null; }
    if (m && !sp) { location.replace('#'); return; }

    var vorher = body.getAttribute('data-view');
    if (vorher === 'play') stoppeSpiel();
    if (vorher === 'freunde' && location.hash !== '#freunde') { clearInterval(freundeTimer); freundeTimer = null; }
    if (location.hash === '#freunde') {
      body.setAttribute('data-view', 'freunde');
      if (ansichtKey === 'freunde') ansichtKey = null;   // immer frisch laden (Spiel dazwischen: sonst fehlt der Aktualisierungstakt)
      zeigeAnsicht('freunde', renderFreunde); renderSide(null, true);
      document.title = 'Freunde – Leifs Spiele';
      window.scrollTo(0, 0);
      return;
    }

    if (sp && m[2]) {
      body.setAttribute('data-view', 'play');
      starteSpiel(sp);
      document.title = sp.name + ' – Leifs Spiele';
      return;
    }
    if (sp) {
      body.setAttribute('data-view', 'detail');
      zeigeAnsicht('detail|' + sp.id, function () { renderDetail(sp); }); renderSide(sp.id);
      document.title = sp.name + ' – Leifs Spiele';
      window.scrollTo(0, 0);
      return;
    }
    body.setAttribute('data-view', 'home');
    zeigeAnsicht(homeKey(), renderHome); renderSide(null);
    leisteStart();
    document.title = 'Leifs Spiele';
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

  var BILD_V = '3';
  function json(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  Promise.all([json('games.json'), json('versions.json').catch(function () { return {}; })])
    .then(function (d) {
      spiele = d[0].games || []; versionen = d[1] || {};
      // Beim Ersetzen eines Bildes die Nummer BILD_V hochzählen: alle Browser holen dann die neue Datei statt der zwischengespeicherten.
      spiele.forEach(function (sp) { ['bild', 'banner', 'icon', 'wallpaper'].forEach(function (k) { if (typeof sp[k] === 'string' && sp[k].indexOf('?') < 0) sp[k] += '?v=' + BILD_V; }); });
      route();
    })
    .catch(function () { inhalt.innerHTML = '<div class="leer" style="padding:80px 28px">Die Spieleliste konnte nicht geladen werden.</div>'; });
})();
