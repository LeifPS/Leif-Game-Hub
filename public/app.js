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
  var ARTEN = { start: 'Start', major: 'Major', minor: 'Großes Update', patch: 'Kleines Update', build: 'Patch' };

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
  var datumZeitFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  function datumText(iso) { return datumFmt.format(new Date(iso)); }
  function datumZeitText(iso) { return datumZeitFmt.format(new Date(iso)) + ' Uhr'; }
  // Ohne Repo (kein Eintrag in versions.json) kann games.json Version und Datum von Hand liefern: "version": "0.1", "aktualisiert": "2026-11-08"
  function ver(sp) {
    if (versionen[sp.id]) return versionen[sp.id];
    if (sp.version) return { version: String(sp.version), datum: sp.aktualisiert ? sp.aktualisiert + 'T12:00:00+01:00' : null, offiziell: false, manuell: true };
    return null;
  }
  function kategorien(sp) { return sp.kategorien || []; }
  function spielbar() { return spiele.filter(function (s) { return s.url; }); }
  /* Favoriten: pro Konto auf dem Server (/api/favoriten), zusätzlich pro Konto auf dem Gerät zwischengespeichert, damit sie sofort da sind. Sie stehen oben in Bibliothek und Spieleliste. */
  var favoriten = [];
  function favIst(id) { return favoriten.indexOf(id) >= 0; }
  function favKey() { var n = window.LghKonto && LghKonto.name(); return n ? 'lgh.fav.' + String(n).toLowerCase() : null; }
  function favLokal() { var k = favKey(); try { var l = k && JSON.parse(localStorage.getItem(k)); return Array.isArray(l) ? l.filter(function (x) { return typeof x === 'string'; }) : []; } catch (e) { return []; } }
  function favNachOben(l) { return l.filter(function (s) { return favIst(s.id); }).concat(l.filter(function (s) { return !favIst(s.id); })); }
  function alphabetisch() { return favNachOben(sortiert().slice().sort(function (x, y) { return x.name.localeCompare(y.name, 'de', { numeric: true, sensitivity: 'base' }); })); }
  function sortiert() { return favNachOben(spielbar().concat(spiele.filter(function (s) { return !s.url; }))); }

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
  /* Release mit Countdown: "release": "2026-11-08T14:00:00+01:00" in games.json hält ein Spiel bis dahin zu (wie Wartung, aber mit Countdown) und gibt es zur Zeit von selbst frei.
     Die Uhrzeit kommt vom Server (Date-Header von games.json), damit falsch gehende Geräteuhren nichts ändern. */
  var zeitVersatz = 0, releaseTimer = null;
  function jetztMs() { return Date.now() + zeitVersatz; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function cdText(sp) {
    var t = Math.max(0, Math.ceil((sp.releaseMs - jetztMs()) / 1000)), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), x = t % 60;
    return d ? d + ' T ' + h + ':' + p2(m) + ':' + p2(x) : h ? h + ':' + p2(m) + ':' + p2(x) : p2(m) + ':' + p2(x);
  }
  function sperrText(sp, praefix) { return sp.cd ? praefix + cdText(sp) : 'Wartung'; }
  function cdAttr(sp, praefix) { return sp.cd ? ' data-cd="' + esc(sp.id) + '" data-p="' + esc(praefix) + '"' : ''; }
  function releaseTick() {
    var offen = false;
    spiele.forEach(function (sp) {
      if (!sp.cd) return;
      if (sp.releaseMs <= jetztMs()) { sp.cd = false; sp.wartung = false; sp.url = sp.vorUrl; releaseFertig = true; } else offen = true;
    });
    if (releaseFertig) {   // frisch freigegeben: Ansichten neu aufbauen, damit überall "Spielen" steht
      releaseFertig = false; ansichtSpeicher = {}; ansichtKey = null; seiteFertig = false;
      if (body.getAttribute('data-view') !== 'play') route();
    }
    var els = document.querySelectorAll('[data-cd]');
    for (var i = 0; i < els.length; i++) {
      var sp = spiele.filter(function (g) { return g.id === els[i].getAttribute('data-cd'); })[0];
      if (sp && sp.cd) els[i].textContent = els[i].getAttribute('data-p') + cdText(sp);
    }
    if (!offen && releaseTimer) { clearInterval(releaseTimer); releaseTimer = null; }
  }
  var releaseFertig = false;
  /* Bewertungen: 1 bis 5 Sterne pro Konto (nur Sterne, keine Texte). Durchschnitt und Anzahl sehen alle, die eigene Wahl nur man selbst. */
  var bewDaten = {};
  var BEW_MIN = 900;   // mindestens 15 Minuten Spielzeit (der Server prüft das auch)
  var dlcReg = {};   // DLC-Seiten, die gerade oder zuletzt angezeigt wurden (Bewertung braucht den Namen)
  function bewHtml(sp) { return '<section class="bew" data-bew="' + esc(sp.id) + '"' + (bewDaten[sp.id] ? '' : ' hidden') + '>' + (bewDaten[sp.id] ? bewInnen(bewDaten[sp.id], sp) : '') + '</section>'; }
  function bewFakt(sp) {
    var d = bewDaten[sp.id];
    return '<span class="bew-fakt" data-bewfakt="' + esc(sp.id) + '">' + (d ? bewFaktText(d) : '…') + '</span>';
  }
  function bewFaktText(d) {
    return d.anzahl ? '<b>' + d.schnitt.toFixed(1).replace('.', ',') + '</b> <span class="bew-stern" aria-label="Sterne">★</span> <span class="bew-anz">(' + d.anzahl + ')</span>' : '<span class="bew-anz">Noch keine Bewertungen</span>';
  }
  function bewInnen(d, sp) {
    var frei = (d.spielzeit || 0) >= (d.mindest || BEW_MIN), fehlt = Math.max(1, Math.ceil(((d.mindest || BEW_MIN) - (d.spielzeit || 0)) / 60));
    var wahl = '';
    for (var n = 5; n >= 1; n--) wahl += '<button type="button" role="radio" class="' + (n <= d.meine ? 'an' : '') + '" data-s="' + n + '" aria-checked="' + (n === d.meine) + '" aria-label="' + n + (n === 1 ? ' Stern' : ' Sterne') + '"' + (frei ? '' : ' disabled') + '>★</button>';
    return '<h2>' + (d.meine ? 'Deine Bewertung' : 'Bewerte ' + esc(sp.name)) + '</h2><div class="bew-zeile"><span class="bew-wahl' + (frei ? '' : ' gesperrt') + '" role="radiogroup" aria-label="Deine Bewertung für ' + esc(sp.name) + '">' + wahl + '</span>' +
      '<span class="bew-hinweis">' + (frei ? (d.meine ? 'Tippe dieselbe Zahl nochmal, um die Bewertung zurückzunehmen.' : 'Nur Sterne, keine Texte.') : 'Bewerten geht ab 15 Minuten Spielzeit. Dir fehlen noch ' + fehlt + (fehlt === 1 ? ' Minute.' : ' Minuten.')) + '</span></div>';
  }
  function bewZeichne(id) {
    var d = bewDaten[id], sp = spiele.filter(function (g) { return g.id === id; })[0] || dlcReg[id];
    if (!d || !sp) return;
    var q = id.replace(/"/g, '');
    [].forEach.call(document.querySelectorAll('.bew[data-bew="' + q + '"]'), function (el) { el.innerHTML = bewInnen(d, sp); el.hidden = false; });
    [].forEach.call(document.querySelectorAll('.bew-fakt[data-bewfakt="' + q + '"]'), function (el) { el.innerHTML = bewFaktText(d); });
  }
  function bewLaden(id) {
    if (!window.LghKonto) return;
    LghKonto.bereit().then(function () { return LghKonto.bewertung.laden(id); }).then(function (res) {
      if (res && res.ok && res.j && typeof res.j.anzahl === 'number') { bewDaten[id] = res.j; bewZeichne(id); }
    });
  }
  function bewSetzen(id, n) {
    var d = bewDaten[id]; if (!d || !window.LghKonto || (d.spielzeit || 0) < (d.mindest || BEW_MIN)) return;
    var neu = n === d.meine ? 0 : n, alt = d;   // dieselbe Zahl nochmal: Bewertung zurücknehmen
    var anz = d.anzahl + (neu && !d.meine ? 1 : !neu && d.meine ? -1 : 0), summe = (d.schnitt || 0) * d.anzahl - d.meine + neu;
    bewDaten[id] = { spiel: id, anzahl: anz, schnitt: anz ? Math.round(summe / anz * 10) / 10 : null, meine: neu, spielzeit: d.spielzeit, mindest: d.mindest };   // sofort anzeigen, der Server liefert gleich den genauen Stand
    bewZeichne(id);
    LghKonto.bewertung.setzen(id, neu).then(function (res) {
      if (res && res.ok && typeof res.j.anzahl === 'number') bewDaten[id] = res.j; else bewDaten[id] = alt;
      bewZeichne(id);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.bew-wahl button') : null;
    if (!b) return;
    var el = b.closest('.bew'); if (el) bewSetzen(el.getAttribute('data-bew'), +b.getAttribute('data-s'));
  });
  function favKnopf(sp, klasse) {
    var an = favIst(sp.id);
    return '<button type="button" class="' + klasse + (an ? ' an' : '') + '" data-fav="' + esc(sp.id) + '" aria-pressed="' + an + '" aria-label="' + esc(sp.name) + (an ? ' aus den Favoriten entfernen' : ' zu den Favoriten hinzufügen') + '"><svg aria-hidden="true"><use href="#i-star"/></svg>' + (klasse === 'fav-ban' ? '<span>Favorit</span>' : '') + '</button>';
  }
  function tile(sp) {
    var offen = !!sp.url, detail = offen || !!sp.wartung, id = encodeURIComponent(sp.id), v = ver(sp);   // Spiele in Wartung haben weiter ihre Detailseite, nur Spielen geht nicht
    var s = '<article class="tile' + (offen ? '' : ' off') + '">';
    s += detail ? '<a class="tile-link" href="#spiel/' + id + '" aria-label="' + esc(sp.name) + '">' : '<div class="tile-link">';
    s += '<div class="tile-art">' + art(sp, 400, 400);
    if (!offen) s += '<span class="badge"' + cdAttr(sp, '') + '>' + (sp.wartung ? sperrText(sp, '') : 'Bald') + '</span>';
    else if (!v && sp.phase === 'alpha') s += '<span class="ver-tag">Alpha</span>';
    else if (v) s += '<span class="ver-tag">' + (v.offiziell ? '' : phaseName(sp, v) + ' ') + esc(vz(v.version)) + '</span>';
    s += '</div>';
    s += '<div class="tile-text"><strong>' + esc(sp.name) + '</strong><span>' + esc(kategorien(sp).join(', ')) + '</span></div>';
    s += detail ? '</a>' : '</div>';
    if (offen) s += '<a class="play" href="#spiel/' + id + '/play" aria-label="' + esc(sp.name) + ' spielen">' + playIcon() + '</a>';
    if (detail) s += favKnopf(sp, 'fav');
    return s + '</article>';
  }

  function passt(sp) {
    if (filter !== 'Alle' && kategorien(sp).indexOf(filter) < 0) return false;
    return !suche || suchScore(sp, suche) > 0;
  }
  /* Suche: ohne Groß-/Kleinschreibung, Umlaute, Akzente und Satzzeichen ("erntezeit" findet "Ernte-Zeit"), alle Wörter müssen vorkommen
     (Name, Kurztext, Beschreibung, Tags). Bei einer Suche sortiert die Trefferqualität: Name beginnt mit dem Suchwort, Name enthält es, Tag, sonst Text. */
  function norm(t) {
    return String(t || '').toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function suchScore(sp, roh) {
    var q = norm(roh); if (!q) return 1;
    var kompakt = function (t) { return t.replace(/ /g, ''); }, toks = q.split(' '), qk = kompakt(q);
    var name = norm(sp.name), tags = norm(kategorien(sp).join(' ')), rest = norm((sp.text || '') + ' ' + (sp.beschreibung || ''));
    var alle = name + ' ' + tags + ' ' + rest;
    if (!(toks.every(function (t) { return alle.indexOf(t) >= 0; }) || kompakt(alle).indexOf(qk) >= 0)) return 0;
    var nk = kompakt(name);
    if (nk.indexOf(qk) === 0) return 100;
    if (nk.indexOf(qk) > 0) return 60;
    if (toks.every(function (t) { return name.indexOf(t) >= 0; })) return 50;
    if (toks.every(function (t) { return tags.indexOf(t) >= 0; })) return 20;
    return 10;
  }
  /* Sortierung der Spieleliste auf der Startseite (gemerkt auf dem Gerät). Favoriten stehen nur bei „Empfohlen“ und „A–Z“ oben; Spiele ohne „Spielen“ (Bald, Wartung) immer hinten. */
  var SORTEN = [['empfohlen', 'Empfohlen'], ['az', 'A–Z'], ['zuletzt', 'Zuletzt gespielt'], ['meist', 'Meine Spielzeit'], ['bewertung', 'Beste Bewertung'], ['update', 'Zuletzt aktualisiert'], ['neu', 'Neueste Spiele']];
  var sortierung = (function () { try { var v = localStorage.getItem('lgh.sortierung'); return SORTEN.some(function (x) { return x[0] === v; }) ? v : 'empfohlen'; } catch (e) { return 'empfohlen'; } })();
  var bewSchnitt = {}, bewAlleGeladen = 0, spielzeitServer = {};
  function zuletztAlle() {
    var zul = zuletztLokal(), alle = {};
    Object.keys(weiterServer).forEach(function (i) { alle[i] = weiterServer[i]; });
    Object.keys(zul).forEach(function (i) { if (!(alle[i] > zul[i])) alle[i] = zul[i]; });
    return alle;
  }
  function sortiereListe(l) {
    if (suche) { var sc = {}; l.forEach(function (sp) { sc[sp.id] = suchScore(sp, suche); }); return l.slice().sort(function (a, b) { return sc[b.id] - sc[a.id]; }); }
    if (sortierung === 'empfohlen') return l;
    if (sortierung === 'az') return favNachOben(l.slice().sort(function (x, y) { return x.name.localeCompare(y.name, 'de', { numeric: true, sensitivity: 'base' }); }));
    var zul = zuletztAlle(), wert = {
      zuletzt: function (sp) { return zul[sp.id] || 0; },
      meist: function (sp) { return spielzeitServer[sp.id] || 0; },
      bewertung: function (sp) { var b = bewSchnitt[sp.id]; return b ? b.schnitt * 1000 + Math.min(b.anzahl, 999) : 0; },
      update: function (sp) { var v = ver(sp); return v && v.datum ? Date.parse(v.datum) : 0; },
      neu: function (sp) { return erstesDatum(sp); },
    }[sortierung];
    return l.slice().sort(function (x, y) {
      var ox = x.url ? 0 : 1, oy = y.url ? 0 : 1;
      return (ox - oy) || (wert(y) - wert(x)) || x.name.localeCompare(y.name, 'de', { numeric: true, sensitivity: 'base' });
    });
  }
  function homeNeu() { if (body.getAttribute('data-view') === 'home') { renderHome(); ansichtKey = homeKey(); } }
  function bewAlleLaden() {
    if (!window.LghKonto || !LghKonto.angemeldet() || Date.now() - bewAlleGeladen < 300000) return;
    bewAlleGeladen = Date.now();
    LghKonto.bewertungen().then(function (res) {
      if (!res.ok || !res.j.spiele) { bewAlleGeladen = 0; return; }
      bewSchnitt = res.j.spiele; if (sortierung === 'bewertung') homeNeu();
    });
  }

  /* ---------- Ansichten ---------- */
  var seiteFertig = false;
  function renderSide(aktivId, freundeAktiv, wikisAktiv) {
    if (seiteFertig) {
      var as = bibliothek.querySelectorAll('.lib-item');
      for (var i = 0; i < as.length; i++) {
        var hr = as[i].getAttribute('href');
        var ist = hr === '#freunde' ? !!freundeAktiv : hr === '#wikis' ? !!wikisAktiv : hr === '#' ? (!aktivId && !freundeAktiv && !wikisAktiv) : (aktivId && hr === '#spiel/' + encodeURIComponent(aktivId));
        as[i].classList.toggle('aktiv', !!ist);
      }
      return;
    }
    seiteFertig = true;
    var s = '<a class="lib-item' + (aktivId || wikisAktiv ? '' : ' aktiv') + '" href="#"><span class="lib-home-icon"><svg width="20" height="20" aria-hidden="true"><use href="#i-home"/></svg></span><span class="name">Startseite</span></a>';
    s += '<a class="lib-item' + (freundeAktiv ? ' aktiv' : '') + '" href="#freunde"><span class="lib-home-icon"><svg width="20" height="20" aria-hidden="true"><use href="#i-people"/></svg></span><span class="name">Freunde</span><span class="freunde-abz" hidden></span></a>';
    if (wikiSpiele().length) s += '<a class="lib-item' + (wikisAktiv ? ' aktiv' : '') + '" href="#wikis"><span class="lib-home-icon"><svg width="20" height="20" aria-hidden="true"><use href="#i-book"/></svg></span><span class="name">Wikis</span></a>';
    s += '<div class="nav-label">Bibliothek</div>';
    var bibListe = alphabetisch().filter(function (sp) { return bibIst(sp.id); });
    if (!bibListe.length) s += '<div class="lib-leer">Hier ist gerade nichts. Alle Spiele findest du auf der Startseite oder über die Suche, und im Pfeil-Menü neben „Spielen“ kannst du sie wieder zur Bibliothek hinzufügen.</div>';
    bibListe.forEach(function (sp) {
      var offen = !!sp.url;
      var inner = '<span class="lib-icon">' + art(sp, 100, 100) + '</span><span class="name">' + esc(sp.name) + '</span>' + (favIst(sp.id) ? '<span class="lib-stern" aria-label="Favorit" title="Favorit">★</span>' : '') + (offen ? '' : '<small' + cdAttr(sp, '') + '>' + (sp.wartung ? sperrText(sp, '') : 'Bald') + '</small>');
      s += offen || sp.wartung
        ? '<a class="lib-item' + (offen ? '' : ' off') + (sp.id === aktivId ? ' aktiv' : '') + '" href="#spiel/' + encodeURIComponent(sp.id) + '">' + inner + '</a>'
        : '<div class="lib-item off">' + inner + '</div>';
    });
    bibliothek.innerHTML = s;
    if (window.LghKonto) LghKonto.abzeichen();
    var n = spielbar().length;
    document.getElementById('side-fuss').innerHTML = n + (n === 1 ? ' Spiel' : ' Spiele') + ' spielbar · <a href="kontakt.html">Kontakt</a> · <a href="credits.html">Quellen</a>';
  }

  /* ---------- Weiterspielen: die zuletzt gespielten Spiele, gemerkt auf dem Gerät (sofort) und im Konto (Spielzeit-Tabelle, geräteübergreifend) ---------- */
  var WEITER_MAX = 4, weiterServer = {}, weiterGeladen = 0;
  function zuletztKey() { var n = window.LghKonto && LghKonto.name(); return n ? 'lgh.zuletzt.' + String(n).toLowerCase() : null; }
  function zuletztLokal() { var k = zuletztKey(); try { return (k && JSON.parse(localStorage.getItem(k))) || {}; } catch (e) { return {}; } }
  function zuletztMerken(id) {
    var k = zuletztKey(); if (!k) return;
    var m = zuletztLokal(); m[id] = Date.now();
    var ids = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 12), neu = {}; ids.forEach(function (i) { neu[i] = m[i]; });
    try { localStorage.setItem(k, JSON.stringify(neu)); } catch (e) { }
    weiterGeladen = 0;
  }
  /* ---------- Bibliothek: standardmäßig alle Spiele. Von Hand entfernte (Pfeil-Menü) fehlen, bis man sie wieder spielt oder hinzufügt; Favoriten bleiben immer drin. Entfernen merkt sich den Zeitpunkt;
     wer das Spiel danach wieder spielt, hat es automatisch wieder drin. Pro Konto auf dem Gerät gemerkt. ---------- */
  function bibKey() { var n = window.LghKonto && LghKonto.name(); return n ? 'lgh.bibl.' + String(n).toLowerCase() : null; }
  function bibLokal() { var k = bibKey(); try { var o = (k && JSON.parse(localStorage.getItem(k))) || {}; return { gespielt: o.gespielt || {}, aus: o.aus || {}, ein: o.ein || {} }; } catch (e) { return { gespielt: {}, aus: {}, ein: {} }; } }
  function bibSchreiben(o) { var k = bibKey(); if (!k) return; try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) { } }
  function bibGespielt(id) { var o = bibLokal(), z = zuletztLokal(); return Math.max(o.gespielt[id] || 0, z[id] || 0, weiterServer[id] || 0); }
  function bibIst(id) {
    if (favIst(id)) return true;
    var o = bibLokal(); if (o.ein[id]) return true;
    var t = bibGespielt(id); return !(o.aus[id] && o.aus[id] >= t);   // standardmäßig stehen alle Spiele drin; nur von Hand Entfernte fehlen, bis man sie wieder spielt
  }
  function bibMerken(id) { var o = bibLokal(); o.gespielt[id] = Date.now(); delete o.aus[id]; bibSchreiben(o); }
  function bibUmschalten(id) {
    var o = bibLokal();
    if (bibIst(id)) { delete o.ein[id]; o.aus[id] = Date.now(); } else { delete o.aus[id]; o.ein[id] = 1; }
    bibSchreiben(o); bibNeu();
  }
  function bibNeu() { seiteFertig = false; renderSide(aktivIdAusHash(), location.hash === '#freunde', location.hash === '#wikis'); }
  function weiterListe() {
    var l = zuletztLokal(), alle = {}; Object.keys(weiterServer).forEach(function (i) { alle[i] = weiterServer[i]; });
    Object.keys(l).forEach(function (i) { if (!(alle[i] > l[i])) alle[i] = l[i]; });
    return Object.keys(alle).sort(function (a, b) { return alle[b] - alle[a]; }).map(function (i) {
      var sp = spiele.filter(function (g) { return g.id === i && g.url; })[0]; return sp ? { sp: sp, ts: alle[i] } : null;
    }).filter(Boolean).slice(0, WEITER_MAX);
  }
  function weiterZeichne() {
    var el = document.getElementById('weiter'); if (!el) return;
    var l = weiterListe();
    if (!l.length) { el.hidden = true; el.innerHTML = ''; return; }
    var jetzt = Date.now();
    el.innerHTML = '<div class="abschnitt"><h2>Weiterspielen</h2></div><div class="weiter-liste">' + l.map(function (x) {
      return '<a class="pf-spiel" href="#spiel/' + encodeURIComponent(x.sp.id) + '/play"><span class="pf-icon">' + art(x.sp, 100, 100) + '</span><span class="pf-text"><b>' + esc(x.sp.name) + '</b><small>Zuletzt ' + relZeit(Math.max(0, (jetzt - x.ts) / 1000)) + '</small></span><span class="weiter-play" aria-hidden="true">' + playIcon() + '</span></a>';
    }).join('') + '</div>';
    el.hidden = false;
  }
  function weiterLaden() {
    if (!window.LghKonto || !LghKonto.angemeldet() || Date.now() - weiterGeladen < 60000) return;
    weiterGeladen = Date.now();
    LghKonto.profil().then(function (res) {
      if (!res.ok || !res.j.spiele) return;
      var m = {}, z = {}; res.j.spiele.forEach(function (x) { if (x.zuletzt) m[x.spiel] = x.zuletzt * 1000; z[x.spiel] = x.sekunden || 0; });
      weiterServer = m; spielzeitServer = z; weiterZeichne(); bibNeu();
      if (sortierung === 'zuletzt' || sortierung === 'meist') homeNeu();
    });
  }

  /* ---------- Neu im Hub: neue Spiele (die letzten 14 Tage) und frische Updates (die letzten 7 Tage), neueste zuerst ---------- */
  var NEU_TAGE = 14, UPD_TAGE = 7, NEU_MAX = 6, NEU_STUFE = { start: 5, major: 4, minor: 3, patch: 2, build: 1 };
  function erstesDatum(sp) {
    var v = ver(sp), t = sp.release ? Date.parse(sp.release) : v && v.erste ? Date.parse(v.erste) : sp.erschienen ? Date.parse(sp.erschienen + 'T12:00:00+02:00') : NaN;
    return t || 0;
  }
  function neuListe() {
    var jetzt = jetztMs(), neu = [], upd = [], neuIds = {};
    spielbar().forEach(function (sp) {
      var t = erstesDatum(sp);
      if (t && jetzt - t >= 0 && jetzt - t < NEU_TAGE * 864e5) { neu.push({ art: 'neu', sp: sp, ts: t }); neuIds[sp.id] = 1; }
    });
    spielbar().forEach(function (sp) {
      var v = ver(sp), t = v && v.datum ? Date.parse(v.datum) : 0;
      if (!neuIds[sp.id] && t && jetzt - t < UPD_TAGE * 864e5) upd.push({ art: 'upd', sp: sp, ts: Math.min(t, jetzt) });
    });
    var nach = function (a, b) { return b.ts - a.ts; };
    return neu.sort(nach).slice(0, 3).concat(upd.sort(nach)).slice(0, NEU_MAX).sort(nach);
  }
  // Die wichtigste Änderung der letzten Tage aus dem Update-Log (höchste Stufe, bei Gleichstand die neueste): { tag: 'Großes Update', text: '…' }
  function neuUpdateText(sp) {
    var d = logCache[sp.id], v = ver(sp);
    if (!d || !d.eintraege || !d.eintraege.length) return { tag: 'Update', text: v ? 'Version ' + vz(v.version) : 'Aktualisiert' };
    var grenze = jetztMs() - UPD_TAGE * 864e5, beste = null;
    d.eintraege.forEach(function (e) {
      if (Date.parse(e.datum) < grenze) return;
      if (!beste || (NEU_STUFE[e.art] || 1) > (NEU_STUFE[beste.art] || 1)) beste = e;
    });
    if (!beste) beste = d.eintraege[0];
    var t = String(beste.text || '').replace(/^\s*(major|gro(?:ß|ss)es\s+update|klein(?:es)?\s+update|patch|minor|build)\s*[:\-–—]\s*/i, '');
    return { tag: beste.art === 'start' || !ARTEN[beste.art] ? 'Update' : ARTEN[beste.art], text: t };
  }
  function neuZeichne() {
    var el = document.getElementById('neu'); if (!el) return;
    var l = neuListe();
    if (!l.length) { el.hidden = true; el.innerHTML = ''; return; }
    var jetzt = jetztMs();
    el.innerHTML = '<div class="abschnitt"><h2>Neu im Hub</h2></div><div class="neu-liste">' + l.map(function (x) {
      var wann = relZeit(Math.max(0, (jetzt - x.ts) / 1000)), u = x.art === 'upd' ? neuUpdateText(x.sp) : null;
      var tag = x.art === 'neu' ? '<span class="neu-tag neu">Neu</span>' : '<span class="neu-tag">' + esc(u.tag) + '</span>';
      return '<a class="pf-spiel neu-item" href="#spiel/' + encodeURIComponent(x.sp.id) + '"' + (u ? ' title="' + esc(u.tag + ': ' + u.text) + '"' : '') + '><span class="pf-icon">' + art(x.sp, 100, 100) + '</span>' +
        '<span class="pf-text"><span class="neu-zeile"><b>' + esc(x.sp.name) + '</b><time>' + esc(wann) + '</time></span><small>' + tag + (u ? esc(u.text) : 'Jetzt spielen') + '</small></span></a>';
    }).join('') + '</div>';
    el.hidden = false;
    l.forEach(function (x) {   // Update-Texte nachladen (Log-Dateien bleiben im Speicher)
      if (x.art !== 'upd' || logCache[x.sp.id]) return;
      fetch('changelog/' + encodeURIComponent(x.sp.id) + '.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { logCache[x.sp.id] = d; neuZeichne(); }).catch(function () { });
    });
  }

  function renderHome() {
    var liste = sortiereListe(sortiert().filter(passt));
    var hero = null;
    if (filter === 'Alle' && !suche) hero = spielbar().filter(function (s) { return s.featured; })[0] || spielbar()[0];
    var h = '';
    if (hero && hero.wallpaper) {
      h += '<section class="hero hero-titel" aria-label="Empfohlen"><h1 class="sr-only">' + esc(hero.name) + '</h1>';
      h += '<a class="hero-bild" href="#spiel/' + encodeURIComponent(hero.id) + '"><img class="titelhg" src="' + esc(hero.wallpaper) + '" alt="" aria-hidden="true" decoding="async"><img class="titelfg" src="' + esc(hero.wallpaper) + '" alt="' + esc(hero.name) + '" decoding="async"></a>';   // sehr breit: Seiten unscharf (siehe style.css)
      h += '<div class="hero-leiste"><div class="hero-text"><p>' + esc(hero.text) + '</p></div>';
      h += '<div class="btn-row"><a class="btn btn-primary" href="#spiel/' + encodeURIComponent(hero.id) + '/play">' + playIcon() + 'Jetzt spielen</a>';
      h += '<a class="btn btn-ghost" href="#spiel/' + encodeURIComponent(hero.id) + '">Mehr erfahren</a></div></div></section>';
    } else if (hero) {
      h += '<section class="hero" aria-label="Empfohlen">' + art(hero, 1200, 480) + '<div class="hero-body">';
      h += '<h1>' + esc(hero.name) + '</h1><p>' + esc(hero.text) + '</p>';
      h += '<div class="btn-row"><a class="btn btn-primary" href="#spiel/' + encodeURIComponent(hero.id) + '/play">' + playIcon() + 'Jetzt spielen</a>';
      h += '<a class="btn btn-ghost" href="#spiel/' + encodeURIComponent(hero.id) + '">Mehr erfahren</a></div></div></section>';
    }
    if (filter === 'Alle' && !suche) h += '<section class="weiter" id="weiter" aria-label="Weiterspielen" hidden></section><section class="neu" id="neu" aria-label="Neu im Hub" hidden></section>';
    var alle = {};
    spiele.forEach(function (sp) { kategorien(sp).forEach(function (k) { alle[k] = 1; }); });
    var chips = ['Alle'].concat(Object.keys(alle).sort(function (a, b) { return a.localeCompare(b, 'de'); }));
    h += '<div class="abschnitt"><h2>' + (suche ? 'Suchergebnisse' : 'Alle Spiele') + '</h2><span class="zahl">' + liste.length + '</span>';
    h += '<div class="chips" role="group" aria-label="Kategorien">' + chips.map(function (k) {
      return '<button type="button" class="chip" data-k="' + esc(k) + '" aria-pressed="' + (k === filter) + '">' + esc(k) + '</button>';
    }).join('') + '</div>';
    if (!suche) h += '<label class="sortierung"><span class="sr-only">Sortieren nach</span><select id="sort-wahl" aria-label="Sortieren">' + SORTEN.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === sortierung ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>';
    h += '</div>';
    h += '<div class="grid">' + (liste.length ? liste.map(tile).join('') : '<div class="leer">Keine Spiele gefunden.</div>') + '</div>';
    inhalt.innerHTML = h;
    weiterZeichne(); weiterLaden(); neuZeichne();
  }

  var SCHRIFTEN = { fredoka: 700, cinzel: 900, lilita: 400, anton: 400, bangers: 400, marker: 400, silkscreen: 700, patrick: 400 };
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

  // games.json: "entwickler" ist eine Liste von Benutzernamen (Hub-Konten); ohne Eintrag gilt "leif"
  function entwicklerListe(sp) {
    var l = Array.isArray(sp.entwickler) ? sp.entwickler : (sp.entwickler ? [sp.entwickler] : ['leif']);
    return l.map(function (n) { return String(n).replace(/^@/, ''); }).filter(Boolean);
  }
  // Angezeigt wird der Anzeigename des Kontos (vom Server, solange er fehlt der Benutzername); Klick öffnet das Profil
  var entwAnz = {}, entwGeladen = false;
  function ladeEntwickler() {
    if (entwGeladen || !window.LghKonto) return;
    entwGeladen = true;
    LghKonto.bereit().then(function () { return LghKonto.entwickler(); }).then(function (res) {
      if (!res.ok) { entwGeladen = false; return; }
      (res.j.entwickler || []).forEach(function (x) { entwAnz[String(x.name).toLowerCase()] = x.anzeige; });
      [].forEach.call(document.querySelectorAll('.entw-link[data-n]'), function (a) { var t = entwAnz[a.getAttribute('data-n').toLowerCase()]; if (t) a.textContent = t; });
    });
  }
  function entwicklerLinks(sp) {
    ladeEntwickler();
    return entwicklerListe(sp).map(function (n) { return '<a class="entw-link" data-n="' + esc(n) + '" href="#profil/' + encodeURIComponent(n) + '">' + esc(entwAnz[n.toLowerCase()] || n) + '</a>'; }).join(', ');
  }
  function spieleVon(name) {
    var lc = String(name).toLowerCase();
    return spiele.filter(function (g) { return entwicklerListe(g).some(function (n) { return n.toLowerCase() === lc; }); });
  }
  function faktZeile(k, v) { return v ? '<div class="fakt"><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>' : ''; }
  function aehnliche(sp) {
    var meine = kategorien(sp);
    return spielbar().filter(function (s) { return s.id !== sp.id; }).map(function (s) {
      var gem = kategorien(s).filter(function (k) { return meine.indexOf(k) >= 0; }).length;
      return { s: s, gem: gem };
    }).sort(function (a, b) { return b.gem - a.gem; }).slice(0, 6).map(function (x) { return x.s; });
  }

  /* Link zum Spiel im Hub: mit play = startet gleich das Spiel (neuer Tab), sonst die Detailseite (zum Teilen) */
  function spielLink(sp, play) {
    return esc(location.href.split('#')[0] + '#spiel/' + encodeURIComponent(sp.id) + (play ? '/play' : ''));
  }
  function spielenMenueZu(g) {
    if (!g) return;
    var m = g.querySelector('.spielen-menue'), p = g.querySelector('.btn-spielen-pfeil');
    if (m) m.hidden = true;
    if (p) p.setAttribute('aria-expanded', 'false');
  }
  function spielenHinweis(g, text) {
    var h = g && g.querySelector('.spielen-hinweis');
    if (!h) return;
    h.textContent = text; h.hidden = false;
    clearTimeout(h._t); h._t = setTimeout(function () { h.hidden = true; }, 2600);
  }
  document.addEventListener('click', function (e) {
    var offen = document.querySelector('.spielen-menue:not([hidden])');
    var pfeil = e.target.closest && e.target.closest('.btn-spielen-pfeil');
    if (pfeil) {
      var g = pfeil.closest('.spielen-gruppe'), m = g.querySelector('.spielen-menue'), auf = m.hidden;
      if (offen && offen !== m) spielenMenueZu(offen.closest('.spielen-gruppe'));
      m.hidden = !auf; pfeil.setAttribute('aria-expanded', auf ? 'true' : 'false');
      if (auf) { var ers = m.querySelector('.spielen-eintrag'); if (ers && e.detail === 0) ers.focus(); }
      return;
    }
    var ein = e.target.closest && e.target.closest('.spielen-eintrag');
    if (ein && ein.hasAttribute('data-fav')) return;   // Favorit: Menü bleibt offen, damit man die Änderung sieht (der Favoriten-Handler übernimmt)
    if (ein) {
      var gr = ein.closest('.spielen-gruppe');
      if (ein.getAttribute('data-a') === 'bib') {
        var mb = /^#spiel\/([^\/]+)/.exec(location.hash), bid = mb && decodeURIComponent(mb[1]);
        if (bid) { bibUmschalten(bid); var bt = ein.querySelector('.bib-text'); if (bt) bt.textContent = bibIst(bid) ? 'Aus Bibliothek entfernen' : 'Zur Bibliothek hinzufügen'; spielenHinweis(gr, bibIst(bid) ? 'Zur Bibliothek hinzugefügt.' : 'Aus der Bibliothek entfernt.'); }
      }
      if (ein.getAttribute('data-a') === 'teilen') {
        var mm = /^#spiel\/([^\/]+)/.exec(location.hash);
        var spiel = mm && spiele && spiele.filter(function (s) { return s.id === decodeURIComponent(mm[1]); })[0];
        if (spiel) {
          var url = location.href.split('#')[0] + '#spiel/' + encodeURIComponent(spiel.id);
          var kopieren = function () {
            var ok = function () { spielenHinweis(gr, 'Link kopiert.'); };
            var nein = function () { spielenHinweis(gr, 'Link: ' + url); };
            try { navigator.clipboard.writeText(url).then(ok, nein); } catch (x) { nein(); }
          };
          if (navigator.share) navigator.share({ title: spiel.name + ' im Leif Game Hub', text: spiel.name + ' – ' + (spiel.text || ''), url: url }).catch(function (x) { if (!x || x.name !== 'AbortError') kopieren(); });
          else kopieren();
        }
      }
      spielenMenueZu(gr);
      return;
    }
    if (offen && !(e.target.closest && e.target.closest('.spielen-menue'))) spielenMenueZu(offen.closest('.spielen-gruppe'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var offen = document.querySelector('.spielen-menue:not([hidden])');
    if (offen) { var g = offen.closest('.spielen-gruppe'); spielenMenueZu(g); var p = g.querySelector('.btn-spielen-pfeil'); if (p) p.focus(); }
  });
  function renderDetail(sp) {
    var id = encodeURIComponent(sp.id);
    var titel = !!sp.wallpaper;
    var v = ver(sp);
    var online = kategorien(sp).indexOf('Online') >= 0;
    var h = '<div class="detail-banner' + (titel ? ' titel' : '') + '">' + (titel ? '<div class="titelrahmen"><img class="titelhg" src="' + esc(sp.wallpaper) + '" alt="" aria-hidden="true" decoding="async"><img class="titelbild titelfg" src="' + esc(sp.wallpaper) + '" alt="' + esc(sp.name) + '" decoding="async"></div>' : art(sp, 1400, 420)) + '<a class="zurueck-link" href="#"><svg aria-hidden="true"><use href="#i-back"/></svg>Alle Spiele</a>' + ((!sp.url && sp.wartung) ? favKnopf(sp, 'fav-ban') : '') + '</div>';
    h += '<div class="shop' + (titel ? ' titel' : '') + '">';
    h += '<div class="shop-titelzeile">' + titelHtml(sp) + '<div class="spiel-aktion"><div class="spielinfo" hidden></div>' + (sp.url ? '<div class="spielen-gruppe"><a class="btn btn-primary btn-spielen" href="#spiel/' + id + '/play">' + playIcon() + 'Spielen</a>' +
      '<button type="button" class="btn btn-primary btn-spielen-pfeil" aria-haspopup="menu" aria-expanded="false" aria-label="Weitere Optionen zum Spielen"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg></button>' +
      '<div class="spielen-menue" role="menu" hidden>' +
      '<a role="menuitem" class="spielen-eintrag" data-a="tab" href="' + spielLink(sp, true) + '" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-external"/></svg>In neuem Tab öffnen</a>' +
      (function () { var an = favIst(sp.id); return '<button type="button" role="menuitem" class="spielen-eintrag fav-eintrag' + (an ? ' an' : '') + '" data-fav="' + esc(sp.id) + '" aria-pressed="' + an + '"><svg aria-hidden="true"><use href="#i-star"/></svg><span class="fav-text">' + (an ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen') + '</span></button>'; })() +
      ('<button type="button" role="menuitem" class="spielen-eintrag" data-a="bib" data-id="' + esc(sp.id) + '"' + (favIst(sp.id) ? ' hidden' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h4v15H5zM11 4.5h4v15h-4zM17.2 5.2l3.6.9-3.2 14-3.6-.9z"/></svg><span class="bib-text">' + (bibIst(sp.id) ? 'Aus Bibliothek entfernen' : 'Zur Bibliothek hinzufügen') + '</span></button>') +
      '<button type="button" role="menuitem" class="spielen-eintrag" data-a="teilen"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="12" r="2.4"/><circle cx="17.5" cy="6" r="2.4"/><circle cx="17.5" cy="18" r="2.4"/><path d="M8.6 10.8l6.8-3.6M8.6 13.2l6.8 3.6"/></svg>Spiel teilen</button>' +
      '</div><div class="spielen-hinweis" role="status" aria-live="polite" hidden></div></div>' : '<span class="btn btn-spielen gesperrt" aria-disabled="true"' + cdAttr(sp, '') + '>' + (sp.wartung ? sperrText(sp, '') : 'Bald') + '</span>') + '</div></div>';
    var gal = galerieHtml(sp);
    var text = (sp.beschreibung && sp.beschreibung !== sp.text) ? '<section class="shop-text"><h2>Über dieses Spiel</h2><p>' + esc(sp.beschreibung) + '</p></section>' : '';
    h += '<div class="shop-oben' + (gal ? '' : ' ohne-galerie') + '">' + (gal ? '<div class="shop-haupt">' + gal + text + '</div>' : '');
    h += '<aside class="shop-info"><div class="shop-kopf"><div class="shop-icon">' + art(sp, 300, 300) + '</div><p class="kurz">' + esc(sp.text) + '</p></div><dl class="fakten">';
    var erschienen = sp.release ? sp.release : v && v.erste ? v.erste : (sp.erschienen ? sp.erschienen + 'T12:00:00+02:00' : null);   // ohne Repo: Datum von Hand (games.json: "erschienen"); mit "release" gilt dessen Zeitpunkt
    if (sp.cd) h += faktZeile('Wird veröffentlicht', esc(datumZeitText(sp.release)));   // noch nicht freigegeben: Zeitpunkt statt "Erschienen"
    else if (erschienen) h += faktZeile('Erschienen', esc(datumText(erschienen)));
    if (sp.offiziell_ab) {
      var vorbei = sp.offiziell_ab <= new Date().toISOString().slice(0, 10);
      h += faktZeile(vorbei ? 'Offiziell seit' : 'Offiziell ab', esc(datumText(sp.offiziell_ab + 'T12:00:00+02:00')));
    }
    if (!v && sp.phase) h += faktZeile('Status', '<span class="ver-pill' + (sp.phase === 'alpha' ? ' alpha' : '') + '">' + phaseName(sp, null) + '</span>');
    if (v) h += faktZeile('Status', '<span class="ver-pill' + (v.offiziell ? ' offiziell' : sp.phase === 'alpha' ? ' alpha' : '') + '">' + phaseName(sp, v) + '</span> Version ' + esc(vz(v.version)));
    if (v && v.datum) h += faktZeile('Zuletzt aktualisiert', esc(datumText(v.datum)));
    if (sp.url) h += faktZeile('Bewertung', bewFakt(sp));
    h += faktZeile(entwicklerListe(sp).length > 1 ? 'Entwickler' : 'Entwickler', entwicklerLinks(sp));   // games.json: "entwickler" = Liste von Benutzernamen
    h += faktZeile('Spielmodus', online ? 'Mehrspieler (online)' : 'Einzelspieler');
    h += faktZeile('Plattform', 'Browser · ' + esc(sp.sprache || 'Deutsch'));   // games.json: "sprache" falls nicht Deutsch
    if (sp.wiki) h += faktZeile('Wiki', '<a class="fakt-link" href="' + esc(sp.wiki) + '" target="_blank" rel="noopener">Zum Wiki<svg width="14" height="14" aria-hidden="true"><use href="#i-external"/></svg></a>');
    if (kategorien(sp).length) h += faktZeile('Tags', pills(sp));
    h += '</dl>';
    h += '</aside></div>';
    if (!gal) h += text;
    h += '<section class="dlc-bereich" data-spiel="' + esc(sp.id) + '" hidden></section>';   // Zusatzinhalte (füllt dlcFuellen)
    if (sp.url) h += bewHtml(sp);   // Bewertung abgeben: über den Neuigkeiten
    h += '<section class="log" id="log"><h2>Neuigkeiten und Updates</h2><div class="log-liste" id="log-liste"><div class="log-leer">Lädt …</div></div></section>';
    h += '<details class="sysreq"><summary>Systemanforderungen</summary><ul><li>Läuft direkt im Browser, ohne Download und ohne Installation.</li><li>Aktueller Browser (Chrome, Safari, Edge oder Firefox) auf PC, Handy oder Tablet.</li><li>Bedienung mit Maus oder Touch.</li>' + (online ? '<li>Internetverbindung erforderlich.</li>' : '') + '</ul></details>';
    var mehr = aehnliche(sp);
    if (mehr.length) h += '<section class="mehr"><h2>Ähnliche Spiele</h2><div class="grid">' + mehr.map(tile).join('') + '</div></section>';
    inhalt.innerHTML = h + '</div>';
    galerieBinden(sp);
    ladeLog(sp);
    dlcFuellen(); dlcLaden();
  }

  /* ---------- Update-Log ---------- */
  function ladeLog(sp) {
    var ziel = document.getElementById('log-liste');
    if (!versionen[sp.id]) { ziel.innerHTML = '<div class="log-leer">Für dieses Spiel gibt es noch keinen Update-Log.</div>'; return; }
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
    if (!d || (d.lgh !== 'stand' && d.lgh !== 'status' && d.lgh !== 'hallo' && d.lgh !== 'fertig' && d.lgh !== 'dlc' && d.lgh !== 'ton-bereit')) return;
    var q = absender(e);
    if (!q) return;
    try { if (e.origin !== new URL(q.url).origin) return; } catch (x) { return; }
    // Übergabe großer Stände: Spiel fragt nach dem Stand (hallo) und meldet, dass es ihn eingelesen hat (fertig)
    if (d.lgh === 'hallo') { var u = q.el && q.el._uebergabe; if (u && u.art === 'msg') { try { e.source.postMessage({ lgh: 'daten', json: u.json }, e.origin); } catch (x) { } } return; }
    // Das Spiel kann die Lautstärke aus dem Spielmenü übernehmen (siehe spielmenue.js und tools/lgh-vorlade.js)
    if (d.lgh === 'ton-bereit') { if (q.el && !q.abgang) { q.el._ton = true; if (window.LghSpielMenue) window.LghSpielMenue.ton(e.source, e.origin); } return; }
    if (d.lgh === 'fertig') { if (q.el && q.el._uebergabe) q.el._uebergabe.fertig = true; return; }
    if (d.lgh === 'dlc') {
      if (d.spiel !== q.id || q.abgang) return;
      var quelle = e.source, qurl = q.url, qid = q.id;
      (dlcDaten ? Promise.resolve() : dlcLaden()).then(function () {
        dlcAnFenster(quelle, qurl, qid);
        if (d.aktion === 'kaufen' && typeof d.id === 'string' && dlcFuer(qid).some(function (x) { return x.id === d.id; })) dlcKaufDialog(d.id);
      });
      return;
    }
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
    document.getElementById('vollbild').hidden = !(buehne.requestFullscreen || buehne.webkitRequestFullscreen);   // das iPhone kennt keinen Vollbildmodus für Seiten; dort füllt das Spiel ohnehin die ganze Seite
    hinweis.classList.remove('sichtbar');
    clearTimeout(hinweisTimer);
    var zaehler = ++startZaehler;
    // Ohne Anmeldung startet nichts (auch nicht über einen direkten Link). Ist das Konto-Modul nicht da, geht es trotzdem los.
    var bereit; try { bereit = window.LghKonto ? window.LghKonto.bereit() : Promise.resolve(); } catch (x) { bereit = Promise.resolve(); }
    bereit.then(function () {
      if (aktuell !== sp || zaehler !== startZaehler) return;
      ausKonto(function (k) { k.spiel(sp.id); });
      var warDrin = bibIst(sp.id); zuletztMerken(sp.id); bibMerken(sp.id); if (!warDrin) bibNeu();
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
  /* ---------- Wikis: jedes Spiel kann ein eigenes Wiki haben (games.json: "wiki" = Adresse), die Seite listet sie auf ---------- */
  function wikiSpiele() { return alphabetisch().filter(function (sp) { return sp.wiki; }); }
  function renderWikis() {
    var l = wikiSpiele(), h = '<div class="fr-wrap"><h1 class="fr-titel">Wikis</h1><p class="fr-sub">Hier steht, was man über die Spiele wissen kann. Jedes Spiel hat sein eigenes Wiki.</p>';
    if (!l.length) h += '<div class="fr-leer">Zu den Spielen gibt es noch keine Wikis.</div>';
    else {
      h += '<div class="fr-liste">';
      l.forEach(function (sp) {
        h += '<a class="fr-item wk-item" href="' + esc(sp.wiki) + '" target="_blank" rel="noopener"><span class="wk-icon">' + art(sp, 100, 100) + '</span>' +
          '<div class="fr-text"><div class="fr-name">' + esc(sp.name) + ' – Wiki</div><div class="fr-status">' + esc(sp.text || '') + '</div></div>' +
          '<span class="btn btn-ghost fr-btn wk-auf">Öffnen<svg width="16" height="16" aria-hidden="true"><use href="#i-external"/></svg></span></a>';
      });
      h += '</div>';
    }
    inhalt.innerHTML = h + '</div>';
  }

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
    var gr = d.gruppen || [];
    if (gr.length || d.freunde.length) {
      h += '<h2 class="fr-abschnitt fr-gr-kopf">Gruppen <span class="fr-zahl">' + gr.length + '</span>' + (d.freunde.length ? '<button type="button" class="btn btn-ghost fr-btn fr-gr-neu" data-a="gruppeneu">Neue Gruppe</button>' : '') + '</h2>';
      if (!gr.length) h += '<div class="fr-leer">Noch keine Gruppen. Lege eine an, um mit mehreren Freunden gleichzeitig zu schreiben.</div>';
      else {
        h += '<div class="fr-liste">';
        gr.forEach(function (g) {
          var ziel = '#gruppe/' + g.id, text = g.vorschau ? '<b>' + n(g.von || '') + '</b>: ' + n(LghKonto.chatKurz(g.vorschau)) : 'Noch keine Nachrichten';
          h += '<div class="fr-item"><a class="fr-hl" href="' + ziel + '" aria-label="Gruppe ' + n(g.name) + '">' + LghKonto.avatar('avatar', '#g' + g.id, g.name, null) +
            '<div class="fr-text"><div class="fr-name">' + n(g.name) + '<span class="fr-at">' + g.mitglieder + ' Mitglieder</span></div><div class="fr-status fr-gr-text">' + text + '</div></div></a>' +
            '<div class="fr-akt"><a class="btn ' + (g.ungelesen ? 'btn-primary' : 'btn-ghost') + ' fr-btn" href="' + ziel + '">Chat' + (g.ungelesen ? '<span class="fr-chatzahl">' + (g.ungelesen > 9 ? '9+' : g.ungelesen) + '</span>' : '') + '</a></div></div>';
        });
        h += '</div>';
      }
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
        else if (f.privat) status = '<span class="punkt"></span>Status privat';
        else status = '<span class="punkt"></span>' + (f.zuletzt ? 'Zuletzt online ' + relZeit(Math.max(0, d.jetzt - f.zuletzt)) : 'Noch nie online');
        if (f.ungelesen) status += '<span class="fr-vorschau">' + n(LghKonto.chatKurz(f.vorschau || '')) + '</span>';
        akt = '<a class="btn ' + (f.ungelesen ? 'btn-primary' : 'btn-ghost') + ' fr-btn" href="#chat/' + encodeURIComponent(f.name) + '">Chat' + (f.ungelesen ? '<span class="fr-chatzahl">' + (f.ungelesen > 9 ? '9+' : f.ungelesen) + '</span>' : '') + '</a><button type="button" class="btn btn-ghost fr-btn" data-a="einladen" data-n="' + n(f.name) + '">Einladen</button>' + akt;
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
      LghKonto.setzeOffene(res.j.eingehend.length + (res.j.chat || 0));
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
      var ziel = f.ungelesen ? '#chat/' + encodeURIComponent(f.name) : '#freunde', status = '&nbsp;';
      if (f.spiel) {
        if (spielbar().some(function (s) { return s.id === f.spiel; })) ziel = '#spiel/' + encodeURIComponent(f.spiel);
        status = esc(spielName(f.spiel));
      } else if (f.online) status = 'Im Hub';
      h += '<a class="fr-karte' + (f.spiel || f.online ? '' : ' aus') + '" href="' + ziel + '"' + (f.spiel ? ' data-fr="' + n(f.name) + '"' : '') + ' title="' + n(anz(f)) + ' (@' + n(f.name) + ')' + (f.spiel ? ' spielt ' + n(spielName(f.spiel)) : f.online ? ' ist im Hub' : '') + '">' +
        LghKonto.avatar('fr-kreis', f.name, anz(f), f.av, (f.spiel || f.online ? '<span class="fr-punkt"></span>' : '') + (f.ungelesen ? '<span class="fr-chatpunkt">' + (f.ungelesen > 9 ? '9+' : f.ungelesen) + '</span>' : '')) +
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
      LghKonto.setzeOffene(res.j.eingehend.length + (res.j.chat || 0));
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
    if (a === 'gruppeneu') { neueGruppeDialog(); return; }
    if (a === 'einladen') {
      var fz = freundeDaten && freundeDaten.freunde.filter(function (y) { return y.name === nm; })[0], an = fz ? anz(fz) : nm;
      einladenDialog(nm, an, function () { frMeldung('Einladung an ' + an + ' gesendet.'); ladeFreunde(); });
      return;
    }
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

  /* ---------- Einladungen: Karte im Chat und Auswahl des Spiels ---------- */
  function einlBlase(m) {
    var e = window.LghKonto && LghKonto.einladung(m.text), sp = e && spielbar().filter(function (g) { return g.id === e.spiel; })[0];
    if (!sp) return '<div class="ch-blase">' + esc(m.text) + '</div>';
    var wer = chat && chat.gruppe ? (m.von === 'ich' ? 'Du hast die Gruppe eingeladen' : esc(m.anzeige || m.name) + ' lädt ein')
      : m.von === 'ich' ? 'Du hast ' + esc(chat ? chat.anzeige || chat.name : '') + ' eingeladen' : esc(chat ? chat.anzeige || chat.name : '') + ' lädt dich ein';
    return '<div class="ch-blase ch-einl"><span class="pf-icon">' + art(sp, 100, 100) + '</span><span class="ch-einl-text"><b>' + esc(sp.name) + '</b><small>' + wer + (e.raum ? ' · Raum <code>' + esc(e.raum) + '</code>' : '') + '</small></span>' +
      '<a class="btn btn-primary ch-einl-los" href="#spiel/' + encodeURIComponent(sp.id) + '/play"' + (e.raum ? ' data-raum="' + esc(e.raum) + '"' : '') + '>Spielen</a></div>';
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a.ch-einl-los[data-raum]') : null;
    if (a) { try { navigator.clipboard.writeText(a.getAttribute('data-raum')); } catch (x) { } }   // Raumcode liegt dann in der Zwischenablage, das Spiel startet über den Link
  });
  function einlSpiele() {
    var alle = zuletztAlle();
    return spielbar().slice().sort(function (x, y) {
      return (favIst(y.id) - favIst(x.id)) || ((alle[y.id] || 0) - (alle[x.id] || 0)) || x.name.localeCompare(y.name, 'de', { numeric: true, sensitivity: 'base' });
    });
  }
  function einladenDialog(name, anzeige, fertig) {
    if (document.querySelector('.dlg-einl') || !window.LghKonto) return;
    var pfeil = '<svg class="pfeil" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5L15 12l-5.5 5.5"/></svg>';
    var zeilen = einlSpiele().map(function (sp) {
      var r = LghKonto.raumFuer(sp.id);
      return '<button type="button" class="dlg-zeile" data-sp="' + esc(sp.id) + '"><span class="pf-icon einl-icon">' + art(sp, 100, 100) + '</span><span class="dlg-ztext"><b>' + esc(sp.name) + '</b>' + (r ? '<small>Raum ' + esc(r) + ' wird mitgeschickt</small>' : '') + '</span>' + pfeil + '</button>';
    }).join('');
    var hinter = document.createElement('div');
    hinter.className = 'dlg-hinter dlg-einl';
    hinter.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="einl-t"><div class="dlg-titel" id="einl-t">' + esc(anzeige) + ' einladen</div><div class="dlg-sub" style="margin:2px 0 12px">Zu welchem Spiel? ' + esc(anzeige) + ' bekommt eine Nachricht mit Knopf zum Spielen.</div>' +
      '<div class="dlg-gruppe einl-liste">' + (zeilen || '<div class="fr-leer">Es gibt noch kein spielbares Spiel.</div>') + '</div><div class="fr-meldung fehler" id="einl-meld" role="status"></div>' +
      '<div class="dlg-fuss"><button type="button" class="btn btn-ghost" data-zu>Abbrechen</button></div></div>';
    function zu() { hinter.remove(); document.removeEventListener('keydown', taste); }
    function taste(ev) { if (ev.key === 'Escape') zu(); }
    hinter.addEventListener('click', function (ev) {
      if (ev.target === hinter || (ev.target.closest && ev.target.closest('[data-zu]'))) return zu();
      var b = ev.target.closest ? ev.target.closest('[data-sp]') : null;
      if (!b || b.disabled) return;
      var id = b.getAttribute('data-sp'), r = LghKonto.raumFuer(id), m = hinter.querySelector('#einl-meld');
      m.textContent = ''; [].forEach.call(hinter.querySelectorAll('[data-sp]'), function (x) { x.disabled = true; });
      LghKonto.chat.senden(name, '[einladung:' + id + (r ? ':' + r : '') + ']').then(function (res) {
        if (res.ok) { zu(); fertig(res); return; }
        [].forEach.call(hinter.querySelectorAll('[data-sp]'), function (x) { x.disabled = false; });
        m.textContent = res.status === 404 && res.j.fehler === 'unbekannt' ? CHAT_FEHLER.unbekannt : (CHAT_FEHLER[res.j.fehler] || 'Das hat nicht geklappt.');
      });
    });
    document.addEventListener('keydown', taste);
    document.body.appendChild(hinter);
    var erst = hinter.querySelector('[data-sp]'); if (erst) erst.focus();
  }

  /* ---------- Gruppen: anlegen und verwalten ---------- */
  function grFehler(res, standard) {
    var f = res.j && res.j.fehler;
    if (res.status === 429) return 'Zu viele neue Gruppen in kurzer Zeit. Bitte später noch einmal.';
    return { name: 'Der Name braucht 1 bis 30 Zeichen, ohne < und >.', unbekannt: 'Das geht nicht (mehr): Die Person ist kein Freund oder die Gruppe gibt es nicht.', nur_besitzer: 'Das darf nur, wer die Gruppe angelegt hat.',
      zu_viele: 'Eine Gruppe hat höchstens 12 Mitglieder.', zu_viele_gruppen: 'Du bist schon in 20 Gruppen.', ziel_zu_viele_gruppen: 'Diese Person ist schon in 20 Gruppen.', schon_mitglied: 'Diese Person ist schon in der Gruppe.',
      netz: 'Keine Verbindung zum Server.', server: 'Der Server hatte ein Problem. Bitte gleich noch einmal versuchen.' }[f] || standard || 'Das hat nicht geklappt.';
  }
  function grDialog(klasse, html, beiKlick) {
    if (document.querySelector('.' + klasse)) return null;
    var hinter = document.createElement('div');
    hinter.className = 'dlg-hinter ' + klasse;
    hinter.innerHTML = '<div class="dlg" role="dialog" aria-modal="true">' + html + '</div>';
    function zu() { hinter.remove(); document.removeEventListener('keydown', taste); }
    function taste(e) { if (e.key === 'Escape') zu(); }
    hinter.addEventListener('click', function (e) {
      if (e.target === hinter || (e.target.closest && e.target.closest('[data-zu]'))) return zu();
      beiKlick(e, zu);
    });
    document.addEventListener('keydown', taste);
    document.body.appendChild(hinter);
    hinter._zu = zu;
    return hinter;
  }
  function neueGruppeDialog() {
    var fr = (freundeDaten && freundeDaten.freunde) || [];
    var zeilen = fr.map(function (f) {
      return '<label class="gr-wahl"><input type="checkbox" value="' + esc(f.name) + '">' + LghKonto.avatar('avatar', f.name, anz(f), f.av) + '<span class="gr-wname"><b>' + esc(anz(f)) + '</b><small>@' + esc(f.name) + '</small></span></label>';
    }).join('');
    var d = grDialog('dlg-gr', '<div class="dlg-titel">Neue Gruppe</div><div class="dlg-sub" style="margin:2px 0 12px">Alle in der Gruppe können schreiben. Du kannst nur deine Freunde hinzufügen (bis zu 11).</div>' +
      '<input class="gr-name" id="gr-name" type="text" maxlength="30" placeholder="Name der Gruppe, z. B. Familie" autocomplete="off" aria-label="Name der Gruppe">' +
      '<div class="dlg-gruppe gr-liste">' + (zeilen || '<div class="fr-leer">Du hast noch keine Freunde.</div>') + '</div>' +
      '<div class="fr-meldung fehler" id="gr-meld" role="status"></div>' +
      '<div class="dlg-fuss"><button type="button" class="btn btn-ghost" data-zu>Abbrechen</button><button type="button" class="btn btn-primary" data-gr="anlegen" style="margin-left:10px">Anlegen</button></div>', function (e, zu) {
        var b = e.target.closest ? e.target.closest('[data-gr="anlegen"]') : null;
        if (!b || b.disabled) return;
        var m = document.getElementById('gr-meld'), name = document.getElementById('gr-name').value.trim();
        var namen = [].map.call(document.querySelectorAll('.dlg-gr .gr-wahl input:checked'), function (x) { return x.value; });
        if (!name) { m.textContent = 'Gib der Gruppe einen Namen.'; return; }
        if (namen.length > 11) { m.textContent = 'Wähle höchstens 11 Freunde aus.'; return; }
        m.textContent = ''; b.disabled = true;
        LghKonto.gruppen.anlegen(name, namen).then(function (res) {
          if (res.ok) { zu(); location.hash = '#gruppe/' + res.j.gruppe.id; return; }
          b.disabled = false; m.textContent = grFehler(res);
        });
      });
    if (d) { var ein = d.querySelector('#gr-name'); if (ein) ein.focus(); }
  }
  function gruppeInfo(id) {
    var st = { g: null, frage: '', freunde: (freundeDaten && freundeDaten.freunde) || [] }, hinter = null;
    function zeichne() {
      var g = st.g, eig = g.eigener, namen = {};
      g.mitglieder.forEach(function (m) { namen[m.name.toLowerCase()] = 1; });
      var frei = st.freunde.filter(function (f) { return !namen[f.name.toLowerCase()]; });
      var h = '<div class="dlg-titel">' + esc(g.name) + '</div><div class="dlg-sub" style="margin:2px 0 12px">' + g.mitglieder.length + ' von 12 Mitgliedern</div>';
      if (eig) h += '<form class="gr-umb" data-gr="umbenennen"><input class="gr-name" id="gr-neuname" type="text" maxlength="30" value="' + esc(g.name) + '" aria-label="Gruppenname"><button class="btn btn-ghost" type="submit">Umbenennen</button></form>';
      h += '<div class="dlg-gruppe gr-liste">' + g.mitglieder.map(function (m) {
        return '<div class="gr-mitglied">' + LghKonto.avatar('avatar', m.name, m.anzeige, m.av) + '<span class="gr-wname"><b>' + esc(m.anzeige) + (m.ich ? ' (du)' : '') + '</b><small>@' + esc(m.name) + (m.besitzer ? ' · hat die Gruppe angelegt' : '') + '</small></span>' +
          (eig && !m.ich ? '<button type="button" class="btn btn-ghost fr-btn leise" data-gr="raus" data-n="' + esc(m.name) + '">Entfernen</button>' : '') + '</div>';
      }).join('') + '</div>';
      if (eig) h += frei.length && g.mitglieder.length < 12
        ? '<form class="gr-umb" data-gr="hinzu" style="margin-top:12px"><select class="gr-name" id="gr-hinzu" aria-label="Freund hinzufügen">' + frei.map(function (f) { return '<option value="' + esc(f.name) + '">' + esc(anz(f)) + ' (@' + esc(f.name) + ')</option>'; }).join('') + '</select><button class="btn btn-ghost" type="submit">Hinzufügen</button></form>'
        : '<div class="dlg-sub" style="margin-top:12px">' + (g.mitglieder.length >= 12 ? 'Die Gruppe ist voll.' : 'Alle deine Freunde sind schon dabei.') + '</div>';
      h += '<div class="fr-meldung fehler" id="gr-meld" role="status"></div><div class="dlg-fuss gr-fuss">' +
        '<button type="button" class="btn btn-ghost gefahr" data-gr="verlassen">' + (st.frage === 'verlassen' ? 'Wirklich verlassen?' : 'Gruppe verlassen') + '</button>' +
        (eig ? '<button type="button" class="btn btn-ghost gefahr" data-gr="loeschen">' + (st.frage === 'loeschen' ? 'Wirklich löschen?' : 'Gruppe löschen') + '</button>' : '') +
        '<button type="button" class="btn btn-primary" data-zu style="margin-left:auto">Fertig</button></div>';
      hinter.firstChild.innerHTML = h;
    }
    function neu(g) {
      st.g = g; st.frage = '';
      var t = document.getElementById('ch-status'); if (t) t.textContent = g.mitglieder.length + ' Mitglieder';
      var nm = document.getElementById('ch-gname'); if (nm) nm.textContent = g.name;
      if (chat && chat.gruppe === g.id) chat.anzeige = g.name;
      zeichne();
    }
    function fehl(res) { var m = document.getElementById('gr-meld'); if (m) m.textContent = grFehler(res); }
    hinter = grDialog('dlg-gr', '<div class="fr-leer">Lädt …</div>', function (e, zu) {
      var b = e.target.closest ? e.target.closest('[data-gr]') : null;
      if (!b || !st.g || b.tagName === 'FORM' || b.disabled) return;
      var a = b.getAttribute('data-gr');
      if (a === 'raus') { b.disabled = true; LghKonto.gruppen.entfernen(id, b.getAttribute('data-n')).then(function (r) { if (r.ok) neu(r.j.gruppe); else { fehl(r); b.disabled = false; } }); return; }
      if (a === 'verlassen' || a === 'loeschen') {
        if (st.frage !== a) { st.frage = a; zeichne(); setTimeout(function () { if (st.frage === a && hinter.isConnected) { st.frage = ''; zeichne(); } }, 5000); return; }
        b.disabled = true;
        LghKonto.gruppen[a](id).then(function (r) {
          if (r.ok || r.status === 404) { zu(); chatStopp(); location.hash = '#freunde'; } else { fehl(r); b.disabled = false; }
        });
      }
    });
    if (!hinter) return;
    hinter.addEventListener('submit', function (e) {
      var f = e.target; e.preventDefault();
      var a = f.getAttribute('data-gr');
      if (a === 'umbenennen') LghKonto.gruppen.umbenennen(id, document.getElementById('gr-neuname').value).then(function (r) { if (r.ok) neu(r.j.gruppe); else fehl(r); });
      else if (a === 'hinzu') LghKonto.gruppen.mitglied(id, document.getElementById('gr-hinzu').value).then(function (r) { if (r.ok) neu(r.j.gruppe); else fehl(r); });
    });
    LghKonto.gruppen.details(id).then(function (res) {
      if (!hinter.isConnected) return;
      if (!res.ok) { hinter._zu(); return; }
      neu(res.j.gruppe);
      LghKonto.freunde.liste().then(function (r) { if (r.ok && hinter.isConnected) { st.freunde = r.j.freunde; zeichne(); } });
    });
  }

  /* ---------- Chat unter Freunden ---------- */
  /* Eine Unterhaltung pro Freund (#chat/name). Neue Nachrichten werden alle paar Sekunden abgeholt, solange der Tab sichtbar ist.
     Nur Text; Links werden nicht angeklickbar gemacht. Der Server prüft alles noch einmal (nur Freunde, 500 Zeichen, Tempo). */
  var chat = null;
  var CHAT_FEHLER = {
    zu_viele: 'Du schreibst sehr schnell. Warte einen Moment.', unbekannt: 'Ihr seid nicht (mehr) befreundet, die Nachricht ging nicht raus.',
    zu_lang: 'Die Nachricht ist zu lang (höchstens 500 Zeichen).', leer: 'Die Nachricht ist leer.', zeichen: 'Die Nachricht enthält unerlaubte Zeichen.',
    netz: 'Keine Verbindung zum Server.', server: 'Der Server hatte ein Problem. Bitte gleich noch einmal versuchen.',
  };
  function chatStopp() { if (chat) { clearTimeout(chat.timer); chat.tot = true; } chat = null; document.body.style.removeProperty('--ch-hoehe'); }
  function chatHoehe() {
    var w = document.querySelector('.ch-wrap');
    if (!w) return;
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var top = w.getBoundingClientRect().top + window.scrollY;
    w.style.height = Math.max(240, vh - top) + 'px';
  }
  window.addEventListener('resize', chatHoehe);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { chatHoehe(); chatUnten(true); });
  function uhrzeit(sek) { return new Date(sek * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
  function tagLabel(sek) {
    var d = new Date(sek * 1000), h = new Date(), g = new Date(); g.setDate(h.getDate() - 1);
    var gleich = function (x, y) { return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
    if (gleich(d, h)) return 'Heute'; if (gleich(d, g)) return 'Gestern';
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function chatNah() { var l = document.getElementById('ch-liste'); return !l || l.scrollHeight - l.scrollTop - l.clientHeight < 90; }
  function chatUnten(nurWennNah) { var l = document.getElementById('ch-liste'); if (l && (!nurWennNah || chat && chat.nah)) l.scrollTop = l.scrollHeight; }
  function chatZeichne() {
    var l = document.getElementById('ch-liste');
    if (!l || !chat) return;
    var h = '', tag = '';
    if (chat.mehr) h += '<button type="button" class="ch-aelter" data-ch="aelter">Ältere Nachrichten laden</button>';
    if (!chat.msgs.length) h += '<div class="ch-leer">Noch keine Nachrichten. Schreib die erste!</div>';
    chat.msgs.forEach(function (m, i) {
      var t = tagLabel(m.zeit);
      if (t !== tag) { tag = t; h += '<div class="ch-tag"><span>' + esc(t) + '</span></div>'; }
      var davor = chat.msgs[i - 1], danach = chat.msgs[i + 1];
      var wer = function (x) { return chat.gruppe && x.von !== 'ich' ? 'er:' + x.name : x.von; };   // in Gruppen sind mehrere andere Absender möglich
      var gruppeStart = !davor || wer(davor) !== wer(m) || m.zeit - davor.zeit > 300 || tagLabel(davor.zeit) !== t;
      var gruppeEnde = !danach || wer(danach) !== wer(m) || danach.zeit - m.zeit > 300 || tagLabel(danach.zeit) !== t;
      h += '<div class="ch-msg ' + (m.von === 'ich' ? 'ich' : 'er') + (gruppeStart ? ' start' : '') + (gruppeEnde ? ' ende' : '') + (chat.offen === m.id ? ' offen' : '') + '" data-id="' + m.id + '">' +
        (chat.gruppe && m.von !== 'ich' && gruppeStart ? '<div class="ch-absender">' + esc(m.anzeige || m.name) + '</div>' : '') +
        einlBlase(m) +
        (gruppeEnde ? '<div class="ch-zeit">' + uhrzeit(m.zeit) + '</div>' : '') +
        (m.von === 'ich' && chat.offen === m.id ? '<button type="button" class="ch-weg" data-ch="weg" data-id="' + m.id + '">Nachricht löschen</button>' : '') + '</div>';
    });
    l.innerHTML = h;
  }
  function chatStatus(f) {
    var z = document.getElementById('ch-status');
    if (!z || !f) return;
    var jetzt = Math.floor(Date.now() / 1000);
    z.innerHTML = f.spiel ? '<span class="punkt an"></span>Spielt ' + esc(spielName(f.spiel)) : f.online ? '<span class="punkt an"></span>Im Hub' : f.privat ? 'Status privat' : f.zuletzt ? 'Zuletzt online ' + relZeit(Math.max(0, jetzt - f.zuletzt)) : '@' + esc(f.name);
  }
  function chatNeue(res) {
    if (!chat || !res.ok) return;
    var neu = res.j.nachrichten.filter(function (m) { return !chat.msgs.some(function (x) { return x.id === m.id; }); });
    if (!neu.length) return;
    chat.nah = chatNah();
    var vonIhm = neu.some(function (m) { return m.von === 'er'; });
    chat.msgs = chat.msgs.concat(neu);
    chat.letzte = chat.msgs[chat.msgs.length - 1].id;
    chat.aktiv = Date.now();
    chatZeichne();
    if (chat.nah || neu.some(function (m) { return m.von === 'ich'; })) chatUnten(false);
    else { var n = document.getElementById('ch-neu'); if (n) n.hidden = false; }
    if (vonIhm) abzeichenNeu();
  }
  function chatAbgleich(batch) {
    if (!chat) return;
    var minId = batch.length ? batch[0].id : Infinity;
    var alt = chat.msgs.filter(function (m) { return batch.length >= 50 && m.id < minId; });   // weniger als 50: der Server hat alles geliefert
    var neu = alt.concat(batch);
    var gleich = neu.length === chat.msgs.length && neu.every(function (m, i) { return m.id === chat.msgs[i].id; });
    if (gleich) return;
    var vorher = chat.msgs.length;
    chat.nah = chatNah();
    chat.msgs = neu; chat.letzte = neu.length ? neu[neu.length - 1].id : 0;
    if (chat.offen && !neu.some(function (m) { return m.id === chat.offen; })) chat.offen = 0;
    chatZeichne();
    if (neu.length > vorher) { if (chat.nah) chatUnten(false); else { var n = document.getElementById('ch-neu'); if (n) n.hidden = false; } }
    abzeichenNeu();
  }
  function abzeichenNeu() {
    LghKonto.freunde.liste().then(function (r) {
      if (!r.ok) return;
      freundeDaten = leisteDaten = r.j;
      LghKonto.setzeOffene(r.j.eingehend.length + (r.j.chat || 0));
      if (chat) chatStatus(r.j.freunde.filter(function (f) { return f.name === chat.name; })[0]);
    });
  }
  function chatTick() {
    if (!chat || chat.tot) return;
    var c = chat;
    clearTimeout(c.timer);
    var weiter = function () { if (chat === c && !c.tot) c.timer = setTimeout(chatTick, Date.now() - c.aktiv < 120000 ? 3000 : 8000); };
    if (document.hidden || c.lauf) return weiter();
    c.lauf = true;
    // Etwa alle 20 Sekunden werden die neuesten 50 Nachrichten komplett abgeglichen, damit auch Löschungen der anderen Seite ankommen
    var abgleich = c.zaehler % 7 === 6;
    LghKonto.chat.lesen(c.name, abgleich ? { gelesen: true } : { nach: c.letzte, gelesen: true }).then(function (res) {
      c.lauf = false;
      if (chat !== c) return;
      if (res.status === 404) { chatNichtMehr(); return; }
      if (abgleich && res.ok) chatAbgleich(res.j.nachrichten);
      else chatNeue(res);
      if (++c.zaehler % 7 === 0) abzeichenNeu();   // Online-Status und Abzeichen etwa alle 20 Sekunden
      weiter();
    });
  }
  function chatNichtMehr() {
    var w = document.querySelector('.ch-wrap');
    if (w) w.innerHTML = '<div class="ch-fehl"><h1 class="fr-titel">Chat</h1><div class="fr-leer">' + (chat && chat.gruppe ? 'Diese Gruppe gibt es nicht (mehr) oder du bist nicht mehr dabei.' : 'Diesen Chat gibt es nicht oder ihr seid nicht mehr befreundet.') + '</div><a class="btn btn-ghost" href="#freunde">Zu den Freunden</a></div>';
    chatStopp();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && chat) { chat.aktiv = Date.now(); chatTick(); } });
  function renderChat(name) {
    chatStopp();
    inhalt.innerHTML = '<div class="ch-wrap"><div class="fr-leer">Lädt …</div></div>';
    if (!window.LghKonto || !LghKonto.angemeldet()) { inhalt.querySelector('.ch-wrap').innerHTML = '<div class="fr-leer">Melde dich an, um zu chatten.</div>'; return; }
    var gm = /^#g(\d{1,9})$/.exec(name);   // "#g12" = Gruppenchat
    var c = chat = { name: name, gruppe: gm ? Number(gm[1]) : 0, msgs: [], letzte: 0, mehr: false, nah: true, aktiv: Date.now(), zaehler: 0, offen: 0, timer: null, lauf: false, tot: false };
    if (gm) {
      LghKonto.gruppen.details(c.gruppe).then(function (res) {
        if (chat !== c) return;
        if (res.status === 404) return chatNichtMehr();
        if (!res.ok) { inhalt.querySelector('.ch-wrap').innerHTML = '<div class="fr-leer">Der Gruppenchat konnte gerade nicht geladen werden.</div><a class="btn btn-ghost" href="#freunde">Zu den Freunden</a>'; return; }
        var g = res.j.gruppe; c.anzeige = g.name;
        var w = inhalt.querySelector('.ch-wrap');
        w.innerHTML = '<div class="ch-kopf"><a class="ch-zurueck" href="#freunde" aria-label="Zurück zu den Freunden"><svg aria-hidden="true" width="22" height="22"><use href="#i-back"/></svg></a>' +
          '<button type="button" class="ch-person ch-gruppe" data-ch="gruppeinfo" aria-label="Gruppeninfo">' + LghKonto.avatar('avatar', '#g' + g.id, g.name, null) +
          '<span class="ch-pname"><b id="ch-gname">' + esc(g.name) + '</b><small id="ch-status">' + g.mitglieder.length + ' Mitglieder</small></span></button>' +
          '<button type="button" class="btn btn-ghost ch-einladen" data-ch="einladen">Einladen</button></div>' + chatRumpf('Nachricht an die Gruppe');
        chatLaden(c);
      });
      return;
    }
    LghKonto.freunde.liste().then(function (res) {
      if (chat !== c) return;
      var f = res.ok ? res.j.freunde.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0] : null;
      if (!res.ok) { inhalt.querySelector('.ch-wrap').innerHTML = '<div class="fr-leer">Der Chat konnte gerade nicht geladen werden.</div><a class="btn btn-ghost" href="#freunde">Zu den Freunden</a>'; return; }
      if (!f) return chatNichtMehr();
      freundeDaten = leisteDaten = res.j;
      c.name = f.name; c.anzeige = anz(f);
      LghKonto.setzeOffene(res.j.eingehend.length + (res.j.chat || 0));
      var w = inhalt.querySelector('.ch-wrap');
      w.innerHTML = '<div class="ch-kopf"><a class="ch-zurueck" href="#freunde" aria-label="Zurück zu den Freunden"><svg aria-hidden="true" width="22" height="22"><use href="#i-back"/></svg></a>' +
        '<a class="ch-person" href="#profil/' + encodeURIComponent(f.name) + '">' + LghKonto.avatar('avatar', f.name, anz(f), f.av) +
        '<span class="ch-pname"><b>' + esc(anz(f)) + '</b><small id="ch-status"></small></span></a>' +
        '<button type="button" class="btn btn-ghost ch-einladen" data-ch="einladen">Einladen</button></div>' + chatRumpf('Nachricht an ' + anz(f), anz(f));
      chatStatus(f);
      chatLaden(c);
    });
  }
  // Liste, Eingabefeld und Meldungszeile (gleich für Freunde und Gruppen)
  function chatRumpf(platzhalter, fuerName) {
    return '<div class="ch-liste" id="ch-liste" role="log" aria-live="polite" aria-label="' + esc(fuerName ? 'Nachrichten mit ' + fuerName : 'Nachrichten der Gruppe') + '"></div>' +
      '<button type="button" class="ch-neu" id="ch-neu" data-ch="unten" hidden>Neue Nachricht ↓</button>' +
      '<div class="ch-meld" id="ch-meld" role="status"></div>' +
      '<form class="ch-form" id="ch-form" novalidate><textarea id="ch-text" rows="1" maxlength="500" placeholder="' + esc(platzhalter) + '" aria-label="Nachricht" autocomplete="off" enterkeyhint="send"></textarea>' +
      '<button class="btn btn-primary ch-senden" type="submit">Senden</button></form>';
  }
  function chatLaden(c) {
    chatHoehe();
    LghKonto.chat.lesen(c.name, { gelesen: true }).then(function (r) {
      if (chat !== c) return;
      if (r.status === 404) return chatNichtMehr();
      if (!r.ok) { chatMeld('Die Nachrichten konnten nicht geladen werden.', true); }
      else { c.msgs = r.j.nachrichten; c.mehr = !!r.j.mehr; c.letzte = c.msgs.length ? c.msgs[c.msgs.length - 1].id : 0; }
      chatZeichne(); chatUnten(false);
      if (c.letzte) abzeichenNeu();
      c.timer = setTimeout(chatTick, 3000);
    });
    var ta = document.getElementById('ch-text');
    if (ta && matchMedia('(hover: hover)').matches) ta.focus();
  }
  function chatMeld(t, fehler) { var m = document.getElementById('ch-meld'); if (m) { m.textContent = t || ''; m.className = 'ch-meld' + (fehler ? ' fehler' : ''); } }
  function chatWachsen(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; }
  function chatSenden() {
    var ta = document.getElementById('ch-text');
    if (!ta || !chat || chat.sendet) return;
    var text = ta.value.replace(/\s+$/, '');
    if (!text.trim()) return;
    var c = chat; c.sendet = true; chatMeld('');
    LghKonto.chat.senden(c.name, text).then(function (res) {
      c.sendet = false;
      if (chat !== c) return;
      if (res.ok) {
        ta.value = ''; chatWachsen(ta); c.aktiv = Date.now();
        chatNeue({ ok: true, j: { nachrichten: [res.j.nachricht] } });
        chatUnten(false);
      } else if (res.status === 404 && res.j.fehler === 'unbekannt') chatNichtMehr();
      else chatMeld(CHAT_FEHLER[res.j.fehler] || 'Das hat nicht geklappt.', true);
      ta.focus();
    });
  }
  inhalt.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'ch-form') return;
    e.preventDefault(); chatSenden();
  });
  inhalt.addEventListener('keydown', function (e) {
    if (!e.target || e.target.id !== 'ch-text') return;
    if (chat) chat.aktiv = Date.now();
    // Am Rechner sendet Enter, Umschalt+Enter macht eine neue Zeile; am Handy bleibt Enter eine neue Zeile (dort gibt es den Senden-Knopf)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) { e.preventDefault(); chatSenden(); }
  });
  inhalt.addEventListener('input', function (e) { if (e.target && e.target.id === 'ch-text') chatWachsen(e.target); });
  inhalt.addEventListener('scroll', function (e) { if (e.target && e.target.id === 'ch-liste' && chatNah()) { var n = document.getElementById('ch-neu'); if (n) n.hidden = true; } }, true);
  inhalt.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-ch]') : null;
    if (b && chat) {
      var a = b.getAttribute('data-ch');
      if (a === 'unten') { chatUnten(false); b.hidden = true; return; }
      if (a === 'gruppeinfo') { gruppeInfo(chat.gruppe); return; }
      if (a === 'einladen') {
        var ce = chat;
        einladenDialog(ce.name, ce.anzeige || ce.name, function (res) { if (chat !== ce) return; chatNeue({ ok: true, j: { nachrichten: [res.j.nachricht] } }); chatUnten(false); });
        return;
      }
      if (a === 'aelter') {
        var c = chat, l = document.getElementById('ch-liste'), alt = l ? l.scrollHeight : 0;
        b.disabled = true;
        LghKonto.chat.lesen(c.name, { vor: c.msgs.length ? c.msgs[0].id : 0 }).then(function (r) {
          if (chat !== c) return;
          if (!r.ok) { b.disabled = false; return chatMeld('Ältere Nachrichten konnten nicht geladen werden.', true); }
          c.msgs = r.j.nachrichten.concat(c.msgs); c.mehr = !!r.j.mehr; chatZeichne();
          if (l) l.scrollTop = l.scrollHeight - alt;
        });
        return;
      }
      if (a === 'weg') {
        var id = parseInt(b.getAttribute('data-id'), 10), cc = chat;
        b.disabled = true;
        LghKonto.chat.loeschen(cc.name, id).then(function (r) {
          if (chat !== cc) return;
          cc.offen = 0;
          if (r.ok || r.status === 404) cc.msgs = cc.msgs.filter(function (m) { return m.id !== id; });
          else chatMeld('Das Löschen hat nicht geklappt.', true);
          cc.letzte = cc.msgs.length ? cc.msgs[cc.msgs.length - 1].id : 0;
          chatZeichne();
        });
        return;
      }
    }
    // Eigene Nachricht antippen: "Nachricht löschen" ein- oder ausblenden
    var m = chat && e.target.closest ? e.target.closest('.ch-msg.ich') : null;
    if (m && !e.target.closest('.ch-weg') && !e.target.closest('.ch-einl-los')) {
      var mid = parseInt(m.getAttribute('data-id'), 10);
      chat.offen = chat.offen === mid ? 0 : mid; chat.nah = chatNah(); chatZeichne();
    }
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
      var eigeneSpiele = spieleVon(p.name), spieleHtml = '';
      if (eigeneSpiele.length) {
        spieleHtml = '<h2 class="fr-abschnitt">' + (p.eigen ? 'Meine Spiele' : 'Spiele von @' + esc(p.name)) + '</h2><div class="pf-liste">' + eigeneSpiele.map(function (sp) {
          return '<a class="pf-spiel" href="#spiel/' + encodeURIComponent(sp.id) + '"><span class="pf-icon">' + art(sp, 100, 100) + '</span><span class="pf-text"><b>' + esc(sp.name) + '</b>' + (sp.wartung ? '<small>' + (sp.cd ? 'Bald spielbar' : 'In Wartung') + '</small>' : '') + '</span></a>';
        }).join('') + '</div>';
      }
      if (p.nurOeffentlich) {   // Kein Freund: Entwickler (nur Name, Bild, Spiele) und alles, was die Person für „Alle“ freigegeben hat
        var oStatus = p.zeigeStatus ? (p.online ? '<span class="pf-punkt"></span>Online' + (p.spiel ? ' · spielt ' + esc(spielName(p.spiel)) : '') : (p.zuletzt ? 'Zuletzt online ' + relZeit(Math.max(0, jetzt - p.zuletzt)) : 'Noch nie online')) : (p.entwickler ? 'Entwickler im Hub' : '');
        var oZeilen = '';
        (p.spiele || []).forEach(function (x) {
          var sp = spiele.filter(function (g) { return g.id === x.spiel; })[0];
          if (sp) oZeilen += '<a class="pf-spiel" href="#spiel/' + encodeURIComponent(sp.id) + '"><span class="pf-icon">' + art(sp, 100, 100) + '</span><span class="pf-text"><b>' + esc(sp.name) + '</b></span></a>';
        });
        w.innerHTML = '<div class="pf-kopf">' + LghKonto.avatar('avatar gross', p.name, p.anzeige, p.av) +
          '<div class="pf-kopftext"><h1 class="pf-name">' + esc(p.anzeige) + '</h1><div class="pf-at">@' + esc(p.name) + (seit ? ' · dabei seit ' + esc(seit) : '') + '</div>' + (oStatus ? '<div class="pf-status">' + oStatus + '</div>' : '') + '</div></div>' +
          '<div class="pf-aktionen"><button type="button" class="btn btn-primary" data-pf-anfrage="' + esc(p.name) + '">Freundschaftsanfrage senden</button></div><div class="pf-meld" id="pf-meld" role="status"></div>' +
          (p.zeigeSpiele ? '<h2 class="fr-abschnitt">Gespielte Spiele</h2>' + (oZeilen ? '<div class="pf-liste">' + oZeilen + '</div>' : '<div class="fr-leer">Noch nichts gespielt.</div>') : '') + spieleHtml;
        return;
      }
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
      var status = p.statusPrivat ? 'Status privat' : p.online ? '<span class="pf-punkt"></span>Online' + (p.spiel ? ' · spielt ' + esc(spielName(p.spiel)) : '') : (p.zuletzt ? 'Zuletzt online ' + relZeit(Math.max(0, jetzt - p.zuletzt)) : 'Noch nie online');
      w.innerHTML = '<div class="pf-kopf">' + LghKonto.avatar('avatar gross', p.name, p.anzeige, p.av) +
        '<div class="pf-kopftext"><h1 class="pf-name">' + esc(p.anzeige) + '</h1><div class="pf-at">@' + esc(p.name) + (seit ? ' · dabei seit ' + esc(seit) : '') + '</div><div class="pf-status">' + status + '</div></div></div>' +
        '<div class="pf-zahlen">' + (p.eigen ? '<div><b>' + esc(dauer(gesamt)) + '</b><small>Spielzeit gesamt</small></div>' : '') + '<div><b>' + (p.spielePrivat ? '–' : gespielt) + '</b><small>' + (gespielt === 1 ? 'Spiel gespielt' : 'Spiele gespielt') + '</small></div><div><b>' + p.freunde + '</b><small>' + (p.freunde === 1 ? 'Freund' : 'Freunde') + '</small></div></div>' +
        (!p.eigen ? '<div class="pf-aktionen"><a class="btn btn-primary" href="#chat/' + encodeURIComponent(p.name) + '">Nachricht schreiben</a></div>' : '') +
        (p.eigen ? '<div class="pf-aktionen"><button type="button" class="btn btn-ghost" data-pf="bild">Profilbild ändern</button><button type="button" class="btn btn-ghost" data-pf="anz">Anzeigename ändern</button><button type="button" class="btn btn-ghost" data-pf="stand">Spielstände sichern und zurückholen</button><button type="button" class="btn btn-ghost" data-pf="konto">Konto</button></div>' : '') +
        '<h2 class="fr-abschnitt">' + (p.eigen ? 'Zuletzt gespielt' : 'Gespielte Spiele') + '</h2>' +
        (zeilen ? '<div class="pf-liste">' + zeilen + '</div>' : '<div class="fr-leer">' + (p.spielePrivat ? 'Diese Person zeigt ihre gespielten Spiele nicht.' : p.eigen ? 'Noch nichts gespielt. Die Spielzeit wird ab jetzt gezählt.' : 'Noch nichts gespielt.') + '</div>') + spieleHtml;
    });
  }
  inhalt.addEventListener('click', function (e) {
    var q = e.target.closest ? e.target.closest('[data-pf-anfrage]') : null;
    if (q && window.LghKonto) {
      var nm = q.getAttribute('data-pf-anfrage'), mel = document.getElementById('pf-meld'); q.disabled = true;
      LghKonto.freunde.anfrage(nm).then(function (res) {
        if (mel) mel.textContent = res.ok ? (res.j.freunde ? 'Ihr seid jetzt Freunde.' : 'Anfrage gesendet.') : (FR_FEHLER[res.j.fehler] || 'Das hat nicht geklappt.');
        if (res.ok) { if (mel) mel.className = 'pf-meld ok'; } else q.disabled = false;
      });
      return;
    }
    var b = e.target.closest ? e.target.closest('[data-pf]') : null;
    if (!b || !window.LghKonto) return;
    var a = b.getAttribute('data-pf');
    window.LghKonto.kontoDialog(a === 'konto' ? null : a);
  });

  /* ---------- Favoriten umschalten ---------- */
  function aktivIdAusHash() { var m = /^#spiel\/([^\/]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; }
  function favAnwenden(liste) {
    favoriten = liste.slice();
    var k = favKey(); if (k) { try { localStorage.setItem(k, JSON.stringify(favoriten)); } catch (e) { } }
    ansichtSpeicher = {}; seiteFertig = false;   // gemerkte Ansichten und die Seitenleiste neu aufbauen
    var ansicht = body.getAttribute('data-view');
    if (ansicht === 'home') { renderHome(); ansichtKey = homeKey(); }
    else if (ansicht === 'detail') {
      [].forEach.call(document.querySelectorAll('[data-fav]'), function (b) {
        var id = b.getAttribute('data-fav'), an = favIst(id);
        b.classList.toggle('an', an); b.setAttribute('aria-pressed', String(an));
        b.setAttribute('aria-label', spielName(id) + (an ? ' aus den Favoriten entfernen' : ' zu den Favoriten hinzufügen'));
        var bz = document.querySelector('[data-a="bib"]'); if (bz) { var bi2 = bz.getAttribute('data-id'); bz.hidden = favIst(bi2); var bt2 = bz.querySelector('.bib-text'); if (bt2) bt2.textContent = bibIst(bi2) ? 'Aus Bibliothek entfernen' : 'Zur Bibliothek hinzufügen'; }
        var ft = b.querySelector('.fav-text'); if (ft) ft.textContent = an ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';
      });
    }
    renderSide(aktivIdAusHash(), location.hash === '#freunde', location.hash === '#wikis');
  }
  function favUmschalten(id) {
    var alt = favoriten.slice(), an = !favIst(id);
    favAnwenden(an ? favoriten.concat([id]) : favoriten.filter(function (x) { return x !== id; }));
    if (!window.LghKonto) return;
    LghKonto.favoriten.setzen(id, an).then(function (res) {
      if (!res.ok) { favAnwenden(alt); return; }   // Server hat abgelehnt oder war nicht erreichbar: zurück zum alten Stand
      if (Array.isArray(res.j.favoriten) && JSON.stringify(res.j.favoriten) !== JSON.stringify(favoriten)) favAnwenden(res.j.favoriten);
    });
  }
  function favLaden() {
    if (!window.LghKonto || !LghKonto.angemeldet()) return;
    LghKonto.favoriten.laden().then(function (res) {
      if (res.ok && Array.isArray(res.j.favoriten) && JSON.stringify(res.j.favoriten) !== JSON.stringify(favoriten)) favAnwenden(res.j.favoriten);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-fav]') : null;
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    favUmschalten(b.getAttribute('data-fav'));
  });


  /* ---------- Zusatzinhalte (DLCs) und Hub-Währung ---------- */
  /* Alles Wichtige (Katalog, Preise, Guthaben in Hexis, Besitz) kommt vom Server (/api/dlc). Hexis ist nur der interne Name, in der Oberfläche steht immer das Symbol. */
  var dlcDaten = null;
  function zahlText(n) { return Number(n || 0).toLocaleString('de-DE'); }
  function dlcTitel(name) { return name + ' (Zusatzinhalt)'; }   // Titel von Zusatzinhalten tragen immer diesen Zusatz
  function dlcMarke() { return '<span class="dlc-marke" role="img" aria-label="Zusatzinhalt"><svg aria-hidden="true"><use href="#i-dlc"/></svg>Zusatzinhalt</span>'; }
  function wabeSvg() { return '<svg aria-hidden="true"><use href="#i-wabe"/></svg>'; }
  function betrag(n) { return '<span class="betrag">' + wabeSvg() + zahlText(n) + '</span>'; }   // Die Währung wird nirgends mit Namen genannt, nur mit dem Symbol
  function dlcChip(puls) {
    // Oben steht nur das Symbol, ohne Zahl: Das Hub soll ein Werkzeug bleiben. Den Stand zeigt erst der Klick darauf.
    var kn = document.getElementById('waehrung-knopf');
    if (kn) { kn.hidden = !dlcDaten; kn.classList.toggle('neu', !!(dlcDaten && dlcDaten.geschenk)); }   // Punkt, solange ein Geschenk noch nicht angesehen wurde
  }
  function dlcLaden() {
    if (!window.LghKonto) return Promise.resolve(null);
    return LghKonto.bereit().then(function () {
      if (!LghKonto.angemeldet()) return null;
      return LghKonto.dlc.laden().then(function (res) {
        if (res.ok && res.j && Array.isArray(res.j.katalog)) { dlcDaten = res.j; dlcChip(); dlcFuellen(); dlcAnSpiel(); dlcSeiteNeu(); if (dlcDaten.geschenk && body.getAttribute('data-view') !== 'play') geschenkDialog(); }
        return dlcDaten;
      });
    });
  }
  function dlcFuer(spielId) { return ((dlcDaten && dlcDaten.katalog) || []).filter(function (d) { return d.spiel === spielId; }); }
  function dlcMedien(spielId, did) {
    var sp = spiele.filter(function (g) { return g.id === spielId; })[0];
    return (sp && (sp.dlcs || []).filter(function (x) { return x.id === did; })[0]) || {};
  }
  function dlcHref(d) { return '#spiel/' + encodeURIComponent(d.spiel) + '/dlc/' + encodeURIComponent(d.id); }
  function dlcKarteHtml(d) {
    var med = dlcMedien(d.spiel, d.id);
    return '<article class="dlc-karte' + (d.besitz ? ' besitz' : '') + '"><a class="dlc-icon" href="' + dlcHref(d) + '" aria-label="' + esc(dlcTitel(d.name)) + '">' + (med.icon ? '<img src="' + esc(med.icon + '?v=' + BILD_V) + '" alt="" loading="lazy" decoding="async">' : wabeSvg()) + '</a>' +
      '<div class="dlc-text"><h3><a href="' + dlcHref(d) + '">' + esc(dlcTitel(d.name)) + '</a></h3><p>' + esc(d.text) + '</p></div>' +
      '<div class="dlc-kauf">' + (d.besitz ? '<span class="dlc-besitz">Im Besitz</span>' :
        '<span class="dlc-preis">' + betrag(d.preis) + '</span><button type="button" class="btn btn-primary" data-dlc="' + esc(d.id) + '">Kaufen</button>') + '</div></article>';
  }
  function dlcFuellenIn(wurzel) {
    var l = wurzel.querySelectorAll ? wurzel.querySelectorAll('.dlc-bereich[data-spiel]') : [];
    for (var i = 0; i < l.length; i++) {
      var liste = dlcFuer(l[i].getAttribute('data-spiel'));
      l[i].innerHTML = liste.length ? '<h2>Zusatzinhalte</h2><div class="dlc-liste">' + liste.map(dlcKarteHtml).join('') + '</div>' : '';
      l[i].hidden = !liste.length;
    }
  }
  function dlcFuellen() {   // sichtbare und zwischengespeicherte Ansichten
    dlcFuellenIn(document);
    Object.keys(ansichtSpeicher).forEach(function (k) { dlcFuellenIn(ansichtSpeicher[k]); });
  }
  function dlcFehler(res) {
    var f = res.j && res.j.fehler;
    return { zu_wenig: 'Dafür reicht dein Guthaben nicht.', schon_gekauft: 'Das besitzt du schon.', unbekannt: 'Diesen Zusatzinhalt gibt es nicht (mehr).', zu_viele: 'Zu viele Versuche. Bitte warte kurz.', netz: 'Keine Verbindung zum Server.', server: 'Der Server hatte ein Problem. Bitte gleich noch einmal versuchen.' }[f] || 'Das hat nicht geklappt.';
  }
  function dlcKaufDialog(id) {
    var los = function () {
      var d = ((dlcDaten && dlcDaten.katalog) || []).filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      var fehlt = d.preis - dlcDaten.guthaben;
      var kopf = '<div class="dlg-titel">' + esc(dlcTitel(d.name)) + '</div>';
      if (d.besitz) { grDialog('dlg-dlc', kopf + '<div class="dlg-sub" style="margin:4px 0 14px">Das besitzt du schon.</div><div class="dlg-fuss"><button type="button" class="btn btn-ghost" data-zu>Schließen</button></div>', function () { }); return; }
      var h = grDialog('dlg-dlc', kopf + '<div class="dlg-sub" style="margin:2px 0 6px">' + esc(d.text) + '</div>' +
        '<div class="dlc-zeilen"><div class="dlc-zeile"><span>Preis</span><b>' + betrag(d.preis) + '</b></div>' +
        '<div class="dlc-zeile"><span>Dein Guthaben</span><b>' + betrag(dlcDaten.guthaben) + '</b></div>' +
        (fehlt > 0 ? '<div class="dlc-zeile fett"><span>Dir fehlen</span><b>' + betrag(fehlt) + '</b></div>' : '<div class="dlc-zeile fett"><span>Danach</span><b>' + betrag(dlcDaten.guthaben - d.preis) + '</b></div>') + '</div>' +
        '<div class="fr-meldung fehler" id="dlc-meld" role="status"></div>' +
        '<div class="dlg-fuss"><button type="button" class="btn btn-ghost" data-zu>Abbrechen</button><button type="button" class="btn btn-primary" data-dlc-ja="' + esc(d.id) + '" style="margin-left:10px"' + (fehlt > 0 ? ' disabled' : '') + '>Kaufen</button></div>', function (e, zu) {
          var b = e.target.closest ? e.target.closest('[data-dlc-ja]') : null;
          if (!b || b.disabled) return;
          var m = document.getElementById('dlc-meld'); m.textContent = ''; b.disabled = true;
          LghKonto.dlc.kaufen(id).then(function (res) {
            if (res.ok && res.j && res.j.katalog) {
              dlcDaten = res.j; dlcChip(true); dlcFuellen(); dlcAnSpiel(); dlcSeiteNeu();
              var dlg = document.querySelector('.dlg-dlc .dlg');
              if (dlg) dlg.innerHTML = '<div class="dlg-titel">Gekauft</div><div class="dlg-sub" style="margin:4px 0 14px"><b>' + esc(dlcTitel(d.name)) + '</b> gehört dir jetzt. Es ist sofort im Spiel da.</div><div class="dlg-fuss"><button type="button" class="btn btn-primary" data-zu>Fertig</button></div>';
              return;
            }
            if (res.status === 409) { dlcLaden(); }
            b.disabled = false; m.textContent = dlcFehler(res);
            if (res.status === 402) dlcLaden();
          });
        });
      if (!h) return;
    };
    if (dlcDaten) los(); else dlcLaden().then(los);
  }
  function geschenkDialog() {
    if (!dlcDaten || !dlcDaten.geschenk) return;
    var h = grDialog('dlg-dlc', '<div class="dlg-titel">Ein Geschenk für dich</div><div class="dlc-gross">' + wabeSvg() + '+' + zahlText(dlcDaten.geschenk) + '</div>' +
      '<div class="dlg-sub" style="margin:0 0 14px">Du warst schon von Anfang an dabei. Dafür gibt es zum Start ein Guthaben, das du später für Kosmetik ausgeben kannst.</div>' +
      '<div class="dlg-fuss"><button type="button" class="btn btn-primary" data-zu>Danke</button></div>', function () { });
    if (!h) return;
    // Egal wie der Dialog geschlossen wird (Danke, Esc, daneben tippen): damit gilt das Geschenk als gesehen.
    var wach = new MutationObserver(function () {
      if (h.isConnected) return;
      wach.disconnect(); dlcDaten.geschenk = null; dlcChip();
      LghKonto.dlc.gesehen().then(function (r) { if (r.ok && r.j && Array.isArray(r.j.katalog)) { dlcDaten = r.j; dlcChip(); } });
    });
    wach.observe(document.body, { childList: true });
  }
  function guthabenDialog() {
    if (!dlcDaten) return;
    if (dlcDaten.geschenk) return geschenkDialog();
    var mein = ((dlcDaten.katalog) || []).filter(function (d) { return d.besitz; });
    grDialog('dlg-dlc', '<div class="dlg-titel">Dein Guthaben</div><div class="dlc-gross">' + wabeSvg() + zahlText(dlcDaten.guthaben) + '</div><div class="dlg-sub" style="margin:0 0 10px">Guthaben für Kosmetik.</div>' +
      (mein.length ? '<div class="dlc-zeilen"><div class="dlc-zeile"><span>Deine Zusatzinhalte</span></div>' + mein.map(function (d) { return '<div class="dlc-zeile fett"><b>' + esc(dlcTitel(d.name)) + '</b><span>' + esc(spielName(d.spiel)) + '</span></div>'; }).join('') + '</div>' : '') +
      '<div class="dlg-fuss"><button type="button" class="btn btn-ghost" data-zu>Schließen</button></div>', function () { });
  }
  /* Spiel im Rahmen: fragt per postMessage ({lgh:'dlc', spiel, aktion:'frage'|'kaufen', id}) nach Besitz und kann einen Kauf auslösen.
     Bezahlt wird immer im Hub-Dialog, das Spiel bekommt nur das Ergebnis. */
  function dlcSpielNachricht(spielId) {
    var l = dlcFuer(spielId);
    return { lgh: 'dlc', spiel: spielId, guthaben: dlcDaten ? dlcDaten.guthaben : 0, katalog: l.map(function (d) { return { id: d.id, name: d.name, text: d.text, preis: d.preis, besitz: !!d.besitz }; }) };
  }
  function dlcAnFenster(fenster, url, spielId) {
    try { fenster.postMessage(dlcSpielNachricht(spielId), new URL(url).origin); } catch (x) { }
  }
  function dlcAnSpiel() {
    if (aktuell && aktuell.url && rahmen && rahmen.contentWindow) dlcAnFenster(rahmen.contentWindow, aktuell.url, aktuell.id);
  }
  document.addEventListener('click', function (e) {
    var k = e.target.closest ? e.target.closest('[data-dlc]') : null;
    if (k) { e.preventDefault(); dlcKaufDialog(k.getAttribute('data-dlc')); return; }
    if (e.target.closest && e.target.closest('#waehrung-knopf')) guthabenDialog();
  });


  /* ---------- Eigene Seite je Zusatzinhalt (#spiel/<id>/dlc/<dlc-id>) ----------
     Name, Kurztext, Preis und Besitz kommen vom Server, alles Bildhafte (Icon, Banner "wallpaper", Screenshots, Trailer, Beschreibung, Erscheinungsdatum)
     steht je DLC in games.json unter dem Spiel ("dlcs"). Bewertung wie bei Spielen, aber nur für Besitzer. */
  function dlcObjekt(sp, did) {
    var kat = ((dlcDaten && dlcDaten.katalog) || []).filter(function (x) { return x.id === did && x.spiel === sp.id; })[0];
    if (!kat) return null;
    var med = (sp.dlcs || []).filter(function (x) { return x.id === did; })[0] || {}, d = {}, k;
    for (k in med) d[k] = med[k];
    d.id = did; d.name = kat.name; d.text = kat.text; d.preis = kat.preis; d.besitz = kat.besitz; d.spiel = sp.id; d.farbe = sp.farbe; d.entwickler = sp.entwickler;
    d.kategorien = med.kategorien || sp.kategorien; d.screenshots = med.screenshots || []; d.banner = null; d.url = sp.url;
    return d;
  }
  function renderDlcSeite(sp, did) {
    var d = dlcObjekt(sp, did);
    if (!d) { inhalt.innerHTML = '<div class="leer" style="padding:80px 28px">' + (dlcDaten ? 'Diesen Zusatzinhalt gibt es nicht.' : 'Lädt …') + '</div>'; return; }
    dlcReg[d.id] = d;
    var titel = !!d.wallpaper, gal = galerieHtml(d);
    var kauf = d.besitz ? '<span class="dlc-besitz gross">Im Besitz</span>' : '<span class="dlc-preis gross">' + betrag(d.preis) + '</span><button type="button" class="btn btn-primary" data-dlc="' + esc(d.id) + '">Kaufen</button>';
    var h = '<div class="detail-banner' + (titel ? ' titel' : '') + '">' + (titel ? '<div class="titelrahmen"><img class="titelhg" src="' + esc(d.wallpaper) + '" alt="" aria-hidden="true" decoding="async"><img class="titelbild titelfg" src="' + esc(d.wallpaper) + '" alt="' + esc(dlcTitel(d.name)) + '" decoding="async">' + dlcMarke() + '</div>' : d.screenshots.length ? '<img class="art" src="' + esc(d.screenshots[0]) + '" alt="" style="object-position:50% 38%" decoding="async">' : art(d, 1400, 420)) + (titel ? '' : dlcMarke()) +
      '<a class="zurueck-link" href="#spiel/' + encodeURIComponent(sp.id) + '"><svg aria-hidden="true"><use href="#i-back"/></svg>' + esc(sp.name) + '</a></div>';
    h += '<div class="shop' + (titel ? ' titel' : '') + '"><div class="shop-titelzeile"><h1>' + esc(dlcTitel(d.name)) + '</h1><div class="spiel-aktion dlc-aktion">' + kauf + '</div></div>';
    var lang = d.beschreibung && d.beschreibung !== d.text ? '<section class="shop-text"><h2>Über diesen Zusatzinhalt</h2><p>' + esc(d.beschreibung) + '</p></section>' : '';
    h += '<div class="shop-oben' + (gal ? '' : ' ohne-galerie') + '">' + (gal ? '<div class="shop-haupt">' + gal + lang + '</div>' : '');
    h += '<aside class="shop-info"><div class="shop-kopf"><div class="shop-icon">' + art(d, 300, 300) + '</div><p class="kurz">' + esc(d.text) + '</p></div><dl class="fakten">';
    h += faktZeile('Zusatzinhalt für', '<a class="fakt-link" href="#spiel/' + encodeURIComponent(sp.id) + '">' + esc(sp.name) + '</a>');
    h += faktZeile('Preis', d.besitz ? 'Im Besitz' : betrag(d.preis));
    if (d.erschienen) h += faktZeile('Erschienen', esc(datumText(d.erschienen + 'T12:00:00+02:00')));
    h += faktZeile('Bewertung', bewFakt(d));
    h += faktZeile('Entwickler', entwicklerLinks(d));
    if (kategorien(d).length) h += faktZeile('Tags', pills(d));
    h += '</dl></aside></div>';
    if (!gal && lang) h += lang;
    if (d.besitz) h += bewHtml(d);
    h += '</div>';
    inhalt.innerHTML = h;
    galerieBinden(d);
  }
  function dlcSeiteNeu() {   // nach einem Kauf: die offene DLC-Seite neu zeichnen (Scrollstand bleibt)
    var m = /^#spiel\/([^\/]+)\/dlc\/([^\/]+)$/.exec(location.hash);
    if (!m || body.getAttribute('data-view') !== 'detail') return;
    var sp = spiele.filter(function (g) { return g.id === decodeURIComponent(m[1]); })[0];
    if (sp) { renderDlcSeite(sp, decodeURIComponent(m[2])); bewLaden(decodeURIComponent(m[2])); }
  }

  /* ---------- Navigation ---------- */
  /* Ansichten bleiben als fertige Knoten erhalten: beim Zurück- oder Weiterklicken werden sie nur wieder eingehängt,
     so laden Bilder nicht jedes Mal neu und Galerie, Scrollstand und Update-Log bleiben, wie sie sind. */
  var ansichtSpeicher = {}, ansichtKey = null;
  function homeKey() { return 'home|' + filter + '|' + suche + '|' + sortierung; }
  function zeigeAnsicht(key, rendern) {
    if (ansichtKey === key && inhalt.firstChild) return;
    if (ansichtKey === 'freunde' || String(ansichtKey).indexOf('profil|') === 0 || String(ansichtKey).indexOf('chat|') === 0) inhalt.innerHTML = '';
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
    var cm = /^#chat\/([^\/]+)$/.exec(location.hash), cn = '';
    if (cm) { try { cn = decodeURIComponent(cm[1]); } catch (x) { cn = ''; } }
    if (vorher === 'chat' && (!cm || !chat || chat.name.toLowerCase() !== cn.toLowerCase())) chatStopp();
    if (cm && cn) {
      body.setAttribute('data-view', 'chat');
      if (String(ansichtKey).indexOf('chat|') === 0) ansichtKey = null;   // Chat immer frisch aufbauen
      zeigeAnsicht('chat|' + cn.toLowerCase(), function () { renderChat(cn); }); renderSide(null, true);
      document.title = 'Chat – Leif Game Hub';
      window.scrollTo(0, 0);
      return;
    }
    var grm = /^#gruppe\/(\d{1,9})$/.exec(location.hash);
    if (grm) {
      body.setAttribute('data-view', 'chat');
      if (String(ansichtKey).indexOf('chat|') === 0) ansichtKey = null;   // Gruppenchat immer frisch aufbauen
      zeigeAnsicht('chat|#g' + grm[1], function () { renderChat('#g' + grm[1]); }); renderSide(null, true);
      document.title = 'Gruppe – Leif Game Hub';
      window.scrollTo(0, 0);
      return;
    }
    var dm = /^#spiel\/([^\/]+)\/dlc\/([^\/]+)$/.exec(location.hash);
    if (dm) {
      var dsp = null, did = '';
      try { did = decodeURIComponent(dm[2]); var dsid = decodeURIComponent(dm[1]); dsp = spiele.filter(function (s) { return s.id === dsid && s.url; })[0] || null; } catch (x) { dsp = null; }
      if (!dsp) { location.replace('#'); return; }
      body.setAttribute('data-view', 'detail');
      if (String(ansichtKey).indexOf('dlcseite|') === 0) ansichtKey = null;   // immer frisch: Besitz und Preis können sich geändert haben
      zeigeAnsicht('dlcseite|' + dsp.id + '|' + did, function () { renderDlcSeite(dsp, did); }); renderSide(dsp.id);
      var seitenTitel = function () { var dd = dlcObjekt(dsp, did); document.title = (dd ? dlcTitel(dd.name) : 'Zusatzinhalt') + ' – ' + dsp.name + ' – Leif Game Hub'; };
      dlcLaden().then(function () { bewLaden(did); if (location.hash === '#spiel/' + encodeURIComponent(dsp.id) + '/dlc/' + encodeURIComponent(did)) seitenTitel(); });
      seitenTitel();
      window.scrollTo(0, 0);
      return;
    }
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
    if (location.hash === '#wikis') {
      body.setAttribute('data-view', 'wikis');
      zeigeAnsicht('wikis', renderWikis); renderSide(null, false, true);
      document.title = 'Wikis – Leif Game Hub';
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
      if (sp.url) bewLaden(sp.id);
      document.title = sp.name + ' – Leif Game Hub';
      window.scrollTo(0, 0);
      return;
    }
    body.setAttribute('data-view', 'home');
    zeigeAnsicht(homeKey(), renderHome); renderSide(null);
    weiterZeichne(); weiterLaden();
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
  inhalt.addEventListener('change', function (e) {
    if (!e.target || e.target.id !== 'sort-wahl') return;
    sortierung = e.target.value;
    try { localStorage.setItem('lgh.sortierung', sortierung); } catch (x) { }
    if (sortierung === 'bewertung') bewAlleLaden();
    if (sortierung === 'zuletzt' || sortierung === 'meist') { weiterGeladen = 0; weiterLaden(); }
    renderHome(); ansichtKey = homeKey();
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
  /* Vollbild: echtes Vollbild der Bühne (samt Menü), wo der Browser es erlaubt (Desktop, Android, iPad). */
  document.getElementById('vollbild').addEventListener('click', function () {
    var voll = document.fullscreenElement || document.webkitFullscreenElement;
    var an = buehne.requestFullscreen || buehne.webkitRequestFullscreen;
    if (voll) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (an) { try { var pr = an.call(buehne); if (pr && pr.catch) pr.catch(function () { }); } catch (e) { } }
  });

  // Für das Spielmenü (spielmenue.js): das laufende Spiel und sein Rahmen
  window.LghSpiel = { aktuell: function () { return aktuell; }, rahmen: function () { return rahmen; }, buehne: buehne };

  window.LghStand = { spielName: function (id) { return spielName(id); }, anwenden: standAnwenden, lokal: standLokal, sicherungen: standSicherungen };

  // Alte Adresse: Hinweis auf den Umzug zu hub.leifps.de (ab Dienstag 15:00 leitet der Worker automatisch weiter, siehe src/umzug.js)
  if (location.hostname === 'lgh.leifps.workers.dev') {
    var ub = document.getElementById('umzug-banner'), ul = document.getElementById('umzug-link');
    if (ub) ub.hidden = false;
    if (ul) { var ulh = function () { ul.href = 'https://hub.leifps.de/' + location.hash; }; ulh(); window.addEventListener('hashchange', ulh); }
  }

  var BILD_V = '4';
  function json(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function gamesJson() {
    return fetch('games.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      var dh = Date.parse(r.headers.get('Date') || ''); if (dh) zeitVersatz = dh - Date.now();
      return r.json();
    });
  }
  Promise.all([gamesJson(), json('versions.json').catch(function () { return {}; })])
    .then(function (d) {
      spiele = d[0].games || []; versionen = d[1] || {};
      // Beim Ersetzen eines Bildes die Nummer BILD_V hochzählen: alle Browser holen dann die neue Datei statt der zwischengespeicherten.
      // "wartung": true in games.json sperrt ein Spiel vorübergehend (wie "Bald", aber mit Hinweis "Wartung"); zum Freigeben das Feld entfernen.
      spiele.forEach(function (sp) { if (sp.wartung) sp.url = ''; });
      // "release" in games.json: bis zur Uhrzeit gesperrt mit Countdown, danach von selbst offen (nur ohne "wartung")
      spiele.forEach(function (sp) {
        var t = sp.release && !sp.wartung ? Date.parse(sp.release) : NaN;
        if (t && t > jetztMs() && sp.url) { sp.releaseMs = t; sp.cd = true; sp.wartung = true; sp.vorUrl = sp.url; sp.url = ''; }
      });
      if (spiele.some(function (sp) { return sp.cd; })) releaseTimer = setInterval(releaseTick, 1000);
      spiele.forEach(function (sp) { ['bild', 'banner', 'icon', 'wallpaper'].forEach(function (k) { if (typeof sp[k] === 'string' && sp[k].indexOf('?') < 0) sp[k] += '?v=' + BILD_V; }); });
      favoriten = favLokal();
      if (window.LghKonto) LghKonto.spielNamen(spielName);
      route();
      if (window.LghKonto) LghKonto.bereit().then(function () { favLaden(); dlcLaden(); if (sortierung === 'bewertung') bewAlleLaden(); });
    })
    .catch(function () { inhalt.innerHTML = '<div class="leer" style="padding:80px 28px">Die Spieleliste konnte nicht geladen werden.</div>'; });
})();
