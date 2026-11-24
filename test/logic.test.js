import test from 'node:test';
import assert from 'node:assert/strict';
import { logicWeiche } from '../src/logic.js';

const env = { ASSETS: { fetch: async (req) => new Response('SIM ' + new URL(req.url).pathname, { headers: { 'content-type': 'text/html' } }) } };
const r = (url) => new Request(url);

test('logic.leifps.de: Startseite liefert den Simulator aus /logicsim/', async () => {
  const a = await logicWeiche(r('https://logic.leifps.de/'), env);
  assert.equal(a.status, 200);
  assert.equal(await a.text(), 'SIM /logicsim/');
  assert.equal(a.headers.get('cache-control'), 'no-cache');
  assert.equal(await (await logicWeiche(r('https://logic.leifps.de/index.html'), env)).text(), 'SIM /logicsim/');
});

test('logic.leifps.de: /logicsim/ normal, andere Pfade zurück zur Startseite', async () => {
  assert.equal(logicWeiche(r('https://logic.leifps.de/logicsim/'), env), null);
  const a = await logicWeiche(r('https://logic.leifps.de/games.json'), env);
  assert.equal(a.status, 302);
  assert.equal(a.headers.get('location'), 'https://logic.leifps.de/');
});

test('Andere Adressen bleiben unberührt', () => {
  assert.equal(logicWeiche(r('https://hub.leifps.de/'), env), null);
  assert.equal(logicWeiche(r('https://leifps.de/logicsim'), env), null);
});

test('logic.leifps.de: App-Dateien (Manifest, Service Worker, Icons) kommen aus /logicsim/', async () => {
  assert.equal(await (await logicWeiche(r('https://logic.leifps.de/logiklab-sw.js'), env)).text(), 'SIM /logicsim/logiklab-sw.js');
  assert.equal(await (await logicWeiche(r('https://logic.leifps.de/logiklab.webmanifest'), env)).text(), 'SIM /logicsim/logiklab.webmanifest');
  assert.equal((await logicWeiche(r('https://logic.leifps.de/logiklab/../games.json'), env)).status, 302);
});
