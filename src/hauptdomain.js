// leifps.de (Hauptdomain): leitet NICHT mehr alles zum Hub weiter.
// - eigene Seiten (EIGENE_PFADE, z. B. /logicsim) bleiben auf leifps.de und kommen aus public/
// - alles andere (auch die Startseite) geht weiter zu hub.leifps.de, damit alte Links und die Familie nichts merken
// - www.leifps.de leitet auf leifps.de (gleicher Pfad)
// Voraussetzung in Cloudflare: leifps.de (und www) als Custom Domain an diesen Worker, die alte Redirect-Regel gelöscht.
export const HAUPT_HOST = 'leifps.de';
export const HUB_URL = 'https://hub.leifps.de';
export const EIGENE_PFADE = ['/logicsim'];

export function hauptdomainWeiche(request) {
  const u = new URL(request.url);
  const host = u.hostname.toLowerCase();
  if (host === 'www.' + HAUPT_HOST) return Response.redirect('https://' + HAUPT_HOST + u.pathname + u.search, 301);
  if (host !== HAUPT_HOST) return null;
  if (EIGENE_PFADE.some((p) => u.pathname === p || u.pathname.startsWith(p + '/'))) return null;   // normale Auslieferung aus public/
  // 302 statt 301, damit später weitere eigene Seiten auf leifps.de möglich bleiben (Browser merken sich 301 dauerhaft)
  return new Response(null, { status: 302, headers: { location: HUB_URL + u.pathname + u.search, 'cache-control': 'no-store' } });
}
