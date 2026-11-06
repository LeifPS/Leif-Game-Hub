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
  var LOG_SEITE = 30;
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
    var offen = !!sp.url, id = encodeURIComponent(sp.id);
    var s = '<article class="tile' + (offen ? '' : ' off') + '">';
    s += offen ? '<a class="tile-link" href="#spiel/' + id + '" aria-label="' + esc(sp.name) + '">' : '<div class="tile-link">';
    s += art(sp, 300, 400) + '<div class="scrim"></div>';
    s += '<div class="tile-title"><strong>' + esc(sp.name) + '</strong><span>' + esc(kategorien(sp).join(' · ')) + '</span></div>';
    if (!offen) s += '<span class="badge">Bald</span>';
    else if (ver(sp)) s += '<span class="ver-tag">' + (ver(sp).offiziell ? '' : 'Beta ') + 'v' + esc(ver(sp).version) + '</span>';
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
  function renderSide(aktivId) {
    var s = '<a class="lib-item' + (aktivId ? '' : ' aktiv') + '" href="#"><span class="lib-home-icon"><svg width="20" height="20" aria-hidden="true"><use href="#i-home"/></svg></span><span class="name">Startseite</span></a>';
    s += '<div class="nav-label">Bibliothek</div>';
    sortiert().forEach(function (sp) {
      var offen = !!sp.url;
      var inner = '<span class="lib-icon">' + art(sp, 100, 100) + '</span><span class="name">' + esc(sp.name) + '</span>' + (offen ? '' : '<small>Bald</small>');
      s += offen
        ? '<a class="lib-item' + (sp.id === aktivId ? ' aktiv' : '') + '" href="#spiel/' + encodeURIComponent(sp.id) + '">' + inner + '</a>'
        : '<div class="lib-item off">' + inner + '</div>';
    });
    bibliothek.innerHTML = s;
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
      h += '<div class="hero-leiste"><div class="hero-text"><span class="eyebrow">Empfohlen</span><p>' + esc(hero.text) + '</p></div>';
      h += '<div class="btn-row"><a class="btn btn-primary" href="#spiel/' + encodeURIComponent(hero.id) + '/play">' + playIcon() + 'Jetzt spielen</a>';
      h += '<a class="btn btn-ghost" href="#spiel/' + encodeURIComponent(hero.id) + '">Mehr erfahren</a></div></div></section>';
    } else if (hero) {
      h += '<section class="hero" aria-label="Empfohlen">' + art(hero, 1200, 480) + '<div class="hero-body">';
      h += '<span class="eyebrow">Empfohlen</span><h1>' + esc(hero.name) + '</h1><p>' + esc(hero.text) + '</p>';
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

  function renderDetail(sp) {
    var id = encodeURIComponent(sp.id);
    var titel = !!sp.wallpaper;
    var h = '<div class="detail-banner' + (titel ? ' titel' : '') + '">' + (titel ? '<img class="titelbild" src="' + esc(sp.wallpaper) + '" alt="' + esc(sp.name) + '" decoding="async">' : art(sp, 1400, 420)) + '<a class="zurueck-link" href="#"><svg aria-hidden="true"><use href="#i-back"/></svg>Alle Spiele</a></div>';
    h += '<div class="detail-wrap' + (titel ? ' titel' : '') + '"><div class="detail-kopf"><div class="detail-cover">' + (titel ? art(sp, 300, 300) : art(sp, 300, 400)) + '</div><div class="detail-info">';
    var v = ver(sp);
    h += '<h1' + (titel ? ' class="sr-only"' : '') + '>' + esc(sp.name) + '</h1>' + pills(sp);
    if (v) h += '<div class="ver-zeile"><span class="ver-pill' + (v.offiziell ? ' offiziell' : '') + '">' + (v.offiziell ? 'Offiziell' : 'Beta') + '</span><span class="ver-nr">Version ' + esc(v.version) + '</span><span class="ver-datum">zuletzt aktualisiert am ' + esc(datumText(v.datum)) + '</span></div>';
    h += '<div class="btn-row"><a class="btn btn-primary" href="#spiel/' + id + '/play">' + playIcon() + 'Spielen</a>';
    h += '<a class="btn btn-ghost" href="' + esc(sp.url) + '" target="_blank" rel="noopener">In neuem Tab öffnen</a></div></div></div>';
    h += '<div class="detail-text"><h2>Über das Spiel</h2><p>' + esc(sp.beschreibung || sp.text) + '</p></div>';
    h += '<section class="log" id="log"><h2>Update-Log</h2><div class="log-liste" id="log-liste"><div class="log-leer">Lädt …</div></div></section>';
    var mehr = spielbar().filter(function (s) { return s.id !== sp.id; }).slice(0, 6);
    if (mehr.length) h += '<section class="mehr"><h2>Weitere Spiele</h2><div class="grid">' + mehr.map(tile).join('') + '</div></section>';
    inhalt.innerHTML = h + '</div>';
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
  function neuerRahmen(url, beiLaden) {
    var n = rahmen.cloneNode(false);
    n.removeAttribute('src');
    if (beiLaden) n.addEventListener('load', beiLaden);
    if (url) n.src = url;
    rahmen.parentNode.replaceChild(n, rahmen);
    rahmen = n;
  }
  function starteSpiel(sp) {
    aktuell = sp;
    document.getElementById('spieltitel').textContent = sp.name;
    document.getElementById('extern').href = sp.url;
    document.getElementById('hinweis-link').href = sp.url;
    document.getElementById('vollbild').hidden = !(buehne.requestFullscreen || buehne.webkitRequestFullscreen);
    hinweis.classList.remove('sichtbar');
    clearTimeout(hinweisTimer);
    hinweisTimer = setTimeout(function () { hinweis.classList.add('sichtbar'); }, 7000);
    neuerRahmen(sp.url, function () { clearTimeout(hinweisTimer); hinweis.classList.remove('sichtbar'); });
  }
  function stoppeSpiel() {
    clearTimeout(hinweisTimer);
    hinweis.classList.remove('sichtbar');
    neuerRahmen(null);
    aktuell = null;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
  }

  /* ---------- Navigation ---------- */
  function route() {
    var m = /^#spiel\/([^\/]+)(\/play)?$/.exec(location.hash);
    var sp = null;
    if (m) { var id = decodeURIComponent(m[1]); sp = spielbar().filter(function (s) { return s.id === id; })[0] || null; }
    if (m && !sp) { location.replace('#'); return; }

    var vorher = body.getAttribute('data-view');
    if (vorher === 'play') stoppeSpiel();

    if (sp && m[2]) {
      body.setAttribute('data-view', 'play');
      starteSpiel(sp);
      document.title = sp.name + ' – Leifs Spiele';
      return;
    }
    if (sp) {
      body.setAttribute('data-view', 'detail');
      renderDetail(sp); renderSide(sp.id);
      document.title = sp.name + ' – Leifs Spiele';
      window.scrollTo(0, 0);
      return;
    }
    body.setAttribute('data-view', 'home');
    renderHome(); renderSide(null);
    document.title = 'Leifs Spiele';
    window.scrollTo(0, vorher === 'home' ? window.scrollY : homeScroll);
  }

  /* ---------- Ereignisse ---------- */
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', function () { if (body.getAttribute('data-view') === 'home') homeScroll = window.scrollY; }, { passive: true });

  document.getElementById('suche').addEventListener('input', function (e) {
    suche = e.target.value.trim().toLowerCase();
    if (body.getAttribute('data-view') !== 'home') location.hash = ''; else renderHome();
  });
  inhalt.addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('.chip') : null;
    if (!c) return;
    filter = c.getAttribute('data-k');
    renderHome();
  });

  document.getElementById('zurueck').addEventListener('click', function () {
    if (aktuell) location.replace('#spiel/' + encodeURIComponent(aktuell.id)); else location.replace('#');
  });
  document.getElementById('neuladen').addEventListener('click', function () { if (aktuell) neuerRahmen(aktuell.url); });
  document.getElementById('vollbild').addEventListener('click', function () {
    var voll = document.fullscreenElement || document.webkitFullscreenElement;
    if (voll) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (buehne.requestFullscreen || buehne.webkitRequestFullscreen).call(buehne);
  });

  function json(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  Promise.all([json('games.json'), json('versions.json').catch(function () { return {}; })])
    .then(function (d) { spiele = d[0].games || []; versionen = d[1] || {}; route(); })
    .catch(function () { inhalt.innerHTML = '<div class="leer" style="padding:80px 28px">Die Spieleliste konnte nicht geladen werden.</div>'; });
})();
