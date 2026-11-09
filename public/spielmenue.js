/* Spielmenü: Im Spiel gibt es keine feste Leiste mehr. Oben links schwebt das LGH-Symbol (#menue-knopf), ein Klick öffnet das Menü
   (Weiterspielen, Chat, Lautstärke, Vollbild, Neu laden, Spielstände, Wiki, Übersetzen, Spiel verlassen).
   Das Menü liegt in der Bühne (#buehne), damit es auch im Vollbild sichtbar ist.
   Neu laden, Vollbild und Spiel verlassen sind die Knöpfe #neuladen, #vollbild und #zurueck; ihre Wirkung steht in app.js.
   Die Lautstärke kann der Hub nur ändern, wenn das Spiel mitmacht: Spiele mit tools/lgh-vorlade.js melden {lgh:'ton-bereit'},
   der Hub antwortet mit {lgh:'ton', v:0..1, stumm:bool} (siehe README, "Spielmenü"). */
(function () {
  'use strict';
  var KEY = 'lgh.ton';
  var buehne = document.getElementById('buehne'), knopf = document.getElementById('menue-knopf'), hinter = document.getElementById('menue-hinter');
  if (!buehne || !knopf || !hinter) return;
  var $ = function (id) { return document.getElementById(id); };
  var regler = $('ton-regler'), zahl = $('ton-zahl'), stumm = $('ton-stumm'), tonBox = $('menue-ton'), tonNotiz = $('ton-notiz');
  var offen = false;

  function imSpiel() { return document.body.getAttribute('data-view') === 'play'; }
  function spiel() { return window.LghSpiel ? window.LghSpiel.aktuell() : null; }
  function rahmen() { return window.LghSpiel ? window.LghSpiel.rahmen() : null; }

  /* ---------- Lautstärke ---------- */
  var ton = { v: 1, stumm: false };
  try { var gespeichert = JSON.parse(localStorage.getItem(KEY) || 'null'); if (gespeichert && typeof gespeichert.v === 'number') ton = { v: Math.min(1, Math.max(0, gespeichert.v)), stumm: !!gespeichert.stumm }; } catch (e) { }
  function tonSpeichern() { try { localStorage.setItem(KEY, JSON.stringify(ton)); } catch (e) { } }
  function tonAnzeigen() {
    var r = rahmen(), kann = !!(r && r._ton);
    regler.value = String(Math.round(ton.v * 100));
    zahl.textContent = ton.stumm ? 'Aus' : Math.round(ton.v * 100) + ' %';
    stumm.setAttribute('aria-pressed', ton.stumm ? 'true' : 'false');
    stumm.setAttribute('aria-label', ton.stumm ? 'Ton an' : 'Ton aus');
    stumm.querySelector('use').setAttribute('href', ton.stumm || ton.v === 0 ? '#i-mute' : '#i-volume');
    tonBox.classList.toggle('aus', !kann);
    regler.disabled = !kann; stumm.disabled = !kann;
    tonNotiz.hidden = kann;
  }
  // Schickt die Einstellung an ein Spielfenster (nur an die Adresse des Spiels)
  function tonSenden(fenster, origin) {
    try { fenster.postMessage({ lgh: 'ton', v: ton.v, stumm: ton.stumm }, origin); } catch (e) { }
  }
  function tonAnSpiel() {
    var r = rahmen(), sp = spiel();
    if (!r || !sp || !r._ton || !r.contentWindow) return;
    try { tonSenden(r.contentWindow, new URL(sp.url).origin); } catch (e) { }
  }
  regler.addEventListener('input', function () { ton.v = Math.min(1, Math.max(0, Number(regler.value) / 100)); if (ton.v > 0) ton.stumm = false; tonSpeichern(); tonAnzeigen(); tonAnSpiel(); });
  stumm.addEventListener('click', function () { ton.stumm = !ton.stumm; tonSpeichern(); tonAnzeigen(); tonAnSpiel(); });

  /* ---------- Menü öffnen und schließen ---------- */
  function istVoll() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function vollbildText() { var t = $('vollbild-text'); if (t) t.textContent = istVoll() ? 'Vollbild beenden' : 'Vollbild'; }
  function oeffnen() {
    if (offen || !imSpiel()) return;
    offen = true;
    var sp = spiel();
    var wiki = $('menue-wiki'); wiki.hidden = !(sp && sp.wiki); if (sp && sp.wiki) wiki.href = sp.wiki;
    $('menue-tab').href = sp ? sp.url : '#';
    ansicht('haupt');
    tonAnzeigen(); vollbildText();
    hinter.hidden = false; buehne.classList.add('menue-auf'); knopf.setAttribute('aria-expanded', 'true');
    var w = $('menue-weiter'); try { w.focus({ preventScroll: true }); } catch (e) { }
  }
  function schliessen(fokus) {
    if (!offen) return;
    offen = false;
    hinter.hidden = true; buehne.classList.remove('menue-auf'); knopf.setAttribute('aria-expanded', 'false');
    $('uebersetzen-notiz').hidden = true; $('menue-uebersetzen').setAttribute('aria-expanded', 'false');
    chatZu();
    // Tasten gehen wieder ans Spiel
    if (fokus !== false) { var r = rahmen(); if (r) { try { r.focus(); } catch (e) { } } }
  }
  function ansicht(name) {
    $('menue-haupt').hidden = name !== 'haupt';
    $('menue-chatansicht').hidden = name !== 'chat';
  }
  knopf.addEventListener('click', function () { if (offen) schliessen(); else oeffnen(); });
  $('menue-zu').addEventListener('click', function () { schliessen(); });
  $('menue-weiter').addEventListener('click', function () { schliessen(); });
  hinter.addEventListener('click', function (e) { if (e.target === hinter) schliessen(); });
  // Neu laden, Vollbild und Spiel verlassen erledigt app.js; das Menü geht danach zu (Vollbild: erst nach dem Klick, damit der Browser es erlaubt)
  ['neuladen', 'vollbild', 'zurueck'].forEach(function (id) { $(id).addEventListener('click', function () { schliessen(id === 'vollbild' ? false : undefined); }); });
  document.addEventListener('fullscreenchange', vollbildText);
  document.addEventListener('webkitfullscreenchange', vollbildText);

  // Spielstände: der Dialog liegt außerhalb der Bühne und wäre im Vollbild unsichtbar, also zuerst das Vollbild beenden
  $('menue-staende').addEventListener('click', function () {
    var los = function () { schliessen(false); if (window.LghKonto && LghKonto.kontoDialog) LghKonto.kontoDialog('stand'); };
    if (istVoll()) { var ex = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (ex && ex.then) ex.then(los, los); else setTimeout(los, 150); } else los();
  });
  $('menue-uebersetzen').addEventListener('click', function () {
    var n = $('uebersetzen-notiz'); n.hidden = !n.hidden; this.setAttribute('aria-expanded', n.hidden ? 'false' : 'true');
  });
  $('menue-wiki').addEventListener('click', function () { schliessen(false); });
  $('menue-tab').addEventListener('click', function () { schliessen(false); });

  // Esc schließt das Menü; ist es zu und der Fokus liegt im Hub (nicht im Spiel), öffnet Esc es
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !imSpiel()) return;
    if (document.querySelector('.dlg-hinter')) return;
    if (offen) { e.preventDefault(); schliessen(); } else oeffnen();
  });
  // Verlässt man das Spiel (oder wechselt es), geht das Menü zu
  new MutationObserver(function () { if (!imSpiel()) schliessen(false); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  /* ---------- Chat im Menü ----------
     Eine kleine Fassung des Chats (Freunde und Gruppen): Liste der Chats, darin die Nachrichten und ein Eingabefeld.
     Der ganze Chat mit Einladungskarten usw. steht weiter unter "Freunde" im Hub. Neue Nachrichten zeigen einen Punkt am Symbol. */
  var K = function () { return window.LghKonto; };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var FEHLER = { zu_viele: 'Du schreibst sehr schnell. Warte einen Moment.', unbekannt: 'Ihr seid nicht (mehr) befreundet, die Nachricht ging nicht raus.', zu_lang: 'Die Nachricht ist zu lang (höchstens 500 Zeichen).', leer: 'Die Nachricht ist leer.', zeichen: 'Die Nachricht enthält unerlaubte Zeichen.', netz: 'Keine Verbindung zum Server.' };
  var ch = null, chListeTimer = null, chFadenTimer = null, ungelesenGesamt = 0;
  var cv = $('menue-chatansicht');
  function uhr(sek) { return new Date(sek * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
  function kopf(titel, zurueck, av) {
    return '<header class="menue-kopf">' + (zurueck ? '<button class="menue-x" data-c="zurueck" type="button" aria-label="Zurück"><svg aria-hidden="true"><use href="#i-back"/></svg></button>' : '') +
      (av || '') + '<div class="menue-titel"><b>' + esc(titel) + '</b></div>' +
      '<button class="menue-x" data-c="zu" type="button" aria-label="Menü schließen"><svg aria-hidden="true"><use href="#i-x"/></svg></button></header>';
  }
  function chatStopp() { clearTimeout(chListeTimer); clearTimeout(chFadenTimer); chListeTimer = chFadenTimer = null; ch = null; }
  function chatZu() { chatStopp(); cv.innerHTML = ''; }
  function chatOeffnen() { ansicht('chat'); chatListe(); }
  function chatListe() {
    chatStopp();
    cv.innerHTML = kopf('Chat', true) + '<div class="mc-liste" id="mc-liste"><div class="mc-leer">Lädt …</div></div>';
    var mein = cv;
    function lade() {
      if (cv !== mein || ch) return;
      K().freunde.liste().then(function (res) {
        if (ch || !offen || $('menue-chatansicht').hidden) return;
        var l = $('mc-liste'); if (!l) return;
        if (!res.ok) { l.innerHTML = '<div class="mc-leer">Die Chats konnten nicht geladen werden.</div>'; }
        else {
          var z = [];
          (res.j.gruppen || []).forEach(function (g) { z.push({ name: '#g' + g.id, anzeige: g.name, ungelesen: g.ungelesen || 0, vorschau: g.vorschau, gruppe: true, zeit: g.zeit || 0 }); });
          (res.j.freunde || []).forEach(function (f) { z.push({ name: f.name, anzeige: f.anzeige || f.name, av: f.av, ungelesen: f.ungelesen || 0, vorschau: f.vorschau, online: f.online || !!f.spiel, zeit: 0 }); });
          z.sort(function (a, b) { return (b.ungelesen ? 1 : 0) - (a.ungelesen ? 1 : 0) || (b.zeit - a.zeit) || a.anzeige.localeCompare(b.anzeige, 'de'); });
          if (!z.length) l.innerHTML = '<div class="mc-leer">Du hast noch keine Freunde. Auf der Seite „Freunde“ kannst du welche hinzufügen.</div>';
          else l.innerHTML = z.map(function (c) {
            var av = c.gruppe ? '<span class="mc-av mc-gruppe" aria-hidden="true"><svg><use href="#i-people"/></svg></span>' : K().avatar('mc-av', c.name, c.anzeige, c.av || null, c.online ? '<span class="mc-on"></span>' : '');
            return '<button type="button" class="mc-zeile" data-c="chat" data-n="' + esc(c.name) + '" data-a="' + esc(c.anzeige) + '">' + av +
              '<span class="mc-text"><b>' + esc(c.anzeige) + '</b>' + (c.vorschau ? '<small>' + esc(K().chatKurz(c.vorschau)) + '</small>' : '') + '</span>' +
              (c.ungelesen ? '<span class="mi-abz">' + (c.ungelesen > 9 ? '9+' : c.ungelesen) + '</span>' : '') + '</button>';
          }).join('');
        }
        chListeTimer = setTimeout(lade, 6000);
      });
    }
    lade();
  }
  function chatFaden(name, anzeige) {
    chatStopp();
    var c = ch = { name: name, anzeige: anzeige, msgs: [], letzte: 0, sendet: false, gruppe: /^#g\d+$/.test(name) };
    cv.innerHTML = kopf(anzeige, true) + '<div class="mc-faden" id="mc-faden" role="log" aria-live="polite" aria-label="Nachrichten mit ' + esc(anzeige) + '"><div class="mc-leer">Lädt …</div></div>' +
      '<div class="mc-meld" id="mc-meld" role="status"></div>' +
      '<form class="mc-form" id="mc-form"><input type="text" id="mc-text" maxlength="500" autocomplete="off" placeholder="Nachricht schreiben" aria-label="Nachricht schreiben"><button class="btn btn-primary" type="submit">Senden</button></form>';
    function zeichne(unten) {
      var f = $('mc-faden'); if (!f || ch !== c) return;
      var nah = f.scrollHeight - f.scrollTop - f.clientHeight < 80;
      if (!c.msgs.length) f.innerHTML = '<div class="mc-leer">Noch keine Nachrichten. Schreib die erste!</div>';
      else f.innerHTML = c.msgs.map(function (m, i) {
        var davor = c.msgs[i - 1], neuerAbs = c.gruppe && m.von !== 'ich' && (!davor || davor.von === 'ich' || davor.name !== m.name);
        return '<div class="mc-msg ' + (m.von === 'ich' ? 'ich' : 'er') + '">' + (neuerAbs ? '<span class="mc-abs">' + esc(m.anzeige || m.name || '') + '</span>' : '') +
          '<span class="mc-blase">' + esc(K().chatKurz(m.text)) + '</span><span class="mc-zeit">' + uhr(m.zeit) + '</span></div>';
      }).join('');
      if (unten || nah) f.scrollTop = f.scrollHeight;
    }
    function neue(liste, unten) {
      var ids = {}; c.msgs.forEach(function (m) { ids[m.id] = 1; });
      var dazu = liste.filter(function (m) { return !ids[m.id]; });
      c.msgs = c.msgs.concat(dazu).sort(function (a, b) { return a.id - b.id; });
      c.letzte = c.msgs.length ? c.msgs[c.msgs.length - 1].id : 0;
      if (dazu.length || unten) zeichne(unten);
    }
    function holen(erst) {
      if (ch !== c) return;
      K().chat.lesen(name, erst ? { gelesen: true } : { nach: c.letzte, gelesen: true }).then(function (res) {
        if (ch !== c) return;
        if (res.ok) neue(res.j.nachrichten || [], erst);
        else if (erst) { var f = $('mc-faden'); if (f) f.innerHTML = '<div class="mc-leer">' + esc(res.status === 404 ? FEHLER.unbekannt : 'Die Nachrichten konnten nicht geladen werden.') + '</div>'; }
        chFadenTimer = setTimeout(function () { holen(false); }, 3000);
      });
    }
    holen(true);
    var ti = $('mc-text'); try { ti.focus({ preventScroll: true }); } catch (e) { }
  }
  function chatSenden() {
    var c = ch, ti = $('mc-text'); if (!c || !ti || c.sendet) return;
    var text = ti.value.replace(/\s+$/, ''); if (!text.trim()) return;
    c.sendet = true; $('mc-meld').textContent = '';
    K().chat.senden(c.name, text).then(function (res) {
      c.sendet = false; if (ch !== c) return;
      if (res.ok) {
        ti.value = '';
        // gleich anzeigen; der nächste Abruf bringt nichts Doppeltes, weil die Nachrichten an ihrer Nummer erkannt werden
        var m = res.j.nachricht; if (m) { c.msgs.push(m); c.letzte = Math.max(c.letzte, m.id); var f = $('mc-faden'); if (f) { var neu = document.createElement('div'); neu.className = 'mc-msg ich'; neu.innerHTML = '<span class="mc-blase">' + esc(K().chatKurz(m.text)) + '</span><span class="mc-zeit">' + uhr(m.zeit) + '</span>'; if (f.querySelector('.mc-leer')) f.innerHTML = ''; f.appendChild(neu); f.scrollTop = f.scrollHeight; } }
      } else $('mc-meld').textContent = FEHLER[res.j && res.j.fehler] || 'Das hat nicht geklappt.';
      try { ti.focus(); } catch (e) { }
    });
  }
  cv.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-c]') : null; if (!b) return;
    var a = b.getAttribute('data-c');
    if (a === 'zu') schliessen();
    else if (a === 'zurueck') { if (ch) chatListe(); else { chatZu(); ansicht('haupt'); } }
    else if (a === 'chat') chatFaden(b.getAttribute('data-n'), b.getAttribute('data-a'));
  });
  cv.addEventListener('submit', function (e) { if (e.target && e.target.id === 'mc-form') { e.preventDefault(); chatSenden(); } });
  $('menue-chat').hidden = false;
  $('menue-chat').addEventListener('click', chatOeffnen);

  // Punkt am Symbol und Zahl am Chat-Eintrag: kommt aus der Abfrage in konto.js (alle paar Sekunden, solange ein Spiel läuft)
  function ungelesenSetzen(n) {
    ungelesenGesamt = n;
    var abz = $('menue-chat-abz'); abz.hidden = !n; abz.textContent = n > 9 ? '9+' : String(n);
    $('menue-punkt').hidden = !n;
    knopf.setAttribute('aria-label', n ? 'Menü, ' + n + ' neue Nachricht' + (n === 1 ? '' : 'en') : 'Menü');
  }

  window.LghSpielMenue = {
    ton: function (fenster, origin) { tonSenden(fenster, origin); if (offen) tonAnzeigen(); },
    oeffnen: oeffnen, schliessen: schliessen, ansicht: ansicht, istOffen: function () { return offen; },
    ungelesen: ungelesenSetzen,
    chatMit: function () { return offen && ch ? ch.name : null; },   // mit wem der Chat im Menü gerade offen ist (dann zeigt konto.js keine Karte dazu)
    beimSchliessen: chatZu,
  };
})();
