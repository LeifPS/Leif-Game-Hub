import test from 'node:test';
import assert from 'node:assert/strict';
import { handschriftWeiche } from '../src/handschrift.js';
import { makeD1 } from './helpers/d1.js';

test('STools-Abgleich: verschlüsselt hoch- und wieder herunterladen, Zusammenführen nach Zeit und Grabsteinen', async () => {
  const env = { DB: makeD1(), ASSETS: { fetch: async () => new Response('x') } };
  globalThis.fetch = async (u, o = {}) => handschriftWeiche(new Request(new URL(u, 'https://st.leifps.de'), o), env);
  const { _intern, merge, newCode, validCode } = await import('../public/handschrift/js/sync.js');
  const code = newCode(); assert.ok(validCode(code));
  const big = 'x'.repeat(2_500_000);   // groß genug für mehrere Stücke trotz Kompression? -> Zufallsdaten
  const rnd = Array.from({ length: 1_400_000 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.random() * 26 | 0]).join('');
  const obj = { at: 1, fonts: [{ id: 'f1', updated: 5, g: { a: [{ src: 'data:image/png;base64,' + rnd }] } }], docs: [{ id: 'd1', updated: 3, text: big }], folders: [], tomb: {} };
  const n = await _intern.upload(code, obj); assert.ok(n > 900_000, 'mehrere Stücke');
  const back = await _intern.download(code);
  assert.equal(back.data.docs[0].text.length, big.length); assert.equal(back.data.fonts[0].g.a[0].src.length, rnd.length + 22);
  assert.ok(back.meta.parts >= 2);
  // falscher Schlüsselteil -> verständlicher Fehler
  await assert.rejects(() => _intern.download(code.slice(0, 8) + 'a'.repeat(16)), /Code passt nicht/);
  // Zusammenführen
  const m = merge({ docs: [{ id: 'a', updated: 2, t: 'alt' }, { id: 'b', updated: 1 }], fonts: [], folders: [], tomb: {} },
    { docs: [{ id: 'a', updated: 4, t: 'neu' }, { id: 'c', updated: 1 }], fonts: [], folders: [], tomb: { docs: { b: 3 } } });
  assert.deepEqual(m.docs.map((d) => d.id + ':' + (d.t || '')).sort(), ['a:neu', 'c:']);
  // nach dem Löschen neu bearbeitet -> bleibt
  const m2 = merge({ docs: [{ id: 'b', updated: 9 }], tomb: {} }, { docs: [], tomb: { docs: { b: 3 } } });
  assert.equal(m2.docs.length, 1);
});
