/* Konto, Freunde und stilles Mitschreiben der Spielstände im Hub.
   - Ohne Anmeldung ist der Hub gesperrt (Anmeldebildschirm), das Konto liegt auf dem Server (siehe src/konten.js).
   - Spielstände bleiben wie bisher lokal im Hub-Speicher (lgh.stand.<id>, siehe app.js). Zusätzlich schreibt dieses Modul
     sie still mit: nur hochladen, nie zurückladen, nichts anzeigen, Fehler werden verschluckt. So gibt es später Verlaufsdaten ab dem Tag,
     an dem es eingeschaltet wurde, ohne dass das Spielen davon abhängt.
   - Herzschlag: der Hub meldet alle 45 s, in welchem Spiel man gerade ist (nur für Freunde sichtbar). */
(function () {
  'use strict';

  var KEY = 'lgh.konto';
  // Einmaliger Umzug von der alten Adresse auf leifps.de (siehe umzug.html): Spielstände und Geräte-Kennung wandern per Pop-up herüber.
  var ALT_HOST = 'lgh.leifps.workers.dev', NEU_HOSTS = ['leifps.de', 'hub.leifps.de'], UMZUG_KEY = 'lgh.umzug';
  var STAND_RE = /^lgh\.stand\.[a-z0-9_-]{1,40}(\.vorher|\.sicher)?$/;
  var NAME_RE = /^[\p{L}\p{N}._-]{3,20}$/u;
  var konto = null;            // { name (= @Benutzername, fest), anzeige (Anzeigename), token }
  var bereitFn = null, bereitP = null;
  var spielId = null, raum = null;
  var lauscher = [];
  var offeneAnfragen = 0;

  /* ---------- Hilfen ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }

  function geraet() {
    var ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Browser';
  }

  // Zufällige Kennung dieses Geräts (Browser-Speicher). Wird nur gebraucht, falls die Gerätesperre wieder an ist (siehe src/konten.js, EIN_GERAET).
  var gidMerk = null;
  function geraetId() {
    if (gidMerk) return gidMerk;
    var g = null;
    try { g = localStorage.getItem('lgh.geraet'); } catch (e) { }
    if (!g || !/^[0-9a-f]{32}$/.test(g)) {
      try { g = hex(crypto.getRandomValues(new Uint8Array(16))); } catch (e) { g = null; }
      if (g) { try { localStorage.setItem('lgh.geraet', g); } catch (e2) { } }
    }
    gidMerk = g;
    return g;
  }

  // Schlüssel aus Name und Passwort (PBKDF2). Nur er geht an den Server, nie das Passwort selbst (siehe src/konten.js).
  function schluessel(name, pw) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 210000, salt: enc.encode('lgh1:' + name.normalize('NFC').toLowerCase()) }, k, 256);
    }).then(hex);
  }

  /* ---------- Server ---------- */
  function api(methode, pfad, body, opt) {
    opt = opt || {};
    var kopf = { 'content-type': 'application/json' };
    if (konto && !opt.ohneToken) kopf.authorization = 'Bearer ' + konto.token;
    var gid = geraetId(); if (gid) kopf['x-geraet'] = gid;
    var abbruch = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = abbruch ? setTimeout(function () { abbruch.abort(); }, opt.timeout || 12000) : null;
    return fetch(pfad, {
      method: methode, headers: kopf, body: body === undefined ? undefined : JSON.stringify(body),
      keepalive: !!opt.keepalive, cache: 'no-store', signal: abbruch ? abbruch.signal : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j || {} }; });
    }, function () { return { ok: false, status: 0, j: { fehler: 'netz' } }; }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.status === 401 && res.j.fehler === 'nicht_angemeldet' && konto && !opt.ohneToken) abgelaufen();
      return res;
    });
  }

  /* ---------- Anmeldung ---------- */
  var FEHLER = {
    name: 'Der Benutzername braucht 3 bis 20 Zeichen: Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich (keine Leerzeichen).',
    name_vergeben: 'Diesen Benutzernamen gibt es schon. Nimm einen anderen.',
    anzeige: 'Der Anzeigename darf höchstens 24 Zeichen haben und keine Sonderzeichen wie < oder > enthalten.',
    login: 'Benutzername oder Passwort stimmt nicht.',
    name_gleich: 'Das ist schon dein Benutzername.',
    anderes_geraet: 'Dieses Konto wurde auf einem anderen Gerät erstellt. Anmelden auf mehreren Geräten geht noch nicht, weil die Spielstände noch nicht zwischen Geräten abgeglichen werden. Das kommt später. Erstelle hier ein neues Konto oder frag Leif, wenn du das Gerät wechseln musst.',
    netz: 'Keine Verbindung zum Server. Bitte später noch einmal versuchen.',
    eingabe: 'Bitte alle Felder ausfüllen.',
    schluessel: 'Das Passwort konnte nicht verarbeitet werden.',
    server: 'Der Server hatte ein Problem. Bitte gleich noch einmal versuchen.',
  };
  function fehlerText(res) {
    if (res.j.fehler === 'zu_viele') {
      var w = res.j.warte || 30;
      return 'Zu viele Versuche. Bitte in ' + (w > 90 ? Math.ceil(w / 60) + ' Minuten' : w + ' Sekunden') + ' noch einmal versuchen.';
    }
    if (res.j.fehler === 'zu_frueh') {
      var tg = Math.ceil((res.j.warte || 0) / 86400), st = Math.ceil((res.j.warte || 0) / 3600);
      return 'Den Benutzernamen kannst du nur einmal pro Woche ändern. Das geht wieder in ' + (st > 36 ? tg + ' Tagen' : st > 1 ? st + ' Stunden' : 'weniger als einer Stunde') + '.';
    }
    return FEHLER[res.j.fehler] || 'Das hat nicht geklappt (' + (res.j.fehler || res.status) + ').';
  }

  function speichereKonto(k) { if (k.av === undefined && konto) k.av = konto.av; konto = k; lsSet(KEY, JSON.stringify(k)); }
  function ladeKonto() { try { var k = JSON.parse(lsGet(KEY)); if (k && k.name && /^[0-9a-f]{64}$/.test(k.token)) return k; } catch (e) { } return null; }
  // Name, wie andere dich sehen: der Anzeigename, sonst der Benutzername
  function anzeigeName() { return konto ? (konto.anzeige || konto.name) : null; }
  function bereinige(t) { return String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim(); }
  function anzeigeOk(t) { return t.length <= 24 && Array.from(t).length <= 24 && !/[\u0000-\u001f\u007f<>]/.test(t); }

  function meldeAn() { if (bereitFn) { var f = bereitFn; bereitFn = null; f(); } }
  function bereit() {
    if (konto) return Promise.resolve();
    if (!bereitP) bereitP = new Promise(function (ok) { bereitFn = function () { bereitP = null; ok(); }; });
    return bereitP;
  }

  function abgelaufen() {
    konto = null; lsDel(KEY); spielId = null;
    aktualisiereKnopf();
    zeigeAnmeldung('Bitte melde dich neu an.');
  }

  function umzugOffen() { return NEU_HOSTS.indexOf(location.hostname) >= 0 && lsGet(UMZUG_KEY) === null; }

  // Wartet, bis das Pop-up auf der alten Adresse seine Daten geschickt hat (nur von genau diesem Fenster und dieser Adresse)
  function holeAlt(popup) {
    return new Promise(function (ok) {
      var fertig = false, timer, wach;
      function ende(d) { if (fertig) return; fertig = true; clearTimeout(timer); clearInterval(wach); window.removeEventListener('message', h); ok(d); }
      function h(e) {
        if (e.origin !== 'https://' + ALT_HOST || e.source !== popup) return;
        var d = e.data;
        if (d && d.lghUmzug === 1 && d.daten && typeof d.daten === 'object') ende(d.daten);
      }
      window.addEventListener('message', h);
      timer = setTimeout(function () { ende(null); }, 10000);
      wach = setInterval(function () { if (popup.closed) setTimeout(function () { ende(null); }, 400); }, 500);
    });
  }
  // Übernimmt Spielstände (nur wo hier noch keiner liegt) und die Geräte-Kennung. Die Anmeldung selbst wird nie übertragen.
  function uebernimm(d) {
    if (!d) return -1;
    var n = 0, st = d.stand && typeof d.stand === 'object' ? d.stand : {};
    Object.keys(st).forEach(function (k) {
      if (!STAND_RE.test(k) || typeof st[k] !== 'string' || st[k].length > 2000000 || lsGet(k) !== null) return;
      try { localStorage.setItem(k, st[k]); if (!/\.(vorher|sicher)$/.test(k)) n++; } catch (e) { }
    });
    if (typeof d.geraet === 'string' && /^[0-9a-f]{32}$/.test(d.geraet)) { lsSet('lgh.geraet', d.geraet); gidMerk = d.geraet; }
    lsSet(UMZUG_KEY, '1');
    return n;
  }

  function zeigeAnmeldung(hinweis) {
    var alt = document.getElementById('konto-sperre');
    if (alt) alt.remove();
    var el = document.createElement('div');
    el.id = 'konto-sperre'; el.className = 'konto-sperre'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Anmelden');
    el.innerHTML =
      '<div class="konto-karte">' +
      '<svg class="brand-mark" aria-hidden="true"><use href="#logo"/></svg>' +
      '<h1>Leif Game Hub</h1>' +
      '<p class="konto-sub">Mit einem Konto siehst du, was deine Freunde gerade spielen, und kannst Freunde hinzufügen.</p>' +
      (location.hostname === ALT_HOST ? '<div class="konto-alt"><b>Diese Adresse wird bald nicht mehr unterstützt.</b> Bitte wechsle zu <a href="https://hub.leifps.de/">hub.leifps.de</a>. Ab Dienstag, 10. November, 15:00 Uhr wirst du automatisch weitergeleitet. Melde dich dort an, dann werden deine Spielstände einmalig übernommen.</div>' : '') +
      '<div class="konto-tabs" role="tablist"><button type="button" class="aktiv" data-m="an" role="tab">Anmelden</button><button type="button" data-m="neu" role="tab">Konto erstellen</button></div>' +
      '<form id="konto-form" novalidate>' +
      '<label>Benutzername<input name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" placeholder="@benutzername" required></label>' +
      '<div class="konto-regel nur-neu">3 bis 20 Zeichen: Buchstaben, Zahlen, Punkt, Unterstrich, Bindestrich. Damit melden dich und deine Freunde an und finden dich. Er lässt sich später nicht ändern.</div>' +
      '<label class="nur-neu">Anzeigename<input name="anzeige" autocomplete="nickname" autocapitalize="words" spellcheck="false" maxlength="24" placeholder="Wie andere dich sehen (optional)"></label>' +
      '<div class="konto-regel nur-neu">So sehen dich andere. Du kannst ihn jederzeit ändern. Leer lassen = Benutzername.</div>' +
      '<label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<label class="nur-neu">Passwort wiederholen<input name="password2" type="password" autocomplete="new-password"></label>' +
      '<div class="konto-regel nur-neu">Mindestens 6 Zeichen. Merk es dir gut: Es gibt keine E-Mail zum Zurücksetzen.</div>' +
      '<div class="konto-regel nur-neu">Du kannst dich mit dem Konto auf mehreren Geräten anmelden. Spielstände werden mitgeschrieben und lassen sich im Konto-Menü unter „Spielstände“ auf einem anderen Gerät zurückholen.</div>' +
      (umzugOffen() ? '<label class="konto-umzug"><input type="checkbox" name="umzug" checked><span><b>Daten von der alten Adresse übernehmen</b> (einmalig). Beim Anmelden öffnet sich kurz ein Fenster von ' + ALT_HOST + ', das deine Spielstände herüberschickt. Bitte Pop-ups erlauben.</span></label>' : '') +
      '<div class="konto-fehler" id="konto-fehler" role="alert"></div>' +
      '<button class="btn btn-primary konto-los" type="submit">Anmelden</button>' +
      '</form>' +
      '<p class="konto-hinweis">Passwort vergessen? Frag Leif, er kann es zurücksetzen.</p>' +
      '</div>';
    document.body.appendChild(el);
    document.body.classList.add('konto-offen');
    var form = el.querySelector('#konto-form'), fehler = el.querySelector('#konto-fehler'), los = el.querySelector('.konto-los');
    var modus = 'an';
    if (hinweis) fehler.textContent = hinweis;
    function setze(m) {
      modus = m;
      el.classList.toggle('neu', m === 'neu');
      [].forEach.call(el.querySelectorAll('.konto-tabs button'), function (b) { b.classList.toggle('aktiv', b.getAttribute('data-m') === m); });
      form.password.setAttribute('autocomplete', m === 'neu' ? 'new-password' : 'current-password');
      los.textContent = m === 'neu' ? 'Konto erstellen' : 'Anmelden';
      fehler.textContent = '';
    }
    el.querySelector('.konto-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setze(b.getAttribute('data-m')); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.username.value.trim().replace(/^@/, '').normalize('NFC'), pw = form.password.value;
      var anz = modus === 'neu' ? bereinige(form.anzeige.value) : '';
      fehler.textContent = '';
      if (anz && !anzeigeOk(anz)) { fehler.textContent = FEHLER.anzeige; return; }
      if (!NAME_RE.test(name)) { fehler.textContent = FEHLER.name; return; }
      if (!pw) { fehler.textContent = FEHLER.eingabe; return; }
      if (modus === 'neu') {
        if (pw.length < 6) { fehler.textContent = 'Das Passwort braucht mindestens 6 Zeichen.'; return; }
        if (pw !== form.password2.value) { fehler.textContent = 'Die beiden Passwörter sind nicht gleich.'; return; }
      }
      // Das Pop-up muss direkt im Klick geöffnet werden, sonst blockiert es der Browser
      var umzug = !!(form.umzug && form.umzug.checked && umzugOffen()), popup = null;
      if (umzug) {
        try { popup = window.open('https://' + ALT_HOST + '/umzug.html', 'lgh-umzug', 'width=420,height=320'); } catch (x) { popup = null; }
        if (!popup) { fehler.textContent = 'Das Fenster für die Übernahme wurde blockiert. Erlaube Pop-ups für diese Seite oder nimm den Haken bei „Daten übernehmen“ raus.'; return; }
      }
      los.disabled = true; los.textContent = 'Einen Moment …';
      var vorspann = umzug ? holeAlt(popup).then(function (d) { var n = uebernimm(d); if (n < 0) { try { popup.close(); } catch (x) { } } return n; }) : Promise.resolve(0);
      vorspann.then(function () { return schluessel(name, pw); }).then(function (key) {
        return api('POST', modus === 'neu' ? '/api/registrieren' : '/api/anmelden', { name: name, anzeige: anz || undefined, key: key, geraet: geraet(), gid: geraetId() || undefined }, { ohneToken: true });
      }).then(function (res) {
        if (!res.ok) {
          fehler.textContent = fehlerText(res) + (res.j && res.j.fehler === 'anderes_geraet' && form.umzug && !form.umzug.checked ? ' Tipp: Setze den Haken bei „Daten von der alten Adresse übernehmen“, dann klappt es.' : '');
          los.disabled = false; los.textContent = modus === 'neu' ? 'Konto erstellen' : 'Anmelden'; return; }
        speichereKonto({ name: res.j.name, anzeige: res.j.anzeige || res.j.name, token: res.j.token, av: res.j.av || null });
        if (NEU_HOSTS.indexOf(location.hostname) >= 0) lsSet(UMZUG_KEY, '1');
        el.remove(); document.body.classList.remove('konto-offen');
        nachAnmeldung();
      }, function () { fehler.textContent = 'Die Anmeldung ist hier nicht möglich (Browser ohne Verschlüsselung).'; los.disabled = false; });
    });
    setTimeout(function () { try { form.username.focus(); } catch (e) { } }, 50);
  }

  function nachAnmeldung() {
    aktualisiereKnopf();
    meldeAn();
    herzschlag();
    pruefeFreunde();
    grundstand();
    benachrichtige();
  }

  /* ---------- Dialoge ---------- */
  function dialog(html, beiAuf) {
    var hinter = document.createElement('div');
    hinter.className = 'dlg-hinter';
    hinter.innerHTML = '<div class="dlg" role="dialog" aria-modal="true">' + html + '</div>';
    function zu() { hinter.remove(); document.removeEventListener('keydown', taste); }
    function taste(e) { if (e.key === 'Escape') zu(); }
    hinter.addEventListener('click', function (e) { if (e.target === hinter || e.target.closest('[data-zu]')) zu(); });
    document.addEventListener('keydown', taste);
    document.body.appendChild(hinter);
    if (beiAuf) beiAuf(hinter.firstChild, zu);
    return zu;
  }

  /* ---------- Spielstände ansehen und zurückholen ---------- */
  function datumZeit(sek) {
    var d = new Date(sek * 1000);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  function groesseText(n) { return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  // Ein Stand ist ein Objekt aus Schlüsseln und Texten (so legt der Hub ihn ab). Alles andere wird nicht zurückgeholt.
  function standGueltig(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
    var k = Object.keys(d);
    if (!k.length) return false;
    for (var i = 0; i < k.length; i++) if (typeof d[k[i]] !== 'string') return false;
    return true;
  }
  /* Holt einen älteren Stand zurück: 1. der aktuelle Stand dieses Geräts wird auf dem Server gesichert (und lokal als ".vorher" behalten),
     2. der gewählte Stand wird der aktuelle Hub-Stand, 3. er wird als neueste Version auf den Server geschrieben (der verdrängte bleibt erhalten). */
  function zurueckholen(id, d) {
    if (!standGueltig(d) || !window.LghStand) return Promise.resolve({ ok: false, text: 'Dieser Stand ist beschädigt und wird nicht zurückgeholt.' });
    var daten = JSON.stringify(d), lokal = window.LghStand.lokal(id);
    var sicher = Promise.resolve();
    if (lokal && lokal.d && standGueltig(lokal.d)) {
      sicher = api('PUT', '/api/stand/' + encodeURIComponent(id), { erzwingen: true, behalten: true, daten: JSON.stringify(lokal.d), geraet: geraet() }, { timeout: 30000 });
    }
    return sicher.then(function () {
      if (!window.LghStand.anwenden(id, d)) return { ok: false, text: 'Der Stand konnte auf diesem Gerät nicht gespeichert werden (Speicher voll?). Es wurde nichts verändert.' };
      var s = spur[id] || (spur[id] = {});
      return api('PUT', '/api/stand/' + encodeURIComponent(id), { erzwingen: true, behalten: true, daten: daten, geraet: geraet() }, { timeout: 30000 }).then(function (res) {
        if (res.ok) { s.daten = daten; s.letzter = daten; s.dirty = false; return { ok: true, text: 'Zurückgeholt. Der vorherige Stand bleibt unter den Versionen erhalten.' }; }
        s.daten = daten; s.dirty = true;   // wird mit dem nächsten Takt noch einmal versucht
        return { ok: true, text: 'Zurückgeholt. Das Sichern auf dem Server holt der Hub gleich nach.' };
      });
    });
  }
  function standAnsicht(el, menue) {
    var box = el.querySelector('#dlg-stand');
    menue.hidden = true; box.hidden = false;
    box.innerHTML = '<p class="konto-regel">Der Hub sichert deine Spielstände laufend auf dem Server (neueste Stände, ein Stand pro Tag der letzten 14 Tage und Stände vor einem plötzlichen Einbruch). Hier holst du einen älteren zurück. Vorher wird der aktuelle Stand gesichert, du kannst also wieder zurück.</p>' +
      '<div class="st-liste" id="st-liste"><div class="st-leer">Lädt …</div></div><div class="st-meld" id="st-meld" role="status"></div>' +
      '<div class="btn-row"><button class="btn btn-primary" type="button" data-alle>Fehlende Stände vom Server holen</button><button class="btn btn-ghost" type="button" data-zurueck>Zurück</button></div>';
    box.querySelector('[data-zurueck]').onclick = function () { box.hidden = true; menue.hidden = false; };
    var liste = box.querySelector('#st-liste'), meld = box.querySelector('#st-meld');
    function msg(t, fehler) { meld.textContent = t || ''; meld.className = 'st-meld' + (fehler ? ' fehler' : ''); }
    function name(id) { return window.LghStand ? window.LghStand.spielName(id) : id; }
    function laden() {
      api('GET', '/api/staende').then(function (res) {
        var ids = {}, server = {};
        if (res.ok) (res.j.staende || []).forEach(function (x) { server[x.spiel] = x; ids[x.spiel] = 1; });
        try { for (var z = 0; z < localStorage.length; z++) { var n = localStorage.key(z); if (n && /^lgh\.stand\.[a-z0-9_-]{1,40}$/.test(n)) ids[n.slice(10)] = 1; } } catch (e) { }
        var alle = Object.keys(ids).sort(function (a, b) { return name(a).localeCompare(name(b), 'de'); });
        if (!alle.length) { liste.innerHTML = '<div class="st-leer">Noch keine Spielstände gesichert. Sie erscheinen hier, sobald du ein Spiel gespielt hast.</div>'; return; }
        liste.innerHTML = alle.map(function (id) {
          var x = server[id], l = window.LghStand && window.LghStand.lokal(id);
          var sub = x ? 'Server: ' + datumZeit(x.aktualisiert) + ' · ' + groesseText(x.groesse) : (l ? 'nur auf diesem Gerät' : '');
          return '<div class="st-spiel" data-id="' + esc(id) + '"><button type="button" class="st-kopf"><b>' + esc(name(id)) + '</b><small>' + esc(sub) + '</small></button><div class="st-detail" hidden></div></div>';
        }).join('');
        if (!res.ok) msg('Die Stände auf dem Server konnten gerade nicht geladen werden. Stände auf diesem Gerät siehst du trotzdem.', true);
      });
    }
    function detail(id, d) {
      d.innerHTML = '<div class="st-leer">Lädt …</div>';
      api('GET', '/api/stand/' + encodeURIComponent(id) + '/versionen').then(function (res) {
        var h = '', l = window.LghStand && window.LghStand.lokal(id), sich = window.LghStand ? window.LghStand.sicherungen(id) : [];
        h += '<div class="st-abschnitt">Auf diesem Gerät</div>';
        if (l) h += '<div class="st-zeile"><span>Aktuell im Hub · ' + (l.t ? datumZeit(Math.floor(l.t / 1000)) : '') + '</span></div>';
        sich.forEach(function (x) { h += '<div class="st-zeile"><span>' + esc(x.text) + ' · ' + (x.t ? datumZeit(x.t) : '') + ' · ' + groesseText(x.groesse) + '</span><button type="button" class="btn btn-ghost st-btn" data-st="holen" data-q="lokal:' + esc(x.art) + '">Zurückholen</button></div>'; });
        if (!l && !sich.length) h += '<div class="st-zeile"><span class="st-leer">Nichts auf diesem Gerät</span></div>';
        h += '<div class="st-abschnitt">Auf dem Server</div>';
        var v = res.ok ? (res.j.versionen || []) : null;
        if (v === null) h += '<div class="st-zeile"><span class="st-leer">Nicht erreichbar</span></div>';
        else if (!v.length) h += '<div class="st-zeile"><span class="st-leer">Noch nichts gesichert</span></div>';
        else v.forEach(function (x, i) {
          h += '<div class="st-zeile"><span>' + datumZeit(x.aktualisiert) + (i === 0 ? ' (neueste)' : '') + ' · ' + esc(x.geraet || 'Gerät') + ' · ' + groesseText(x.groesse) + '</span>' +
            '<span class="st-knoepfe"><button type="button" class="btn btn-ghost st-btn" data-st="holen" data-q="server:' + x.rev + '">Zurückholen</button>' +
            '<button type="button" class="btn btn-ghost st-btn" data-st="datei" data-q="server:' + x.rev + '">Datei</button></span></div>';
        });
        h += '<div class="st-abschnitt">Aus einer Datei</div><div class="st-zeile"><span>Eine zuvor gesicherte Datei zurückholen</span><button type="button" class="btn btn-ghost st-btn" data-st="waehle">Datei wählen …</button></div>' +
          '<input type="file" class="st-datei" accept=".json,application/json" hidden>';
        d.innerHTML = h;
      });
    }
    function quelle(id, q) {
      var t = q.split(':');
      if (t[0] === 'lokal') { var s = (window.LghStand.sicherungen(id).filter(function (x) { return x.art === t[1]; })[0]); return Promise.resolve(s ? s.d : null); }
      return api('GET', '/api/stand/' + encodeURIComponent(id) + '?rev=' + encodeURIComponent(t[1])).then(function (res) {
        if (!res.ok || typeof res.j.daten !== 'string') return null;
        try { return JSON.parse(res.j.daten); } catch (e) { return null; }
      });
    }
    function ausfuehren(id, d, btn) {
      if (btn) btn.disabled = true;
      zurueckholen(id, d).then(function (r) { msg(name(id) + ': ' + r.text, !r.ok); if (btn) btn.disabled = false; if (r.ok) laden(); });
    }
    // Holt für alle Spiele, die auf diesem Gerät noch keinen Stand haben, den neuesten vom Server. Vorhandene Stände bleiben unberührt.
    box.querySelector('[data-alle]').onclick = function () {
      var b = this; b.disabled = true; msg('Hole Stände vom Server …');
      api('GET', '/api/staende').then(function (res) {
        if (!res.ok || !window.LghStand) { msg('Der Server ist gerade nicht erreichbar.', true); b.disabled = false; return; }
        var fehlt = (res.j.staende || []).filter(function (x) { return !window.LghStand.lokal(x.spiel); }), pos = 0, ok = 0, bad = [];
        (function weiter() {
          if (pos >= fehlt.length) {
            var t = !fehlt.length ? 'Auf diesem Gerät fehlt kein Stand. Bei Spielen, die hier schon einen Stand haben, nutzt du „Zurückholen" beim jeweiligen Spiel.' : ok + ' Stände zurückgeholt.' + (bad.length ? ' Nicht geklappt: ' + bad.join(', ') + '.' : '');
            msg(t, bad.length > 0); b.disabled = false; laden(); return;
          }
          var x = fehlt[pos++];
          quelle(x.spiel, 'server:' + x.rev).then(function (d) {
            if (standGueltig(d) && window.LghStand.anwenden(x.spiel, d)) {
              var j = JSON.stringify(d), sp = spur[x.spiel] || (spur[x.spiel] = {});
              sp.daten = j; sp.letzter = j; sp.dirty = false; ok++;
            } else bad.push(name(x.spiel));
            weiter();
          });
        })();
      });
    };
    box.addEventListener('click', function (e) {
      var kopf = e.target.closest('.st-kopf');
      if (kopf) {
        var sp = kopf.parentNode, d = sp.querySelector('.st-detail');
        if (d.hidden) { d.hidden = false; detail(sp.getAttribute('data-id'), d); } else d.hidden = true;
        return;
      }
      var b = e.target.closest('[data-st]');
      if (!b) return;
      var sp2 = b.closest('.st-spiel'), id = sp2.getAttribute('data-id'), a = b.getAttribute('data-st'), q = b.getAttribute('data-q');
      msg('');
      if (a === 'waehle') { sp2.querySelector('.st-datei').click(); return; }
      if (a === 'datei') {
        quelle(id, q).then(function (d) {
          if (!standGueltig(d)) return msg('Dieser Stand konnte nicht geladen werden.', true);
          var blob = new Blob([JSON.stringify({ lgh: 1, spiel: id, gesichert: Math.floor(Date.now() / 1000), daten: d })], { type: 'application/json' });
          var u = URL.createObjectURL(blob), l = document.createElement('a');
          l.href = u; l.download = 'lgh-' + id + '-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(l); l.click(); l.remove();
          setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
        });
        return;
      }
      if (a === 'holen') {
        // Zweistufig: erst bestätigen lassen
        if (b.getAttribute('data-ok') !== '1') {
          b.setAttribute('data-ok', '1'); b.textContent = 'Wirklich zurückholen?';
          setTimeout(function () { if (b.parentNode) { b.removeAttribute('data-ok'); b.textContent = 'Zurückholen'; } }, 5000);
          return;
        }
        quelle(id, q).then(function (d) { if (!standGueltig(d)) return msg('Dieser Stand konnte nicht geladen werden.', true); ausfuehren(id, d, b); });
      }
    });
    box.addEventListener('change', function (e) {
      var f = e.target; if (!f.classList || !f.classList.contains('st-datei') || !f.files || !f.files[0]) return;
      var sp = f.closest('.st-spiel'), id = sp.getAttribute('data-id'), datei = f.files[0];
      if (datei.size > 3000000) { f.value = ''; return msg('Die Datei ist zu groß.', true); }
      var r = new FileReader();
      r.onload = function () {
        f.value = '';
        var o; try { o = JSON.parse(r.result); } catch (x) { return msg('Das ist keine gültige Sicherungsdatei.', true); }
        var d = o && (o.daten || o.d || o);
        if (!standGueltig(d)) return msg('Das ist keine gültige Sicherungsdatei.', true);
        if (o.spiel && o.spiel !== id) return msg('Diese Datei gehört zu einem anderen Spiel (' + name(o.spiel) + ').', true);
        if (!window.confirm('Den Stand aus „' + datei.name + '“ für ' + name(id) + ' zurückholen? Der aktuelle Stand wird vorher gesichert.')) return;
        ausfuehren(id, d, null);
      };
      r.readAsText(datei);
    });
    laden();
  }

  /* ---------- Profilbild wählen ---------- */
  var symbolIndex = null;     // { urheber: {ordner: name}, symbole: ['ordner/name', ...] } aus icons/index.json
  // Deutsche Suchwörter für die englischen Symbolnamen (englisch geht immer auch)
  var DE = { drache: 'dragon', katze: 'cat', hund: 'dog', schwert: 'sword', feuer: 'fire', flamme: 'flame', wasser: 'water', herz: 'heart', stern: 'star', schaedel: 'skull', schädel: 'skull', krone: 'crown', pilz: 'mushroom', fisch: 'fish', vogel: 'bird', baum: 'tree', auto: 'car', rakete: 'rocket', roboter: 'robot', zauberer: 'wizard', magier: 'wizard', schild: 'shield', bogen: 'bow', pfeil: 'arrow', bombe: 'bomb', muenze: 'coin', münze: 'coin', schatz: 'treasure', wuerfel: 'dice', würfel: 'dice', karte: 'card', geist: 'ghost', hase: 'rabbit', baer: 'bear', bär: 'bear', loewe: 'lion', löwe: 'lion', eule: 'owl', fuchs: 'fox', schlange: 'snake', spinne: 'spider', kuh: 'cow', pferd: 'horse', affe: 'monkey', hai: 'shark', wal: 'whale', krebs: 'crab', biene: 'bee', blume: 'flower', sonne: 'sun', mond: 'moon', blitz: 'lightning', eis: 'ice', schnee: 'snow', diamant: 'diamond', schluessel: 'key', schlüssel: 'key', buch: 'book', trank: 'potion', hut: 'hat', helm: 'helmet', axt: 'axe', pistole: 'pistol', fluegel: 'wing', flügel: 'wing', auge: 'eye', hand: 'hand', fuss: 'foot', fuß: 'foot', zahn: 'tooth', knochen: 'bone', maske: 'mask', ritter: 'knight', pirat: 'pirate', engel: 'angel', teufel: 'devil', kuchen: 'cake', apfel: 'apple', kaffee: 'coffee', musik: 'music', gitarre: 'guitar', trommel: 'drum', glocke: 'bell', uhr: 'clock', kompass: 'compass', schiff: 'ship', boot: 'boat', flugzeug: 'plane', zug: 'train', rad: 'wheel', zahnrad: 'gear', schmetterling: 'butterfly', ente: 'duck', huhn: 'chicken', schwein: 'pig', schaf: 'sheep', ziege: 'goat', frosch: 'frog', schildkroete: 'turtle', schildkröte: 'turtle', elefant: 'elephant', pinguin: 'penguin', krake: 'octopus', qualle: 'jellyfish', ei: 'egg', kaese: 'cheese', käse: 'cheese', brot: 'bread', kerze: 'candle', laterne: 'lantern', fackel: 'torch', tuer: 'door', tür: 'door', turm: 'tower', burg: 'castle', schloss: 'castle', haus: 'house', berg: 'mountain', insel: 'island', vulkan: 'volcano', wolke: 'cloud', regen: 'rain', komet: 'comet', vampir: 'vampire', werwolf: 'werewolf', wikinger: 'viking', koch: 'chef', arzt: 'doctor', fernglas: 'binoculars', lupe: 'magnifying', spaten: 'shovel', netz: 'net', falle: 'trap', kristall: 'crystal', edelstein: 'gem', kette: 'necklace', brille: 'glasses', handy: 'phone', maus: 'mouse', fussball: 'soccer', fußball: 'soccer', schach: 'chess', spiel: 'game' };
  var SWATCH = ['#ffffff', '#111827', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  function hslHex(h, sat, l) {
    sat /= 100; l /= 100;
    var a = sat * Math.min(l, 1 - l), f = function (n) { var k = (n + h / 30) % 12, c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return ('0' + Math.round(255 * c).toString(16)).slice(-2); };
    return '#' + f(0) + f(8) + f(4);
  }
  function standardHintergrund(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return hslHex(h, 48, 36); }
  function symbolSuche(index, text) {
    var teile = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!teile.length) return index.symbole;
    var gruppen = teile.map(function (t) {
      var alt = [t];
      if (DE[t]) alt.push(DE[t]);
      else if (t.length >= 3) Object.keys(DE).forEach(function (k) { if (k.indexOf(t) === 0 && alt.indexOf(DE[k]) < 0) alt.push(DE[k]); });
      return alt;
    });
    return index.symbole.filter(function (id) {
      var n = id.split('/')[1].replace(/-/g, ' ');
      return gruppen.every(function (alt) { return alt.some(function (t) { return n.indexOf(t) >= 0; }); });
    });
  }
  /* ---------- Sichtbarkeit: wer sieht Online-Status und gespielte Spiele (2 = alle, 1 = Freunde, 0 = niemand) ---------- */
  function sichtAnsicht(el, menue) {
    var box = el.querySelector('#dlg-sicht');
    menue.hidden = true; box.hidden = false;
    var wahl = function (feld, titel, text, wert) {
      return '<div class="sicht-block"><div class="sicht-titel">' + titel + '</div><div class="sicht-text">' + text + '</div>' +
        '<div class="dlg-wahl" role="radiogroup" aria-label="' + titel + '">' +
        '<button type="button" role="radio" data-f="' + feld + '" data-w="0" aria-checked="' + (wert === 0) + '">Niemand</button>' +
        '<button type="button" role="radio" data-f="' + feld + '" data-w="1" aria-checked="' + (wert === 1) + '">Freunde</button>' +
        '<button type="button" role="radio" data-f="' + feld + '" data-w="2" aria-checked="' + (wert === 2) + '">Alle</button></div></div>';
    };
    box.innerHTML = '<div class="st-leer">Lädt …</div>';
    api('GET', '/api/ich').then(function (res) {
      if (!res.ok || !res.j.sicht) { box.innerHTML = '<div class="konto-fehler" role="alert">Die Einstellungen konnten gerade nicht geladen werden.</div><div class="btn-row"><button class="btn btn-ghost" type="button" data-zurueck>Zurück</button></div>'; box.querySelector('[data-zurueck]').onclick = function () { box.hidden = true; menue.hidden = false; }; return; }
      var sicht = res.j.sicht;
      box.innerHTML =
        wahl('online', 'Online-Status', 'Ob du gerade online bist und wann du zuletzt online warst. Bei „Niemand“ siehst du für andere immer offline aus.', sicht.online) +
        wahl('spiele', 'Gespielte Spiele', 'Welche Spiele du schon gespielt hast und welches du gerade spielst. Bei „Niemand“ können Freunde dir auch nicht in ein Spiel folgen.', sicht.spiele) +
        '<div class="konto-regel">Standard ist „Freunde“. Bei „Alle“ sieht es jede angemeldete Person, die dein Profil öffnet, bei „Niemand“ nicht einmal deine Freunde. Spielzeit und das Datum des letzten Spielens sieht ohnehin nur du selbst.</div>' +
        '<div class="st-meld" id="si-meld" role="status"></div>' +
        '<div class="btn-row"><button class="btn btn-ghost" type="button" data-zurueck>Zurück</button></div>';
      box.querySelector('[data-zurueck]').onclick = function () { box.hidden = true; menue.hidden = false; };
      var meld = box.querySelector('#si-meld');
      box.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-f]') : null;
        if (!b) return;
        var feld = b.getAttribute('data-f'), w = +b.getAttribute('data-w'), body = {};
        body[feld] = w;
        var knoepfe = box.querySelectorAll('[data-f]'); for (var i = 0; i < knoepfe.length; i++) knoepfe[i].disabled = true;
        api('POST', '/api/sichtbarkeit', body).then(function (r) {
          for (var j = 0; j < knoepfe.length; j++) knoepfe[j].disabled = false;
          if (!r.ok) { meld.textContent = 'Das hat nicht geklappt. Bitte noch einmal versuchen.'; meld.className = 'st-meld fehler'; return; }
          for (var k = 0; k < knoepfe.length; k++) knoepfe[k].setAttribute('aria-checked', String(+knoepfe[k].getAttribute('data-w') === r.j.sicht[knoepfe[k].getAttribute('data-f')]));
          meld.textContent = 'Gespeichert.'; meld.className = 'st-meld';
        });
      });
    });
  }

  function bildAnsicht(el, menue) {
    var box = el.querySelector('#dlg-bild'), dlg = el;
    menue.hidden = true; box.hidden = false; dlg.classList.add('breit');
    var alt = avOk(konto.av);
    var st = { i: alt ? alt.i : null, f: alt ? alt.f : '#ffffff', b: alt ? alt.b : standardHintergrund(konto.name), z: alt ? alt.z : 1, r: alt ? alt.r : 0 };
    var swatches = function (id) { return SWATCH.map(function (c) { return '<button type="button" class="bi-fk" data-for="' + id + '" data-c="' + c + '" style="background:' + c + '" aria-label="Farbe ' + c + '"></button>'; }).join(''); };
    box.innerHTML =
      '<div class="bi-kopf"><div class="bi-vorschau" id="bi-vorschau"></div><div class="bi-regler">' +
      '<div class="bi-zeile"><label for="bi-f">Symbol</label><input type="color" id="bi-f"><span class="bi-fl">' + swatches('f') + '</span></div>' +
      '<div class="bi-zeile"><label for="bi-b">Hintergrund</label><input type="color" id="bi-b"><span class="bi-fl">' + swatches('b') + '</span></div>' +
      '<div class="bi-zeile"><label for="bi-z">Zoom</label><input type="range" id="bi-z" min="40" max="220" step="1"><output id="bi-zo"></output></div>' +
      '<div class="bi-zeile"><label for="bi-r">Drehung</label><input type="range" id="bi-r" min="-180" max="180" step="1"><output id="bi-ro"></output></div>' +
      '</div></div>' +
      '<input type="search" id="bi-suche" placeholder="Symbol suchen, zum Beispiel Drache oder dragon" autocomplete="off" spellcheck="false" aria-label="Symbol suchen">' +
      '<div class="bi-raster" id="bi-raster" role="listbox" aria-label="Symbole"><div class="st-leer">Lädt …</div></div>' +
      '<div class="bi-zahl" id="bi-zahl"></div><div class="konto-fehler" id="bi-fehler" role="alert"></div>' +
      '<div class="bi-quelle">Symbole von <a href="credits.html" target="_blank" rel="noopener">game-icons.net</a> (CC BY 3.0)</div>' +
      '<div class="btn-row"><button class="btn btn-primary" type="button" id="bi-ok">Speichern</button><button class="btn btn-ghost" type="button" id="bi-weg">Buchstabe statt Bild</button><button class="btn btn-ghost" type="button" data-zurueck>Zurück</button></div>';
    var q = function (id) { return box.querySelector('#' + id); };
    var raster = q('bi-raster'), fehl = q('bi-fehler'), liste = [], gezeigt = 0, SCHRITT = 96;
    q('bi-f').value = st.f; q('bi-b').value = st.b; q('bi-z').value = Math.round(st.z * 100); q('bi-r').value = Math.round(st.r);
    function vorschau() {
      q('bi-zo').textContent = Math.round(st.z * 100) + ' %'; q('bi-ro').textContent = Math.round(st.r) + '°';
      var a = st.i ? avOk({ i: st.i, f: st.f, b: st.b, z: st.z, r: st.r }) : null;
      q('bi-vorschau').innerHTML = a ? '<span class="avatar vorschau av-bild">' + avInnen(a) + '</span>'
        : '<span class="avatar vorschau" style="background:' + esc(st.b) + ';color:' + esc(st.f) + '">' + esc(anzeigeName().charAt(0).toUpperCase()) + '</span>';
      raster.style.setProperty('--f', st.f); raster.style.setProperty('--b', st.b);
    }
    function mehr() {
      var h = '';
      for (var k = gezeigt; k < Math.min(liste.length, gezeigt + SCHRITT); k++) {
        var id = liste[k], n = id.split('/')[1].replace(/-/g, ' '), u = 'url(icons/' + id + '.svg)';
        h += '<button type="button" class="bi-sym' + (id === st.i ? ' gewaehlt' : '') + '" role="option" aria-selected="' + (id === st.i) + '" data-i="' + id + '" title="' + esc(n) + '" aria-label="' + esc(n) + '"><i style="-webkit-mask-image:' + u + ';mask-image:' + u + '"></i></button>';
      }
      gezeigt = Math.min(liste.length, gezeigt + SCHRITT);
      raster.insertAdjacentHTML('beforeend', h);
      q('bi-zahl').textContent = liste.length ? liste.length + (liste.length === 1 ? ' Symbol' : ' Symbole') : 'Nichts gefunden. Versuch es mit einem englischen Wort.';
    }
    function neuListe() { raster.innerHTML = ''; gezeigt = 0; liste = symbolIndex ? symbolSuche(symbolIndex, q('bi-suche').value) : []; raster.scrollTop = 0; mehr(); }
    raster.addEventListener('scroll', function () { if (gezeigt < liste.length && raster.scrollTop + raster.clientHeight > raster.scrollHeight - 160) mehr(); });
    raster.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.bi-sym') : null;
      if (!b) return;
      st.i = b.getAttribute('data-i');
      [].forEach.call(raster.querySelectorAll('.bi-sym.gewaehlt'), function (x) { x.classList.remove('gewaehlt'); x.setAttribute('aria-selected', 'false'); });
      b.classList.add('gewaehlt'); b.setAttribute('aria-selected', 'true'); fehl.textContent = ''; vorschau();
    });
    var suchTimer = null;
    q('bi-suche').addEventListener('input', function () { clearTimeout(suchTimer); suchTimer = setTimeout(neuListe, 160); });
    q('bi-f').addEventListener('input', function (e) { st.f = e.target.value; vorschau(); });
    q('bi-b').addEventListener('input', function (e) { st.b = e.target.value; vorschau(); });
    q('bi-z').addEventListener('input', function (e) { st.z = Number(e.target.value) / 100; vorschau(); });
    q('bi-r').addEventListener('input', function (e) { st.r = Number(e.target.value); vorschau(); });
    box.addEventListener('click', function (e) {
      var fk = e.target.closest ? e.target.closest('.bi-fk') : null;
      if (!fk) return;
      var w = fk.getAttribute('data-for'), c = fk.getAttribute('data-c');
      st[w] = c; q('bi-' + w).value = c; vorschau();
    });
    function zurueck() { box.hidden = true; menue.hidden = false; dlg.classList.remove('breit'); }
    box.querySelector('[data-zurueck]').onclick = zurueck;
    function fertig(av) {
      speichereKonto({ name: konto.name, anzeige: konto.anzeige, token: konto.token, av: av });
      aktualisiereKnopf(); benachrichtige();
      var d = el.querySelector('#dlg-av'); if (d) d.outerHTML = avatarHtml('avatar gross', konto.name, anzeigeName(), konto.av, '', 'dlg-av');
      zurueck();
    }
    function senden(av, btn) {
      btn.disabled = true; fehl.textContent = '';
      api('POST', '/api/avatar', { av: av }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { fehl.textContent = res.j && res.j.fehler === 'symbol' ? 'Dieses Symbol gibt es nicht mehr.' : fehlerText(res); return; }
        fertig(res.j.av || null);
      });
    }
    q('bi-ok').onclick = function () {
      if (!st.i) { fehl.textContent = 'Wähle zuerst ein Symbol aus.'; return; }
      senden({ i: st.i, f: st.f, b: st.b, z: Math.round(st.z * 100) / 100, r: Math.round(st.r) }, this);
    };
    q('bi-weg').onclick = function () { senden(null, this); };
    vorschau();
    if (symbolIndex) neuListe();
    else fetch('icons/index.json').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (j) { symbolIndex = j; neuListe(); }, function () { raster.innerHTML = '<div class="st-leer">Die Symbole konnten nicht geladen werden.</div>'; });
  }

  // Symbole der Kontomenü-Zeilen (Linien-Stil)
  var MENUE_ICONS = {
    profil: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"/>',
    bild: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
    anz: '<path d="M5 19l1-4 9.5-9.5a2.1 2.1 0 013 3L9 18z"/><path d="M14 7l3 3"/>',
    bn: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.3a2.4 2.4 0 004.8 0V12a8.3 8.3 0 10-3.3 6.6"/>',
    pw: '<circle cx="8" cy="15" r="3.6"/><path d="M10.6 12.4L19 4M16 7l2.5 2.5"/>',
    sicht: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    stand: '<rect x="3.5" y="4.5" width="17" height="5" rx="1.5"/><path d="M5 9.5V18a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 18V9.5M10 13.5h4"/>',
    aus: '<path d="M10 4.5H7A2.5 2.5 0 004.5 7v10A2.5 2.5 0 007 19.5h3M14 8l4 4-4 4M18 12H9.5"/>',
    weg: '<path d="M5 7h14M10 7V5h4v2M7 7l.8 11.2a1.8 1.8 0 001.8 1.6h4.8a1.8 1.8 0 001.8-1.6L17 7M10.5 11v5M13.5 11v5"/>'
  };
  function menueZeile(a, text, hinweis, gefahr) {
    var svg = function (pfad, kl) { return '<svg class="' + kl + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + pfad + '</svg>'; };
    return '<button type="button" class="dlg-zeile' + (gefahr ? ' gefahr' : '') + '" data-a="' + a + '">' + svg(MENUE_ICONS[a], 'ico') +
      '<span class="dlg-ztext"><b>' + text + '</b>' + (hinweis ? '<small>' + hinweis + '</small>' : '') + '</span>' + svg('<path d="M9.5 6.5L15 12l-5.5 5.5"/>', 'pfeil') + '</button>';
  }
  function kontoDialog(start) {
    if (!konto) return;
    dialog(
      '<div class="dlg-kopf">' + avatarHtml('avatar gross', konto.name, anzeigeName(), konto.av, '', 'dlg-av') +
      '<div class="dlg-kopftext"><div class="dlg-titel" id="dlg-titel">' + esc(anzeigeName()) + '</div><div class="dlg-sub">@' + esc(konto.name) + '</div></div>' +
      '<button type="button" class="dlg-x" data-zu aria-label="Schließen"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dlg-teil" id="dlg-menue">' +
      '<div class="dlg-ueber">Profil</div><div class="dlg-gruppe">' +
      menueZeile('profil', 'Mein Profil') + menueZeile('bild', 'Profilbild ändern') + menueZeile('anz', 'Anzeigename ändern') + menueZeile('sicht', 'Sichtbarkeit', 'Wer Online-Status und Spiele sieht') +
      '</div><div class="dlg-ueber">Konto</div><div class="dlg-gruppe">' +
      menueZeile('bn', 'Benutzernamen ändern') + menueZeile('pw', 'Passwort ändern') + menueZeile('stand', 'Spielstände', 'Sichern und zurückholen') +
      '</div><div class="dlg-gruppe dlg-ende">' +
      menueZeile('aus', 'Abmelden', 'Nur auf diesem Gerät') + menueZeile('weg', 'Konto löschen', '', true) +
      '</div></div><form class="dlg-teil" id="dlg-form" hidden novalidate></form><div class="dlg-teil" id="dlg-stand" hidden></div><div class="dlg-teil" id="dlg-bild" hidden></div><div class="dlg-teil" id="dlg-sicht" hidden></div>',
      function (el, zu) {
        var menue = el.querySelector('#dlg-menue'), form = el.querySelector('#dlg-form');
        function formular(html, los) {
          menue.hidden = true; form.hidden = false;
          form.innerHTML = html + '<div class="konto-fehler" role="alert"></div><div class="btn-row"><button class="btn btn-primary" type="submit">OK</button><button class="btn btn-ghost" type="button" data-zurueck>Zurück</button></div>';
          form.querySelector('[data-zurueck]').onclick = function () { form.hidden = true; menue.hidden = false; };
          var fe = form.querySelector('.konto-fehler'), ok = form.querySelector('[type=submit]');
          form.onsubmit = function (e) { e.preventDefault(); fe.textContent = ''; ok.disabled = true; los(fe, function () { ok.disabled = false; }); };
        }
        menue.addEventListener('click', function (e) {
          var za = e.target.closest ? e.target.closest('[data-a]') : null, a = za && za.getAttribute('data-a');
          if (a === 'aus') { zu(); abmelden(); }
          if (a === 'profil') { zu(); location.hash = '#profil'; }
          if (a === 'stand') standAnsicht(el, menue);
          if (a === 'bild') bildAnsicht(el, menue);
          if (a === 'sicht') sichtAnsicht(el, menue);
          if (a === 'anz') formular(
            '<label>Anzeigename<input id="anz0" type="text" maxlength="24" autocomplete="nickname" spellcheck="false" value="' + esc(konto.anzeige && konto.anzeige !== konto.name ? konto.anzeige : '') + '" placeholder="' + esc(konto.name) + '"></label>' +
            '<div class="konto-regel">So sehen dich andere (Freunde, Freundesleiste). Dein Benutzername @' + esc(konto.name) + ' bleibt gleich. Leer lassen = Benutzername.</div>',
            function (fe, fertig) {
              var neu = bereinige(form.querySelector('#anz0').value);
              if (neu && !anzeigeOk(neu)) { fe.textContent = FEHLER.anzeige; return fertig(); }
              api('POST', '/api/anzeige', { anzeige: neu || null }).then(function (res) {
                if (!res.ok) { fe.textContent = fehlerText(res); return fertig(); }
                speichereKonto({ name: konto.name, anzeige: res.j.anzeige || konto.name, token: konto.token });
                aktualisiereKnopf(); benachrichtige();
                var t = el.querySelector('#dlg-titel'), av = el.querySelector('#dlg-av');
                if (t) t.textContent = anzeigeName(); if (av && !avOk(konto.av)) av.textContent = anzeigeName().charAt(0).toUpperCase();
                form.innerHTML = '<p>Gespeichert. Andere sehen dich jetzt als <b>' + esc(anzeigeName()) + '</b>.</p><div class="btn-row"><button class="btn btn-primary" data-zu type="button">Fertig</button></div>';
              });
            });
          if (a === 'bn') formular(
            '<label>Neuer Benutzername<input id="bn0" type="text" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="' + esc(konto.name) + '"></label>' +
            '<label>Zur Bestätigung dein Passwort<input id="bn1" type="password" autocomplete="current-password"></label>' +
            '<div class="konto-regel">Dein Benutzername ist der Name nach dem @ und gilt für die Anmeldung und für Freundschaftsanfragen. Du kannst ihn nur einmal pro Woche ändern, und nur auf einen Namen, der noch frei ist. Freunde, Spielstände und Anmeldungen bleiben erhalten. Der alte Name wird danach frei für andere.</div>',
            function (fe, fertig) {
              var nn = form.querySelector('#bn0').value.trim().replace(/^@/, '').normalize('NFC'), pw = form.querySelector('#bn1').value;
              if (!NAME_RE.test(nn)) { fe.textContent = FEHLER.name; return fertig(); }
              if (nn === konto.name) { fe.textContent = FEHLER.name_gleich; return fertig(); }
              if (!pw) { fe.textContent = FEHLER.eingabe; return fertig(); }
              Promise.all([schluessel(konto.name, pw), schluessel(nn, pw)]).then(function (k) {
                return api('POST', '/api/benutzername', { name: nn, key: k[0], neu: k[1] });
              }).then(function (res) {
                if (!res.ok) { fe.textContent = fehlerText(res); return fertig(); }
                speichereKonto({ name: res.j.name, anzeige: res.j.anzeige || res.j.name, token: konto.token });
                aktualisiereKnopf(); benachrichtige();
                var sub = el.querySelector('.dlg-sub'), t = el.querySelector('#dlg-titel'), av = el.querySelector('#dlg-av');
                if (sub) sub.textContent = '@' + konto.name + ' · Angemeldet auf diesem Gerät';
                if (t) t.textContent = anzeigeName(); if (av && !avOk(konto.av)) av.textContent = anzeigeName().charAt(0).toUpperCase();
                form.innerHTML = '<p>Dein Benutzername ist jetzt <b>@' + esc(konto.name) + '</b>. Zum Anmelden brauchst du ab jetzt diesen Namen.</p><div class="btn-row"><button class="btn btn-primary" data-zu type="button">Fertig</button></div>';
              }, function () { fe.textContent = 'Das ist hier nicht möglich (Browser ohne Verschlüsselung).'; fertig(); });
            });
          if (a === 'pw') formular(
            '<label>Altes Passwort<input id="pw0" type="password" autocomplete="current-password"></label>' +
            '<label>Neues Passwort<input id="pw1" type="password" autocomplete="new-password"></label>' +
            '<label>Neues Passwort wiederholen<input id="pw2" type="password" autocomplete="new-password"></label>',
            function (fe, fertig) {
              var p0 = form.querySelector('#pw0').value, p1 = form.querySelector('#pw1').value, p2 = form.querySelector('#pw2').value;
              if (!p0 || p1.length < 6) { fe.textContent = 'Das neue Passwort braucht mindestens 6 Zeichen.'; return fertig(); }
              if (p1 !== p2) { fe.textContent = 'Die beiden neuen Passwörter sind nicht gleich.'; return fertig(); }
              Promise.all([schluessel(konto.name, p0), schluessel(konto.name, p1)]).then(function (k) {
                return api('POST', '/api/passwort', { key: k[0], neu: k[1] });
              }).then(function (res) {
                if (!res.ok) { fe.textContent = fehlerText(res); return fertig(); }
                form.innerHTML = '<p>Das Passwort ist geändert. Auf anderen Geräten musst du dich neu anmelden.</p><div class="btn-row"><button class="btn btn-primary" data-zu type="button">Fertig</button></div>';
              });
            });
          if (a === 'weg') formular(
            '<p>Das löscht dein Konto, deine Freundschaften und alle mitgeschriebenen Spielstände auf dem Server. Der Spielstand auf diesem Gerät bleibt erhalten.</p>' +
            '<label>Zur Bestätigung dein Passwort<input id="pw0" type="password" autocomplete="current-password"></label>',
            function (fe, fertig) {
              var p0 = form.querySelector('#pw0').value;
              if (!p0) { fe.textContent = FEHLER.eingabe; return fertig(); }
              schluessel(konto.name, p0).then(function (k) { return api('POST', '/api/loeschen', { key: k }); }).then(function (res) {
                if (!res.ok) { fe.textContent = fehlerText(res); return fertig(); }
                zu(); lokalAbmelden();
              });
            });
        });
        if (start) { var sb = el.querySelector('[data-a="' + start + '"]'); if (sb) sb.click(); }
      });
  }

  function lokalAbmelden() {
    konto = null; lsDel(KEY); spielId = null; raum = null; offeneAnfragen = 0;
    aktualisiereKnopf(); benachrichtige();
    zeigeAnmeldung();
  }
  function abmelden() {
    var k = konto;
    if (!k) return;
    flush(true).then(function () {
      return api('POST', '/api/praesenz', { offline: true }).then(function () { return api('POST', '/api/abmelden', {}); });
    }).then(lokalAbmelden, lokalAbmelden);
  }

  /* ---------- Knopf oben rechts ---------- */
  function avatarStil(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'background:hsl(' + h + ',48%,36%);color:#fff';
  }
  /* Profilbild: Symbol aus icons/ (game-icons.net), Symbolfarbe f, Hintergrund b, Zoom z, Drehung r. Alles wird streng geprüft, bevor es in HTML landet. */
  function avOk(a) {
    if (!a || typeof a !== 'object') return null;
    if (typeof a.i !== 'string' || !/^[a-z0-9-]{1,40}\/[a-z0-9-]{1,80}$/.test(a.i)) return null;
    if (typeof a.f !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a.f) || typeof a.b !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a.b)) return null;
    var z = Number(a.z), r = Number(a.r);
    if (!isFinite(z) || z < 0.3 || z > 3 || !isFinite(r) || r < -360 || r > 360) return null;
    return { i: a.i, f: a.f, b: a.b, z: z, r: r };
  }
  function avGlyph(a) {
    var u = 'url(icons/' + a.i + '.svg)';
    return 'background:' + a.f + ';-webkit-mask-image:' + u + ';mask-image:' + u + ';transform:rotate(' + a.r + 'deg) scale(' + a.z + ')';
  }
  function avInnen(a) { return '<b class="avb" style="background:' + a.b + '"><i style="' + avGlyph(a) + '"></i></b>'; }
  // Fertiges Profilbild-Element: mit gewähltem Symbol, sonst der Buchstabe auf farbigem Kreis. extra = zusätzliches HTML (z. B. der grüne Online-Punkt)
  function avatarHtml(klasse, name, anzeige, av, extra, id) {
    var a = avOk(av), ida = id ? ' id="' + id + '"' : '';
    if (!a) return '<span class="' + klasse + '"' + ida + ' style="' + avatarStil(name) + '">' + esc(String(anzeige || name).charAt(0).toUpperCase()) + (extra || '') + '</span>';
    return '<span class="' + klasse + ' av-bild"' + ida + '>' + avInnen(a) + (extra || '') + '</span>';
  }
  function aktualisiereKnopf() {
    var b = document.getElementById('konto-knopf');
    if (!b) return;
    var kav = konto ? avOk(konto.av) : null;
    b.className = 'tbtn konto' + (kav ? ' av-bild' : '');
    if (konto && kav) { b.hidden = false; b.innerHTML = avInnen(kav); b.setAttribute('style', 'background:transparent'); b.setAttribute('aria-label', 'Konto von ' + anzeigeName() + ' (@' + konto.name + ')'); }
    else if (konto) { b.hidden = false; b.textContent = anzeigeName().charAt(0).toUpperCase(); b.setAttribute('style', avatarStil(konto.name)); b.setAttribute('aria-label', 'Konto von ' + anzeigeName() + ' (@' + konto.name + ')'); }
    else b.hidden = true;
  }

  /* ---------- Spielstände: still mitschreiben ---------- */
  var spur = {};              // id -> { daten, letzter, dirty, laufend, zuGross }
  var SPUR_TAKT = 60000;
  function stand(id, d) {
    if (!konto || !d || typeof d !== 'object') return;
    var daten; try { daten = JSON.stringify(d); } catch (e) { return; }
    var s = spur[id] || (spur[id] = {});
    s.daten = daten; s.dirty = s.letzter !== daten;
  }
  function hochladen(id, schnell) {
    var s = spur[id];
    if (!konto || !s || !s.dirty || s.laufend || s.zuGross) return Promise.resolve();
    var daten = s.daten;
    s.laufend = true;
    return api('PUT', '/api/stand/' + encodeURIComponent(id), { erzwingen: true, daten: daten, geraet: geraet() }, { keepalive: !!schnell && daten.length < 50000, timeout: 20000 }).then(function (res) {
      s.laufend = false;
      if (res.ok) { s.letzter = daten; if (s.daten === daten) s.dirty = false; }
      else if (res.status === 413) s.zuGross = true;   // zu groß für den Server: nicht weiter versuchen
    }, function () { s.laufend = false; });
  }
  function flush(schnell) {
    return Promise.all(Object.keys(spur).map(function (id) { return hochladen(id, schnell); }));
  }
  setInterval(function () { if (konto) flush(false); }, SPUR_TAKT);

  // Einmal pro Tag und Gerät: vorhandene Stände aller Spiele als Ausgangspunkt hinterlegen
  function grundstand() {
    if (!konto) return;
    var heute = new Date().toISOString().slice(0, 10), k = 'lgh.konto.basis.' + konto.name.toLowerCase();
    if (lsGet(k) === heute) return;
    var ids = [];
    try { for (var z = 0; z < localStorage.length; z++) { var n = localStorage.key(z); if (n && n.indexOf('lgh.stand.') === 0) ids.push(n.slice(10)); } } catch (e) { }
    var pos = 0;
    (function weiter() {
      if (!konto || pos >= ids.length) { if (konto) lsSet(k, heute); return; }
      var id = ids[pos++];
      try {
        var o = JSON.parse(lsGet('lgh.stand.' + id));
        if (o && o.d && /^[a-z0-9_-]{1,40}$/.test(id) && !(spur[id] && spur[id].dirty)) stand(id, o.d);
      } catch (e) { }
      hochladen(id, false).then(function () { setTimeout(weiter, 400); });
    })();
  }

  function beimVerlassen(id) { return hochladen(id, false); }

  /* ---------- Herzschlag: wer ist in welchem Spiel ---------- */
  var herzTimer = null;
  function sende(offline, schnell) {
    if (!konto) return Promise.resolve();
    var b = offline ? { offline: true } : { spiel: spielId, raum: spielId ? raum : null };
    return api('POST', '/api/praesenz', b, { keepalive: !!schnell, timeout: 8000 });
  }
  function herzschlag() {
    clearInterval(herzTimer);
    if (!konto || document.hidden) return;
    sende(false);
    herzTimer = setInterval(function () { if (!document.hidden) sende(false); }, 45000);
  }
  /* ---------- Einladungen: die Chat-Nachricht "[einladung:spiel]" oder "[einladung:spiel:RAUM]" zeigt der Hub als Karte ---------- */
  var EINL_RE = /^\[einladung:([a-z0-9_-]{1,40})(?::([A-Za-z0-9_-]{1,16}))?\]$/;
  function einladung(text) { var m = EINL_RE.exec(String(text || '').trim()); return m ? { spiel: m[1], raum: m[2] || null } : null; }
  var spielNamen = function (id) { return id; }, letzterRaum = null;
  function chatKurz(text) { var e = einladung(text); return e ? 'Einladung zu ' + spielNamen(e.spiel) : text; }   // für Vorschauen und die Karte im Spiel
  function raumFuer(id) { return letzterRaum && letzterRaum.spiel === id && Date.now() - letzterRaum.ts < 3600000 ? letzterRaum.raum : null; }
  function setzeSpiel(id) { var neu = id || null; if (neu !== spielId) { spielId = neu; raum = null; sende(false); } }
  function setzeRaum(r) {
    r = typeof r === 'string' ? r.slice(0, 40).replace(/[\u0000-\u001f<>]/g, '') : null;
    r = r || null;
    if (r && spielId && /^[A-Za-z0-9_-]{1,16}$/.test(r)) letzterRaum = { spiel: spielId, raum: r, ts: Date.now() };
    if (r !== raum) { raum = r; sende(false); }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { flush(true); clearInterval(herzTimer); sende(true, true); }
    else if (konto) { herzschlag(); pruefeFreunde(); }
  });
  window.addEventListener('pagehide', function () { flush(true); sende(true, true); });

  /* ---------- Freunde ---------- */
  function freundePost(pfad, name) { return api('POST', '/api/freunde/' + pfad, { name: name }); }
  var freunde = {
    liste: function () { return api('GET', '/api/freunde'); },
    anfrage: function (n) { return freundePost('anfrage', n); },
    annehmen: function (n) { return freundePost('annehmen', n); },
    ablehnen: function (n) { return freundePost('ablehnen', n); },
    entfernen: function (n) { return freundePost('entfernen', n); },
  };
  /* Chat unter Freunden: lesen (nach = nur Neueres, vor = Älteres, gelesen = als gelesen markieren), senden, eigene Nachricht löschen */
  // "#g12" meint die Gruppe 12 (Gruppenchat), alles andere einen Freund
  function chatPfad(n) { var g = /^#g(\d{1,9})$/.exec(n); return g ? '/api/gruppen/' + g[1] + '/chat' : '/api/chat/' + encodeURIComponent(n); }
  var gruppen = {
    liste: function () { return api('GET', '/api/gruppen'); },
    details: function (id) { return api('GET', '/api/gruppen/' + id); },
    anlegen: function (name, mitglieder) { return api('POST', '/api/gruppen', { name: name, mitglieder: mitglieder }); },
    mitglied: function (id, name) { return api('POST', '/api/gruppen/' + id + '/mitglied', { name: name }); },
    entfernen: function (id, name) { return api('POST', '/api/gruppen/' + id + '/entfernen', { name: name }); },
    umbenennen: function (id, name) { return api('POST', '/api/gruppen/' + id + '/umbenennen', { name: name }); },
    verlassen: function (id) { return api('POST', '/api/gruppen/' + id + '/verlassen', {}); },
    loeschen: function (id) { return api('POST', '/api/gruppen/' + id + '/loeschen', {}); },
  };
  var chat = {
    lesen: function (n, o) {
      o = o || []; var q = [];
      if (o.nach) q.push('nach=' + o.nach); if (o.vor) q.push('vor=' + o.vor); if (o.gelesen) q.push('gelesen=1');
      return api('GET', chatPfad(n) + (q.length ? '?' + q.join('&') : ''));
    },
    senden: function (n, text) { return api('POST', chatPfad(n), { text: text }); },
    loeschen: function (n, id) { return api('POST', chatPfad(n) + '/loeschen', { id: id }); },
  };
  function pruefeFreunde() {
    if (!konto) return;
    api('GET', '/api/freunde').then(function (res) {
      if (!res.ok) return;
      var n = (res.j.eingehend || []).length + (res.j.chat || 0);   // offene Anfragen plus ungelesene Nachrichten
      if (n !== offeneAnfragen) { offeneAnfragen = n; benachrichtige(); }
    });
  }
  setInterval(function () { if (konto && !document.hidden) pruefeFreunde(); }, 60000);
  function setzeOffene(n) { if (n !== offeneAnfragen) { offeneAnfragen = n; benachrichtige(); } }
  function benachrichtige() {
    var abz = document.querySelectorAll('.freunde-abz');
    [].forEach.call(abz, function (a) { a.hidden = !offeneAnfragen; a.textContent = offeneAnfragen > 9 ? '9+' : String(offeneAnfragen); });
    lauscher.forEach(function (f) { try { f(); } catch (e) { } });
  }

  /* ---------- Nachrichten im Spiel ----------
     Solange ein Spiel läuft (body[data-view=play]), fragt der Hub alle paar Sekunden ungelesene Chat-Nachrichten ab (/api/ungelesen).
     Kommt eine neue, erscheint oben rechts über dem Spiel (auch im Vollbild, denn die Karte liegt in der Bühne) eine kleine Karte mit
     "Antworten" direkt im Spiel. Nachrichten, die schon vor dem Spielstart ungelesen waren, lösen keine Karte aus (nur die Zahl am Freunde-Knopf). */
  var sc = { basis: null, bekannt: {}, letzte: 0, laeuft: false };
  function imSpiel() { return document.body.getAttribute('data-view') === 'play'; }
  function scBox() {
    var b = document.getElementById('sp-toasts');
    if (b) return b;
    var bue = document.getElementById('buehne');
    if (!bue) return null;
    b = document.createElement('div'); b.id = 'sp-toasts'; b.className = 'sp-toasts'; b.setAttribute('aria-live', 'polite');
    bue.appendChild(b); return b;
  }
  function scAufraeumen() { var b = document.getElementById('sp-toasts'); if (b) b.innerHTML = ''; sc.basis = null; sc.bekannt = {}; sc.laeuft = false; }
  function scSchliessen(k) {
    if (!k || !k.parentNode) return;
    clearTimeout(k._t); k.parentNode.removeChild(k);
    var r = document.getElementById('rahmen'); if (r && imSpiel() && !document.querySelector('#sp-toasts .sp-karte')) { try { r.focus(); } catch (e) { } }
  }
  function scTimer(k) {
    clearTimeout(k._t);
    k._t = setTimeout(function () { if (!k.matches(':hover') && !k.classList.contains('antwort') && !k.contains(document.activeElement)) scSchliessen(k); else scTimer(k); }, 10000);
  }
  function scKarte(v) {
    var box = scBox(); if (!box) return;
    var k = null, alle = box.querySelectorAll('.sp-karte');
    for (var i = 0; i < alle.length; i++) if (alle[i].getAttribute('data-n') === v.name) k = alle[i];
    if (!k) {
      k = document.createElement('div'); k.className = 'sp-karte'; k.setAttribute('data-n', v.name);
      k.innerHTML = '<div class="sp-kopf">' + avatarHtml('sp-av', v.name, v.anzeige, v.av) + '<b class="sp-name"></b><span class="sp-n" hidden></span>' +
        '<button type="button" class="sp-x" data-sp="zu" aria-label="Schließen">✕</button></div>' +
        '<div class="sp-text"></div>' +
        '<div class="sp-aktion"><button type="button" class="btn btn-primary" data-sp="antw">Antworten</button></div>' +
        '<form class="sp-form" hidden><input type="text" maxlength="500" autocomplete="off" placeholder="Antwort schreiben" aria-label="Antwort schreiben"><button type="submit" class="btn btn-primary">Senden</button></form>' +
        '<div class="sp-meld" role="status"></div>';
      box.appendChild(k);
      while (box.querySelectorAll('.sp-karte').length > 3) scSchliessen(box.querySelector('.sp-karte'));
    }
    k.querySelector('.sp-name').textContent = v.anzeige || v.name;
    var n = k.querySelector('.sp-n'); n.hidden = !(v.n > 1); n.textContent = v.n > 1 ? v.n + ' neue' : '';
    k.querySelector('.sp-text').textContent = chatKurz(v.text);
    scTimer(k);
  }
  function scVerarbeiten(liste) {
    if (sc.basis === null) {   // erste Antwort nach dem Spielstart: nur merken, nichts anzeigen
      sc.basis = true; liste.forEach(function (v) { sc.bekannt[v.name] = v.neu; }); return;
    }
    var box = document.getElementById('sp-toasts');
    liste.forEach(function (v) {
      if (v.neu > (sc.bekannt[v.name] || 0)) { sc.bekannt[v.name] = v.neu; scKarte(v); }
    });
    // Karten von Freunden, deren Chat inzwischen anderswo gelesen wurde, verschwinden (außer man tippt gerade)
    if (box) [].forEach.call(box.querySelectorAll('.sp-karte'), function (k) {
      var n = k.getAttribute('data-n');
      if (!liste.some(function (v) { return v.name === n; }) && !k.classList.contains('antwort') && !k.classList.contains('fertig')) scSchliessen(k);
    });
  }
  function scTick() {
    if (!konto || document.hidden) return;
    if (!imSpiel()) { if (sc.basis !== null || document.getElementById('sp-toasts')) scAufraeumen(); return; }
    var jetzt = Date.now();
    if (sc.laeuft || (sc.basis !== null && jetzt - sc.letzte < 8000)) return;
    sc.laeuft = true; sc.letzte = jetzt;
    api('GET', '/api/ungelesen').then(function (res) {
      sc.laeuft = false;
      if (res.ok && imSpiel() && res.j.von) scVerarbeiten(res.j.von);
    });
  }
  setInterval(scTick, 2000);
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#sp-toasts [data-sp]') : null; if (!b) return;
    var k = b.closest('.sp-karte'), was = b.getAttribute('data-sp');
    if (was === 'zu') scSchliessen(k);
    else if (was === 'antw') {
      k.classList.add('antwort'); k.querySelector('.sp-form').hidden = false; k.querySelector('.sp-aktion').hidden = true;
      var inp = k.querySelector('.sp-form input'); try { inp.focus(); } catch (x) { }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var k = e.target.closest ? e.target.closest('#sp-toasts .sp-karte') : null; if (k) { e.stopPropagation(); scSchliessen(k); }
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target.closest ? e.target.closest('#sp-toasts .sp-form') : null; if (!f) return;
    e.preventDefault();
    var k = f.closest('.sp-karte'), inp = f.querySelector('input'), text = inp.value.trim(), meld = k.querySelector('.sp-meld');
    if (!text) return;
    inp.disabled = true; f.querySelector('button').disabled = true; meld.textContent = '';
    chat.senden(k.getAttribute('data-n'), text).then(function (res) {
      if (res.ok) {
        f.hidden = true; k.classList.remove('antwort'); k.classList.add('fertig');
        meld.textContent = 'Gesendet'; meld.className = 'sp-meld ok';
        pruefeFreunde();
        k._t = setTimeout(function () { scSchliessen(k); }, 1300);
      } else {
        inp.disabled = false; f.querySelector('button').disabled = false;
        meld.className = 'sp-meld fehler';
        meld.textContent = res.status === 429 ? 'Bitte kurz warten.' : res.status === 404 ? 'Diese Person ist kein Freund mehr.' : 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
        try { inp.focus(); } catch (x) { }
      }
    });
  });

  /* ---------- Start ---------- */
  function start() {
    konto = ladeKonto();
    var kb = document.getElementById('konto-knopf');
    if (kb) kb.addEventListener('click', kontoDialog);
    aktualisiereKnopf();
    if (!konto) { zeigeAnmeldung(); return; }
    api('GET', '/api/ich').then(function (res) {
      // Nur bei eindeutiger Ablehnung abmelden; ohne Netz bleibt man angemeldet
      if (res.ok) {
        // Anzeigename kann auf einem anderen Gerät geändert worden sein
        if (res.j.name && (res.j.name !== konto.name || (res.j.anzeige && res.j.anzeige !== konto.anzeige) || JSON.stringify(res.j.av || null) !== JSON.stringify(konto.av || null))) { speichereKonto({ name: res.j.name, anzeige: res.j.anzeige || res.j.name, token: konto.token, av: res.j.av || null }); aktualisiereKnopf(); }
        nachAnmeldung();
      }
      else if (res.status === 0) { meldeAn(); }
    });
  }

  window.LghKonto = {
    bereit: bereit, name: function () { return konto ? konto.name : null; }, anzeige: anzeigeName, angemeldet: function () { return !!konto; },
    stand: stand, beimVerlassen: beimVerlassen, spiel: setzeSpiel, raum: setzeRaum,
    einladung: einladung, chatKurz: chatKurz, raumFuer: raumFuer, spielNamen: function (f) { spielNamen = f; },
    freunde: freunde, chat: chat, gruppen: gruppen, setzeOffene: setzeOffene, avatarStil: avatarStil, avatar: avatarHtml, dialog: dialog,
    bewertungen: function () { return api('GET', '/api/bewertungen'); },
    bewertung: { laden: function (id) { return api('GET', '/api/bewertung/' + encodeURIComponent(id)); }, setzen: function (id, sterne) { return api('POST', '/api/bewertung/' + encodeURIComponent(id), { sterne: sterne }); } },
    favoriten: { laden: function () { return api('GET', '/api/favoriten'); }, setzen: function (id, an) { return api('POST', '/api/favoriten', { spiel: id, an: !!an }); } },
    kontoDialog: kontoDialog, entwickler: function () { return api('GET', '/api/entwickler'); }, profil: function (name) { return api('GET', '/api/profil' + (name ? '/' + encodeURIComponent(name) : '')); }, abmelden: abmelden, abzeichen: benachrichtige, beiAenderung: function (f) { lauscher.push(f); },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
