import { hsApi } from './hsapi.js';
import { HDF_DOC } from '../public/handschrift/js/hdfdoc.js';
// st.leifps.de (früher handschrift.leifps.de, bleibt weiter erreichbar): STools, die Handschrift-App (Text in eigene Handschrift umwandeln, installierbar, offline nutzbar).
// Sie läuft im selben Worker, ist aber nirgends verlinkt und nur über diese Adressen erreichbar:
//  - auf st.leifps.de und handschrift.leifps.de kommt die App aus public/handschrift/ (die Startseite unter "/", alles Weitere unter /handschrift/...)
//  - auf allen anderen Adressen (hub.leifps.de, dev.leifps.de, *.workers.dev ...) gibt es /handschrift/... nicht (404)
//  - die App hat kein Konto: alle Daten bleiben im Browser; einzige Ausnahmen (beide freiwillig): /api/titel (Titelvorschlag) und /api/sync/ (verschlüsselter Abgleich), siehe hsapi.js
export const HS_HOSTS = ['st.leifps.de', 'handschrift.leifps.de'];
const NICHT_GEFUNDEN = () => new Response('Nicht gefunden', { status: 404, headers: { 'x-robots-tag': 'noindex, nofollow, noarchive' } });

// Gibt null zurück, wenn die Anfrage nichts mit der App zu tun hat (dann geht es normal im Hub weiter).
export function handschriftWeiche(request, env) {
  const url = new URL(request.url);
  const pfad = url.pathname;
  const hier = HS_HOSTS.includes(url.hostname.toLowerCase());
  if (!hier) return pfad === '/handschrift' || pfad.startsWith('/handschrift/') ? Promise.resolve(NICHT_GEFUNDEN()) : null;
  if (!env.ASSETS) return Promise.resolve(NICHT_GEFUNDEN());
  if (pfad === '/api/titel' || pfad.startsWith('/api/sync/')) return hsApi(request, env);   // nur diese beiden Schnittstellen, siehe hsapi.js
  if (request.method !== 'GET' && request.method !== 'HEAD') return Promise.resolve(new Response('Nicht erlaubt', { status: 405, headers: { allow: 'GET, HEAD' } }));
  if (pfad.startsWith('/api/') || pfad === '/api') return Promise.resolve(NICHT_GEFUNDEN());
  // Beschreibung des Textformats HDF als reiner Text, damit eine KI sie per Link lesen kann (gleiche Quelle wie in der App)
  if (/^\/(hdf|hdf\.txt|ki-hdf)\/?$/i.test(pfad)) return Promise.resolve(new Response(request.method === 'HEAD' ? null : HDF_DOC, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } }));
  let ziel = pfad;
  if (pfad === '/' || pfad === '/index.html') ziel = '/handschrift/';
  else if (!pfad.startsWith('/handschrift/')) ziel = '/handschrift' + pfad;
  return env.ASSETS.fetch(new Request(new URL(ziel, request.url), request)).then((r) => {
    const h = new Headers(r.headers);
    h.set('x-robots-tag', 'noindex, nofollow, noarchive');
    h.set('referrer-policy', 'no-referrer');
    h.set('x-content-type-options', 'nosniff');
    if (ziel.endsWith('/sw.js')) h.set('service-worker-allowed', '/');
    // Programmdateien immer beim Server nachfragen (ETag), die Offline-Fassung kommt vom Service Worker der App
    if (!/^\/handschrift\/(icons|data|vendor)\//.test(ziel)) h.set('cache-control', 'no-cache');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  });
}
