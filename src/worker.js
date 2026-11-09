// Einstiegspunkt des Workers. Die Logik liegt in konten.js (der Einstiegspunkt darf außer dem Handler nichts exportieren).
import { handle } from './konten.js';
import { altAdresseWeiterleiten } from './umzug.js';
import { sichern } from './sicherung.js';

export default {
  fetch: (request, env) => altAdresseWeiterleiten(request) || handle(request, env),
  // Nächtliche Sicherung in die zweite Datenbank (Cron in wrangler.jsonc); Fehler werden im Log sichtbar, stören aber nichts
  scheduled: (event, env, ctx) => { ctx.waitUntil(sichern(env).then((r) => console.log('Sicherung', JSON.stringify(r)), (e) => console.error('Sicherung fehlgeschlagen', e && e.message))); },
};
