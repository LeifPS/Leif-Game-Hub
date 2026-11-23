import { hsApi } from './hsapi.js';
import { HDF_DOC } from '../public/handschrift/js/hdfdoc.js';
// tippschrift.de: Tippschrift (früher STools), die Handschrift-App (Text in eigene Handschrift umwandeln, installierbar, offline nutzbar).
// Sie läuft im selben Worker, ist aber nur über ihre eigenen Adressen erreichbar:
//  - tippschrift.de: die App aus public/handschrift/ (Startseite unter "/", alles Weitere unter /handschrift/...) plus /api/titel, /api/sync/, /hdf
//  - www.tippschrift.de, tippschrift.com/.info/.store (auch mit www): dauerhafte Weiterleitung auf tippschrift.de
//  - alte Adressen st.leifps.de und handschrift.leifps.de: liefern die App nur noch im Umzugsmodus (die alten Daten liegen im Browser
//    unter dieser Adresse – die App zeigt dort nur „Alles sichern“ und den Weg zu tippschrift.de); keine API mehr, /hdf leitet weiter
//  - auf allen anderen Adressen (hub.leifps.de, *.workers.dev ...) gibt es /handschrift/... nicht (404)
//  - die App hat kein Konto: alle Daten bleiben im Browser; einzige Ausnahmen (beide freiwillig): /api/titel und /api/sync/, siehe hsapi.js
export const TS_HOST = 'tippschrift.de';
export const TS_ALIAS = ['www.tippschrift.de', 'tippschrift.com', 'www.tippschrift.com', 'tippschrift.info', 'www.tippschrift.info', 'tippschrift.store', 'www.tippschrift.store'];
export const OLD_HOSTS = ['st.leifps.de', 'handschrift.leifps.de'];
export const HS_HOSTS = [TS_HOST, ...OLD_HOSTS];
const NICHT_GEFUNDEN = () => new Response('Nicht gefunden', { status: 404, headers: { 'x-robots-tag': 'noindex, nofollow, noarchive' } });

// Gibt null zurück, wenn die Anfrage nichts mit der App zu tun hat (dann geht es normal im Hub weiter).
export function handschriftWeiche(request, env) {
  const url = new URL(request.url);
  const pfad = url.pathname;
  const host = url.hostname.toLowerCase(), alt = OLD_HOSTS.includes(host);
  if (TS_ALIAS.includes(host)) return Promise.resolve(Response.redirect('https://' + TS_HOST + pfad + url.search, 301));
  if (!HS_HOSTS.includes(host)) return pfad === '/handschrift' || pfad.startsWith('/handschrift/') ? Promise.resolve(NICHT_GEFUNDEN()) : null;
  if (!env.ASSETS) return Promise.resolve(NICHT_GEFUNDEN());
  if (alt && /^\/(hdf|hdf\.txt|ki-hdf)\/?$/i.test(pfad)) return Promise.resolve(Response.redirect('https://' + TS_HOST + '/hdf', 301));   // alte KI-Links funktionieren weiter
  if (!alt && (pfad === '/api/titel' || pfad.startsWith('/api/sync/'))) return hsApi(request, env);   // nur diese beiden Schnittstellen, siehe hsapi.js
  if (request.method !== 'GET' && request.method !== 'HEAD') return Promise.resolve(new Response('Nicht erlaubt', { status: 405, headers: { allow: 'GET, HEAD' } }));
  if (pfad.startsWith('/api/') || pfad === '/api') return Promise.resolve(NICHT_GEFUNDEN());
  // Beschreibung des Textformats HDF als reiner Text, damit eine KI sie per Link lesen kann (gleiche Quelle wie in der App)
  if (/^\/(hdf|hdf\.txt|ki-hdf)\/?$/i.test(pfad)) return Promise.resolve(new Response(request.method === 'HEAD' ? null : HDF_DOC, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } }));
  let ziel = pfad;
  if (pfad === '/' || pfad === '/index.html') ziel = '/handschrift/';
  else if (!pfad.startsWith('/handschrift/')) ziel = '/handschrift' + pfad;
  return env.ASSETS.fetch(new Request(new URL(ziel, request.url), request)).then((r) => {
    const h = new Headers(r.headers);
    if (alt) h.set('x-robots-tag', 'noindex, nofollow, noarchive');   // alte Adressen nicht mehr in Suchmaschinen
    h.set('referrer-policy', 'no-referrer');
    h.set('x-content-type-options', 'nosniff');
    if (ziel.endsWith('/sw.js')) h.set('service-worker-allowed', '/');
    // Programmdateien immer beim Server nachfragen (ETag), die Offline-Fassung kommt vom Service Worker der App
    if (!/^\/handschrift\/(icons|data|vendor)\//.test(ziel)) h.set('cache-control', 'no-cache');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  });
}
