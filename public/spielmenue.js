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
    if (window.LghSpielMenue && window.LghSpielMenue.beimOeffnen) window.LghSpielMenue.beimOeffnen();
  }
  function schliessen(fokus) {
    if (!offen) return;
    offen = false;
    hinter.hidden = true; buehne.classList.remove('menue-auf'); knopf.setAttribute('aria-expanded', 'false');
    $('uebersetzen-notiz').hidden = true; $('menue-uebersetzen').setAttribute('aria-expanded', 'false');
    if (window.LghSpielMenue && window.LghSpielMenue.beimSchliessen) window.LghSpielMenue.beimSchliessen();
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

  window.LghSpielMenue = {
    ton: function (fenster, origin) { tonSenden(fenster, origin); if (offen) tonAnzeigen(); },
    oeffnen: oeffnen, schliessen: schliessen, ansicht: ansicht, istOffen: function () { return offen; },
    punkt: function (an) { $('menue-punkt').hidden = !an; },
  };
})();
