/* Konto, Freunde und stilles Mitschreiben der Spielstände im Hub.
   - Ohne Anmeldung ist der Hub gesperrt (Anmeldebildschirm), das Konto liegt auf dem Server (siehe src/konten.js).
   - Spielstände bleiben wie bisher lokal im Hub-Speicher (lgh.stand.<id>, siehe app.js). Zusätzlich schreibt dieses Modul
     sie still mit: nur hochladen, nie zurückladen, nichts anzeigen, Fehler werden verschluckt. So gibt es später Verlaufsdaten ab dem Tag,
     an dem es eingeschaltet wurde, ohne dass das Spielen davon abhängt.
   - Herzschlag: der Hub meldet alle 45 s, in welchem Spiel man gerade ist (nur für Freunde sichtbar). */
(function () {
  'use strict';

  var KEY = 'lgh.konto';
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

  // Zufällige Kennung dieses Geräts (Browser-Speicher). Ein Konto gilt vorerst nur auf dem Gerät, auf dem es erstellt wurde (siehe src/konten.js, EIN_GERAET).
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
    return FEHLER[res.j.fehler] || 'Das hat nicht geklappt (' + (res.j.fehler || res.status) + ').';
  }

  function speichereKonto(k) { konto = k; lsSet(KEY, JSON.stringify(k)); }
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
      '<div class="konto-tabs" role="tablist"><button type="button" class="aktiv" data-m="an" role="tab">Anmelden</button><button type="button" data-m="neu" role="tab">Konto erstellen</button></div>' +
      '<form id="konto-form" novalidate>' +
      '<label>Benutzername<input name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="20" placeholder="@benutzername" required></label>' +
      '<div class="konto-regel nur-neu">3 bis 20 Zeichen: Buchstaben, Zahlen, Punkt, Unterstrich, Bindestrich. Damit melden dich und deine Freunde an und finden dich. Er lässt sich später nicht ändern.</div>' +
      '<label class="nur-neu">Anzeigename<input name="anzeige" autocomplete="nickname" autocapitalize="words" spellcheck="false" maxlength="24" placeholder="Wie andere dich sehen (optional)"></label>' +
      '<div class="konto-regel nur-neu">So sehen dich andere. Du kannst ihn jederzeit ändern. Leer lassen = Benutzername.</div>' +
      '<label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<label class="nur-neu">Passwort wiederholen<input name="password2" type="password" autocomplete="new-password"></label>' +
      '<div class="konto-regel nur-neu">Mindestens 6 Zeichen. Merk es dir gut: Es gibt keine E-Mail zum Zurücksetzen.</div>' +
      '<div class="konto-regel nur-neu"><b>Wichtig:</b> Ein Konto gilt vorerst nur auf diesem Gerät. Anmelden auf mehreren Geräten kommt später, wenn die Spielstände zwischen Geräten abgeglichen werden.</div>' +
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
      los.disabled = true; los.textContent = 'Einen Moment …';
      schluessel(name, pw).then(function (key) {
        return api('POST', modus === 'neu' ? '/api/registrieren' : '/api/anmelden', { name: name, anzeige: anz || undefined, key: key, geraet: geraet(), gid: geraetId() || undefined }, { ohneToken: true });
      }).then(function (res) {
        if (!res.ok) { fehler.textContent = fehlerText(res); los.disabled = false; los.textContent = modus === 'neu' ? 'Konto erstellen' : 'Anmelden'; return; }
        speichereKonto({ name: res.j.name, anzeige: res.j.anzeige || res.j.name, token: res.j.token });
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

  function kontoDialog() {
    if (!konto) return;
    dialog(
      '<div class="dlg-kopf"><span class="avatar gross" id="dlg-av" style="' + avatarStil(konto.name) + '">' + esc(anzeigeName().charAt(0).toUpperCase()) + '</span>' +
      '<div><div class="dlg-titel" id="dlg-titel">' + esc(anzeigeName()) + '</div><div class="dlg-sub">@' + esc(konto.name) + ' · Angemeldet auf diesem Gerät</div></div></div>' +
      '<div class="dlg-teil" id="dlg-menue">' +
      '<button type="button" class="btn btn-ghost" data-a="anz">Anzeigename ändern</button>' +
      '<button type="button" class="btn btn-ghost" data-a="pw">Passwort ändern</button>' +
      '<button type="button" class="btn btn-ghost" data-a="aus">Abmelden</button>' +
      '<button type="button" class="btn btn-ghost gefahr" data-a="weg">Konto löschen</button>' +
      '</div><form class="dlg-teil" id="dlg-form" hidden novalidate></form>' +
      '<div class="dlg-fuss"><button type="button" class="btn btn-ghost" data-zu>Schließen</button></div>',
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
          var a = e.target.getAttribute && e.target.getAttribute('data-a');
          if (a === 'aus') { zu(); abmelden(); }
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
                if (t) t.textContent = anzeigeName(); if (av) av.textContent = anzeigeName().charAt(0).toUpperCase();
                form.innerHTML = '<p>Gespeichert. Andere sehen dich jetzt als <b>' + esc(anzeigeName()) + '</b>.</p><div class="btn-row"><button class="btn btn-primary" data-zu type="button">Fertig</button></div>';
              });
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
  function aktualisiereKnopf() {
    var b = document.getElementById('konto-knopf');
    if (!b) return;
    if (konto) { b.hidden = false; b.textContent = anzeigeName().charAt(0).toUpperCase(); b.setAttribute('style', avatarStil(konto.name)); b.setAttribute('aria-label', 'Konto von ' + anzeigeName() + ' (@' + konto.name + ')'); }
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
  function setzeSpiel(id) { var neu = id || null; if (neu !== spielId) { spielId = neu; raum = null; sende(false); } }
  function setzeRaum(r) {
    r = typeof r === 'string' ? r.slice(0, 40).replace(/[\u0000-\u001f<>]/g, '') : null;
    r = r || null;
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
  function pruefeFreunde() {
    if (!konto) return;
    api('GET', '/api/freunde').then(function (res) {
      if (!res.ok) return;
      var n = (res.j.eingehend || []).length;
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
        if (res.j.anzeige && res.j.anzeige !== konto.anzeige) speichereKonto({ name: konto.name, anzeige: res.j.anzeige, token: konto.token });
        nachAnmeldung();
      }
      else if (res.status === 0) { meldeAn(); }
    });
  }

  window.LghKonto = {
    bereit: bereit, name: function () { return konto ? konto.name : null; }, anzeige: anzeigeName, angemeldet: function () { return !!konto; },
    stand: stand, beimVerlassen: beimVerlassen, spiel: setzeSpiel, raum: setzeRaum,
    freunde: freunde, setzeOffene: setzeOffene, avatarStil: avatarStil, dialog: dialog,
    kontoDialog: kontoDialog, abmelden: abmelden, abzeichen: benachrichtige, beiAenderung: function (f) { lauscher.push(f); },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
