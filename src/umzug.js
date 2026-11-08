// Die alte Adresse (lgh.leifps.workers.dev) wird abgeschaltet: ab WEITERLEITUNG_AB geht jeder Seitenaufruf automatisch zu hub.leifps.de.
// Ausgenommen bleiben die API (offene Tabs und Spiele sprechen sie noch an) und umzug.html (damit die einmalige Übernahme der
// Spielstände beim Anmelden auf der neuen Adresse weiter funktioniert).
export const ALT_HOST = 'lgh.leifps.workers.dev';
export const NEU_URL = 'https://hub.leifps.de';
export const WEITERLEITUNG_AB = Date.parse('2026-11-10T15:00:00+01:00');

export function altAdresseWeiterleiten(request, jetzt = Date.now()) {
  if (jetzt < WEITERLEITUNG_AB) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const u = new URL(request.url);
  if (u.hostname !== ALT_HOST) return null;
  if (u.pathname === '/umzug.html' || u.pathname === '/api' || u.pathname.startsWith('/api/')) return null;
  // 302 statt 301: Browser merken sich eine 301 dauerhaft, das wäre bei einer Korrektur nicht mehr rückgängig zu machen
  return new Response(null, { status: 302, headers: { location: NEU_URL + u.pathname + u.search, 'cache-control': 'no-store' } });
}
