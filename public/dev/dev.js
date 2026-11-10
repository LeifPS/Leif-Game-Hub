/* dev.leifps.de – Entwickler-Seite des Leif Game Hub. Eigene Anmeldung (dieselben Konten wie im Hub), Hash-Routen:
   #/ Übersicht · #/neu · #/spiel/<id>/bearbeiten · #/spiel/<id>/statistik · #/vorgaben */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var HUB = 'https://hub.leifps.de';
  var KEY = 'lgh.dev.konto';
  var konto = null;
  try { konto = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  var daten = null;   // Antwort von /api/dev/meine

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

  var FEHLER = {
    titel: 'Der Titel braucht 2 bis 40 Zeichen.', text: 'Die Kurzbeschreibung braucht 5 bis 160 Zeichen.', beschreibung: 'Die Beschreibung ist zu lang (höchstens 4000 Zeichen).',
    tags: 'Bitte 1 bis 5 Tags angeben, je 2 bis 20 Zeichen.', banner: 'Der Banner-Link muss mit https:// beginnen.', website: 'Die Website muss ein https://-Link sein.',
    website_hub: 'Die Website darf nicht der Hub selbst sein.', repo: 'Das Repo bitte als Besitzer/name angeben, z. B. LeifPS/meinspiel.',
    screenshots: 'Es braucht mindestens 3 und höchstens 20 Screenshot-Links (https://).', trailer: 'Trailer müssen YouTube-Links sein (höchstens 2).',
    release: 'Das Veröffentlichungsdatum ist ungültig.', version: 'Die Version ist zu lang (höchstens 12 Zeichen).', mitentwickler: 'Höchstens 5 Mitentwickler.',
    mitentwickler_unbekannt: 'Diesen Mitentwickler gibt es im Hub nicht', mitentwickler_selbst: 'Du kannst dich nicht selbst als Mitentwickler eintragen.',
    zu_viele_spiele: 'Du hast schon 10 Spiele eingereicht – das ist das Maximum.', zu_viele: 'Gerade zu viele Anfragen – bitte kurz warten.',
    nur_besitzer: 'Das darf nur, wer das Spiel eingereicht hat.', nicht_beteiligt: 'Dafür bist du nicht als Entwickler eingetragen.', unbekannt: 'Das gibt es nicht (mehr).',
    zu_gross: 'Die Eingabe ist zu groß.'
  };
  function fehlerText(j) { var t = FEHLER[j && j.fehler] || 'Das hat nicht geklappt.'; return j && j.name ? t + ': @' + j.name : t; }

  /* ---------- Server ---------- */
  function api(methode, pfad, body) {
    var kopf = { 'content-type': 'application/json' };
    if (konto) kopf.authorization = 'Bearer ' + konto.token;
    return fetch(pfad, { method: methode, headers: kopf, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && konto) { abmelden(); }
        return { ok: r.ok, status: r.status, j: j };
      });
    }, function () { return { ok: false, status: 0, j: { fehler: 'netz' } }; });
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function schluessel(name, pw) {   // wie im Hub: PBKDF2 aus Name und Passwort; nur dieser Schlüssel geht an den Server
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 210000, salt: enc.encode('lgh1:' + name.normalize('NFC').toLowerCase()) }, k, 256);
    }).then(hex);
  }
  function abmelden() { try { localStorage.removeItem(KEY); } catch (e) { } konto = null; daten = null; route(); }

  /* ---------- Rahmen ---------- */
  function rahmen(inhalt, aktiv) {
    app.innerHTML = '';
    var k = el('<header class="kopf"><a class="marke" href="#/"><img src="/logo/icon-blau.svg" alt=""><span>Entwickler <small>· Leif Game Hub</small></span></a>' +
      '<nav><a href="#/"' + (aktiv === 'start' ? ' class="aktiv"' : '') + '>Meine Spiele</a><a href="#/vorgaben"' + (aktiv === 'vorgaben' ? ' class="aktiv"' : '') + '>Vorgaben</a></nav>' +
      '<div class="rechts"><a class="klein muted" href="' + HUB + '" target="_blank" rel="noopener">Zum Hub</a><span class="klein muted">@' + esc(konto.name) + '</span><button class="btn" type="button" data-aus>Abmelden</button></div></header>');
    k.querySelector('[data-aus]').addEventListener('click', function () { api('POST', '/api/abmelden', {}).then(abmelden); });
    var m = document.createElement('main'); m.appendChild(inhalt);
    app.appendChild(k); app.appendChild(m); window.scrollTo(0, 0);
    return m;
  }
  function meldung(art, text) { return el('<div class="hinweis ' + art + '" role="status">' + esc(text) + '</div>'); }

  /* ---------- Anmeldung ---------- */
  function seiteAnmelden() {
    app.innerHTML = '';
    var s = el('<div class="anmelden"><img class="logo" src="/logo/icon-blau.svg" alt=""><h1>Entwickler</h1><p class="muted">Melde dich mit deinem Hub-Konto an, um eigene Spiele einzureichen und Statistiken zu sehen.</p>' +
      '<form class="formular" autocomplete="on"><div class="feld"><label for="n">Benutzername</label><input id="n" name="username" type="text" autocomplete="username" autocapitalize="none" required></div>' +
      '<div class="feld"><label for="p">Passwort</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>' +
      '<div class="fehlertext" role="alert"></div><button class="btn haupt" type="submit">Anmelden</button></form>' +
      '<p class="klein muted">Noch kein Konto? Das legst du im <a href="' + HUB + '" target="_blank" rel="noopener">Hub</a> an und meldest dich dann hier an.</p></div>');
    var f = s.querySelector('form'), fe = s.querySelector('.fehlertext'), b = s.querySelector('button');
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); fe.textContent = ''; b.disabled = true; b.textContent = 'Einen Moment …';
      var name = f.username.value.trim().replace(/^@/, '').normalize('NFC');
      schluessel(name, f.password.value).then(function (key) { return api('POST', '/api/anmelden', { name: name, key: key, geraet: 'dev.leifps.de' }); }).then(function (r) {
        if (!r.ok) {
          b.disabled = false; b.textContent = 'Anmelden';
          fe.textContent = r.status === 429 ? 'Zu viele Versuche – bitte kurz warten.' : r.status === 401 ? 'Name oder Passwort stimmt nicht.' : 'Das hat nicht geklappt. Bitte später noch einmal.';
          return;
        }
        konto = { token: r.j.token, name: r.j.name };
        try { localStorage.setItem(KEY, JSON.stringify(konto)); } catch (e) { }
        route();
      });
    });
    app.appendChild(s);
    f.username.focus();
  }

  /* ---------- Übersicht ---------- */
  function datum(iso) { var d = new Date(iso); return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'; }
  function laden(cb) {
    api('GET', '/api/dev/meine').then(function (r) { if (r.ok) { daten = r.j; cb(); } else if (r.status !== 401) { rahmen(meldung('fehler', 'Die Spiele konnten nicht geladen werden.'), 'start'); } });
  }
  function seiteStart() {
    laden(function () {
      var w = document.createElement('div');
      w.innerHTML = '<h1>Meine Spiele</h1><p class="muted">Hier reichst du eigene Spiele ein. Es gibt keine Prüfung vorab: Ein Spiel erscheint im Hub, sobald das Veröffentlichungsdatum erreicht ist (ohne Datum sofort).</p>';
      (daten.einladungen || []).forEach(function (e) {
        var k = el('<div class="hinweis einladung"><span><b>@' + esc(e.von) + '</b> lädt dich als Mitentwickler zu „' + esc(e.titel) + '“ ein.</span><span class="zeile"><button class="btn haupt" data-ja type="button">Zustimmen</button> <button class="btn" data-nein type="button">Ablehnen</button></span></div>');
        k.querySelector('[data-ja]').addEventListener('click', function () { api('POST', '/api/dev/spiel/' + e.spiel + '/einladung', { an: true }).then(seiteStart); });
        k.querySelector('[data-nein]').addEventListener('click', function () { api('POST', '/api/dev/spiel/' + e.spiel + '/einladung', { an: false }).then(seiteStart); });
        w.appendChild(k);
      });
      var neu = el('<p><a class="btn haupt" href="#/neu">Neues Spiel einreichen</a> <a class="btn" href="#/vorgaben">Vorgaben für Spiele</a></p>');
      if ((daten.spiele || []).filter(function (s) { return s.ich_besitzer; }).length >= daten.max) neu = el('<p class="muted">Du hast das Maximum von ' + daten.max + ' Spielen erreicht.</p>');
      w.appendChild(neu);
      if (!daten.spiele.length) w.appendChild(el('<div class="leer">Noch kein Spiel. Mit „Neues Spiel einreichen“ geht es los.</div>'));
      var r = el('<div class="raster"></div>');
      daten.spiele.forEach(function (s) {
        var live = s.live !== false;
        var k = el('<article class="karte spiel"><div class="bild"></div><div class="inhalt"><div><h3>' + esc(s.name) + '</h3>' +
          '<span class="marke-status ' + (live ? 'live' : 'bald') + '">' + (live ? 'Im Hub' : 'Ab ' + esc(datum(s.release))) + '</span> ' + (s.ich_besitzer ? '' : '<span class="marke-status">Mitentwickler</span>') + '</div>' +
          '<div class="klein muted">' + esc(s.text) + '</div><div class="zeile">' +
          (s.ich_besitzer ? '<a class="btn" href="#/spiel/' + esc(s.id) + '/bearbeiten">Bearbeiten</a>' : '') +
          '<a class="btn" href="#/spiel/' + esc(s.id) + '/statistik">Statistik</a>' +
          (live ? '<a class="btn" href="' + HUB + '/#spiel/' + esc(s.id) + '" target="_blank" rel="noopener">Im Hub</a>' : '') +
          (s.ich_besitzer ? '' : '<button class="btn gefahr" type="button" data-aus>Austreten</button>') + '</div></div></article>');
        k.querySelector('.bild').style.backgroundImage = 'url(' + JSON.stringify(s.banner) + ')';
        var au = k.querySelector('[data-aus]');
        if (au) au.addEventListener('click', function () { if (confirm('Als Mitentwickler von „' + s.name + '“ austreten?')) api('POST', '/api/dev/spiel/' + s.id + '/austreten', {}).then(seiteStart); });
        r.appendChild(k);
      });
      w.appendChild(r);
      rahmen(w, 'start');
    });
  }

  /* ---------- Formular ---------- */
  function lokalZeit(iso) { if (!iso) return ''; var d = new Date(iso), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function zeilen(t) { return String(t || '').split(/[\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function seiteFormular(id) {
    var s = null;
    var los = function () {
      var neu = !s;
      var h = '<h1>' + (neu ? 'Neues Spiel einreichen' : 'Spiel bearbeiten') + '</h1><p class="muted">Alle Angaben lassen sich später ändern. <a href="#/vorgaben">Vorgaben für Spiele</a> beachten.</p>' +
        '<form class="formular" novalidate>' +
        '<div class="zwei"><div class="feld"><label for="f-titel">Titel</label><input id="f-titel" type="text" maxlength="40" required></div>' +
        '<div class="feld"><label for="f-version">Version <span class="muted">(optional)</span></label><input id="f-version" type="text" maxlength="12" placeholder="0.1"></div></div>' +
        '<div class="feld"><label for="f-text">Kurzbeschreibung</label><input id="f-text" type="text" maxlength="160" required><span class="info">Ein Satz, höchstens 160 Zeichen. Erscheint auf der Kachel.</span></div>' +
        '<div class="feld"><label for="f-beschr">Beschreibung <span class="muted">(optional)</span></label><textarea id="f-beschr" maxlength="4000"></textarea></div>' +
        '<div class="feld"><label for="f-tags">Tags</label><input id="f-tags" type="text" placeholder="Idle, Angeln, Sammeln" required><span class="info">1 bis 5, mit Komma getrennt. Daraus werden die Filter im Hub.</span></div>' +
        '<div class="feld"><label for="f-banner">Banner (Bild-Link)</label><input id="f-banner" type="url" placeholder="https://…" required><span class="info">Breites Bild im Format 5:1 (2000 × 400), mit dem Titel im Bild.</span><div class="vorschau banner" id="v-banner"></div><span class="info" id="i-banner"></span></div>' +
        '<div class="feld"><label for="f-web">Website des Spiels</label><input id="f-web" type="url" placeholder="https://meinspiel.example.com" required><span class="info">Diese Seite öffnet der Hub in seinem Rahmen.</span>' +
        '<div><button class="btn" type="button" id="b-pruef">Seite prüfen</button></div><ul class="pruefung" id="pruefung"></ul></div>' +
        '<div class="feld"><label for="f-repo">Repo <span class="muted">(optional)</span></label><input id="f-repo" type="text" placeholder="Besitzer/name"></div>' +
        '<div class="feld"><label for="f-shots">Screenshots (3 bis 20 Bild-Links, einer pro Zeile)</label><textarea id="f-shots" placeholder="https://…/1.png"></textarea><span class="info" id="i-shots"></span><div class="vorschau" id="v-shots"></div></div>' +
        '<div class="feld"><label for="f-trailer">Trailer <span class="muted">(optional, höchstens 2 YouTube-Links, einer pro Zeile)</span></label><textarea id="f-trailer" style="min-height:64px"></textarea></div>' +
        '<div class="zwei"><div class="feld"><label for="f-release">Veröffentlichung <span class="muted">(optional)</span></label><input id="f-release" type="datetime-local"><span class="info">Leer = sofort. Bis dahin sehen andere im Hub nur das Datum.</span></div>' +
        '<div class="feld"><label for="f-farbe">Farbe <span class="muted">(optional)</span></label><input id="f-farbe" type="color" value="#5b8fc9"><span class="info">Für Kachel und Platzhalter.</span></div></div>' +
        '<div class="feld"><label for="f-mit">Weitere Entwickler <span class="muted">(optional)</span></label><input id="f-mit" type="text" placeholder="@name, @name"><span class="info">Hub-Benutzernamen. Sie müssen auf ihrem Konto zustimmen und erscheinen erst dann als Entwickler.</span></div>' +
        '<div class="fehlertext" role="alert" id="f-fehler"></div>' +
        '<div class="aktionen"><button class="btn haupt" type="submit">' + (neu ? 'Einreichen' : 'Speichern') + '</button><a class="btn" href="#/">Abbrechen</a>' +
        (neu ? '' : '<button class="btn gefahr" type="button" id="b-del" style="margin-left:auto">Spiel löschen</button>') + '</div></form>';
      var w = el('<div>' + h + '</div>'), f = w.querySelector('form');
      var q = function (i) { return w.querySelector('#f-' + i); };
      if (s) {
        q('titel').value = s.name; q('version').value = s.version || ''; q('text').value = s.text; q('beschr').value = s.beschreibung === s.text ? '' : s.beschreibung;
        q('tags').value = (s.kategorien || []).join(', '); q('banner').value = s.banner; q('web').value = s.url; q('repo').value = s.repo || '';
        q('shots').value = (s.shots || []).join('\n'); q('trailer').value = (s.trailer || []).map(function (v) { return 'https://youtu.be/' + v; }).join('\n');
        q('release').value = lokalZeit(s.release); q('farbe').value = s.farbe || '#5b8fc9';
        q('mit').value = (s.mitentwickler || []).map(function (m) { return '@' + m.name; }).join(', ');
      }
      var bannerVor = function () {
        var u = q('banner').value.trim(), v = w.querySelector('#v-banner'), i = w.querySelector('#i-banner'); v.innerHTML = ''; i.textContent = '';
        if (!/^https:\/\//i.test(u)) return;
        var im = new Image(); im.alt = 'Vorschau Banner'; im.onload = function () { var r = im.naturalWidth / im.naturalHeight; i.textContent = Math.abs(r - 5) > 0.15 ? 'Hinweis: Das Bild ist ' + im.naturalWidth + ' × ' + im.naturalHeight + ' (Verhältnis ' + r.toFixed(2).replace('.', ',') + ' : 1). Gedacht ist 5 : 1, es wird sonst zugeschnitten.' : ''; };
        im.onerror = function () { i.textContent = 'Das Bild lässt sich nicht laden.'; }; im.src = u; v.appendChild(im);
      };
      var shotsVor = function () {
        var l = zeilen(q('shots').value), v = w.querySelector('#v-shots'); v.innerHTML = '';
        w.querySelector('#i-shots').textContent = l.length + ' Links' + (l.length < 3 ? ' (mindestens 3)' : l.length > 20 ? ' (höchstens 20)' : '');
        l.slice(0, 20).forEach(function (u) { if (/^https:\/\//i.test(u)) { var im = new Image(); im.alt = ''; im.loading = 'lazy'; im.src = u; v.appendChild(im); } });
      };
      var t1, t2; q('banner').addEventListener('input', function () { clearTimeout(t1); t1 = setTimeout(bannerVor, 400); }); q('shots').addEventListener('input', function () { clearTimeout(t2); t2 = setTimeout(shotsVor, 400); });
      bannerVor(); shotsVor();
      w.querySelector('#b-pruef').addEventListener('click', function () {
        var ul = w.querySelector('#pruefung'), b = this; ul.innerHTML = '<li class="muted">Prüfe …</li>'; b.disabled = true;
        api('POST', '/api/dev/pruefen', { website: q('web').value.trim() }).then(function (r) {
          b.disabled = false; ul.innerHTML = '';
          if (!r.ok) { ul.innerHTML = '<li class="nein"><span class="p">!</span><span>' + esc(FEHLER[r.j.fehler] || 'Die Prüfung hat nicht geklappt.') + '</span></li>'; return; }
          r.j.pruefungen.forEach(function (p) { ul.appendChild(el('<li class="' + (p.ok ? 'ja' : 'nein') + '"><span class="p">' + (p.ok ? '✓' : '!') + '</span><span>' + esc(p.text) + (p.ok || !p.hinweis ? '' : '<br><span class="muted klein">' + esc(p.hinweis) + '</span>') + '</span></li>')); });
          ul.appendChild(el('<li class="muted klein"><span class="p"></span><span>Das sind nur Hinweise – sie sperren nichts. Nicht automatisch prüfbar: nichts oben links anzeigen, Bedienung ohne Scrollen und ohne Hover auf Handy und Tablet.</span></li>'));
        });
      });
      var del = w.querySelector('#b-del');
      if (del) del.addEventListener('click', function () {
        if (confirm('„' + s.name + '“ wirklich löschen? Das lässt sich nicht rückgängig machen.')) api('DELETE', '/api/dev/spiel/' + s.id).then(function (r) { if (r.ok) location.hash = '#/'; });
      });
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var fe = w.querySelector('#f-fehler'), b = f.querySelector('button[type=submit]'); fe.textContent = '';
        var rel = q('release').value ? new Date(q('release').value) : null;
        var body = {
          titel: q('titel').value, text: q('text').value, beschreibung: q('beschr').value, tags: zeilen(q('tags').value), banner: q('banner').value.trim(), website: q('web').value.trim(),
          repo: q('repo').value.trim(), version: q('version').value, screenshots: zeilen(q('shots').value), trailer: zeilen(q('trailer').value),
          release: rel && !isNaN(rel) ? rel.toISOString() : '', farbe: q('farbe').value, mitentwickler: zeilen(q('mit').value.replace(/@/g, ''))
        };
        b.disabled = true;
        api(neu ? 'POST' : 'PUT', neu ? '/api/dev/spiel' : '/api/dev/spiel/' + s.id, body).then(function (r) {
          b.disabled = false;
          if (r.ok) { location.hash = '#/'; return; }
          fe.textContent = fehlerText(r.j); fe.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      });
      rahmen(w, 'start');
    };
    if (id) laden(function () { s = daten.spiele.filter(function (x) { return x.id === id && x.ich_besitzer; })[0]; if (!s) { location.hash = '#/'; return; } los(); }); else los();
  }

  /* ---------- Statistik ---------- */
  function dauer(sek) { if (sek < 60) return sek + ' s'; if (sek < 3600) return Math.round(sek / 60) + ' Min'; var h = sek / 3600; return (h < 10 ? h.toFixed(1).replace('.', ',') : Math.round(h)) + ' Std'; }
  function balken(tage, feld, fmt) {
    var W = 640, H = 150, L = 34, B = 20, n = tage.length, max = Math.max.apply(null, tage.map(function (t) { return t[feld]; }).concat([1]));
    var bw = (W - L) / n, s = '<svg class="diagramm" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Verlauf der letzten 30 Tage"><line class="achse" x1="' + L + '" y1="' + (H - B) + '" x2="' + W + '" y2="' + (H - B) + '"/>';
    s += '<text x="0" y="12">' + esc(fmt(max)) + '</text><text x="0" y="' + (H - B) + '">0</text>';
    tage.forEach(function (t, i) {
      var h = Math.round((t[feld] / max) * (H - B - 18)), x = L + i * bw;
      s += '<rect class="balken" x="' + (x + 1).toFixed(1) + '" y="' + (H - B - h) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + h + '" rx="2"><title>' + esc(t.tag + ': ' + fmt(t[feld])) + '</title></rect>';
    });
    s += '<text x="' + L + '" y="' + (H - 4) + '">' + esc(tage[0].tag.slice(5).split('-').reverse().join('.')) + '.</text><text x="' + W + '" y="' + (H - 4) + '" text-anchor="end">' + esc(tage[n - 1].tag.slice(5).split('-').reverse().join('.')) + '.</text></svg>';
    return s;
  }
  function seiteStatistik(id) {
    laden(function () {
      var sp = daten.spiele.filter(function (x) { return x.id === id; })[0];
      if (!sp) { location.hash = '#/'; return; }
      api('GET', '/api/dev/spiel/' + id + '/statistik').then(function (r) {
        if (!r.ok) { rahmen(meldung('fehler', fehlerText(r.j)), 'start'); return; }
        var d = r.j, g = d.gestaffelt, bw = d.bewertung;
        var k = function (zahl, text) { return '<div class="kachel"><b>' + esc(zahl) + '</b><span>' + esc(text) + '</span></div>'; };
        var w = el('<div><p class="klein"><a href="#/">← Meine Spiele</a></p><h1>' + esc(sp.name) + '</h1><p class="muted">Statistik. Es gibt nur Summen, nie einzelne Konten.' + (d.veroeffentlicht ? '' : ' Das Spiel ist noch nicht veröffentlicht.') + '</p>' +
          '<div class="kacheln">' + k(d.spieler, 'Spieler insgesamt') + k(d.aktiv7, 'aktiv in 7 Tagen') + k(d.aktiv30, 'aktiv in 30 Tagen') + k(d.wiederkehrer, 'kamen an 2+ Tagen wieder') +
          k(dauer(d.spielzeit), 'Spielzeit insgesamt') + k(dauer(d.schnitt), 'Ø Spielzeit pro Spieler') + k(d.favoriten, 'Favoriten') + k(bw.anzahl ? String(bw.schnitt).replace('.', ',') + ' ★' : '–', 'Bewertung (' + bw.anzahl + ')') + '</div>' +
          '<h2>Spieler pro Tag</h2><div class="karte">' + balken(d.tage, 'spieler', function (v) { return String(v); }) + '</div>' +
          '<h2>Spielzeit pro Tag</h2><div class="karte">' + balken(d.tage, 'sekunden', dauer) + '</div>' +
          '<p class="klein muted">Der Tagesverlauf wird erst seit ' + (d.tageSeit ? esc(d.tageSeit.split('-').reverse().join('.')) : 'dem ersten Spielen') + ' gezählt; „Spieler insgesamt“ und die Spielzeit enthalten alles.</p>' +
          '<h2>Wie lange wird gespielt?</h2><div class="karte verteilung">' + [['unter 15 Min', g.unter15], ['15–60 Min', g.min15bis60], ['1–5 Std', g.std1bis5], ['über 5 Std', g.ueber5std]].map(function (z) { var p = d.spieler ? Math.round(z[1] / d.spieler * 100) : 0; return '<div class="z"><span>' + z[0] + '</span><div class="s"><i style="width:' + p + '%"></i></div><span>' + z[1] + '</span></div>'; }).join('') + '</div>' +
          '<h2>Bewertungen</h2><div class="karte verteilung">' + [5, 4, 3, 2, 1].map(function (n) { var c = bw.verteilung[n - 1], p = bw.anzahl ? Math.round(c / bw.anzahl * 100) : 0; return '<div class="z"><span>' + n + ' ★</span><div class="s"><i style="width:' + p + '%"></i></div><span>' + c + '</span></div>'; }).join('') + '</div>' +
          '<p class="klein muted">Bewerten darf man ab 15 Minuten Spielzeit.</p></div>');
        rahmen(w, 'start');
      });
    });
  }

  /* ---------- Vorgaben ---------- */
  function seiteVorgaben() {
    var w = el('<div><h1>Vorgaben für Spiele</h1><p class="muted">Damit ein Spiel im Hub gut funktioniert, soll es diese Punkte erfüllen. Beim Einreichen kannst du die Website prüfen lassen (Hinweise, keine Sperre).</p>' +
      '<div class="karte"><ul class="liste">' +
      '<li><b>Lautstärke vom Hub steuerbar.</b> Der Ton-Block aus <code>tools/lgh-ton.js</code> steckt in <code>tools/lgh-vorlade.js</code>. Zusätzlich ein eigener Ton-Schalter in den Einstellungen.</li>' +
      '<li><b>Nichts oben links anzeigen.</b> Dort sitzt das Logo des Hubs.</li>' +
      '<li><b>Spielstand im Browser-Speicher (localStorage)</b>, kein eigenes Login nötig. Die Hub-Anbindung <code>lgh-vorlade.js</code> gehört ganz nach vorn in den <code>&lt;head&gt;</code>.</li>' +
      '<li><b>Einstellungsmenü mit „Spielstand-Code“</b> (<code>lgh-modul.js</code>). Einbau: <code>python3 tools/lgh-einbauen.py &lt;index.html&gt; &lt;spiel-id&gt;</code> im Hub-Repo.</li>' +
      '<li><b>Handy und Tablet:</b> Hoch- und Querformat, ohne Scrollen, ohne Bedienung, die nur per Mauszeiger (Hover) geht.</li>' +
      '<li><b>Einbettbar:</b> Die Seite darf nicht per <code>X-Frame-Options</code> oder <code>frame-ancestors</code> das Einbetten verbieten.</li>' +
      '<li><b>Kein Canopy</b> und keine KI-erzeugten Icons; Banner im Format 5:1 (2000 × 400) mit dem Titel im Bild.</li></ul>' +
      '<p>Die Werkzeuge liegen im Repo <a href="https://github.com/LeifPS/Leif-Game-Hub" target="_blank" rel="noopener">LeifPS/Leif-Game-Hub</a> im Ordner <code>tools/</code>, die Erklärung in der README.</p></div>' +
      '<h2>Beim Einreichen</h2><div class="karte"><ul class="liste"><li>Titel, Kurzbeschreibung, Tags (1–5), Banner (5:1), Website (Ziel des Rahmens)</li><li>3 bis 20 Screenshots (Bild-Links), optional 1–2 YouTube-Trailer</li><li>Optional: Repo, Version, Beschreibung, weitere Entwickler (müssen zustimmen), Veröffentlichungsdatum</li></ul>' +
      '<p class="muted klein">Bilder und Trailer werden nur verlinkt, nicht hochgeladen. Es gibt keine Prüfung vor der Veröffentlichung.</p></div></div>');
    rahmen(w, 'vorgaben');
  }

  /* ---------- Routen ---------- */
  function route() {
    if (!konto) { seiteAnmelden(); return; }
    var h = location.hash.replace(/^#\/?/, ''), t = h.split('/');
    if (h === '' ) return seiteStart();
    if (h === 'neu') return seiteFormular(null);
    if (h === 'vorgaben') return seiteVorgaben();
    if (t[0] === 'spiel' && /^[a-z0-9_-]+$/.test(t[1] || '')) {
      if (t[2] === 'bearbeiten') return seiteFormular(t[1]);
      if (t[2] === 'statistik') return seiteStatistik(t[1]);
    }
    seiteStart();
  }
  window.addEventListener('hashchange', route);
  route();
})();
