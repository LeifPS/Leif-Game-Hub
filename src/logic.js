// logic.leifps.de: LogikLab, der Logiksimulator (Dateien in public/logicsim/).
// - "/" liefert public/logicsim/index.html, die Adresse bleibt logic.leifps.de
// - /logicsim/... (auch hub.leifps.de/logicsim) funktioniert weiterhin
// - alle anderen Pfade auf logic.leifps.de führen zurück auf die Startseite des Simulators (kein Hub auf dieser Adresse)
// Voraussetzung in Cloudflare: logic.leifps.de als Custom Domain an diesen Worker.
export const LOGIC_HOST = 'logic.leifps.de';

export function logicWeiche(request, env) {
  const u = new URL(request.url);
  if (u.hostname.toLowerCase() !== LOGIC_HOST) return null;
  if (u.pathname.startsWith('/logicsim/')) return null;   // normale Auslieferung aus public/
  if (u.pathname !== '/' && u.pathname !== '/index.html') return Promise.resolve(Response.redirect('https://' + LOGIC_HOST + '/', 302));
  if (!env || !env.ASSETS) return Promise.resolve(new Response('Nicht gefunden', { status: 404 }));
  return env.ASSETS.fetch(new Request(new URL('/logicsim/', request.url), request)).then((r) => {
    const h = new Headers(r.headers);
    h.set('cache-control', 'no-cache');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  });
}
