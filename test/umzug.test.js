import test from 'node:test';
import assert from 'node:assert/strict';
import { altAdresseWeiterleiten, WEITERLEITUNG_AB } from '../src/umzug.js';

const r = (url, method = 'GET') => new Request(url, { method });
const vorher = WEITERLEITUNG_AB - 1000, nachher = WEITERLEITUNG_AB + 1000;

test('Alte Adresse: vor Dienstag 15:00 (Berlin) keine Weiterleitung', () => {
  assert.equal(WEITERLEITUNG_AB, Date.UTC(2026, 10, 10, 14, 0, 0));
  assert.equal(altAdresseWeiterleiten(r('https://lgh.leifps.workers.dev/'), vorher), null);
});

test('Alte Adresse: ab dem Zeitpunkt zu hub.leifps.de, Pfad und Query bleiben', () => {
  const a = altAdresseWeiterleiten(r('https://lgh.leifps.workers.dev/index.html?x=1'), nachher);
  assert.equal(a.status, 302);
  assert.equal(a.headers.get('location'), 'https://hub.leifps.de/index.html?x=1');
  assert.equal(altAdresseWeiterleiten(r('https://lgh.leifps.workers.dev/'), nachher).headers.get('location'), 'https://hub.leifps.de/');
});

test('Alte Adresse: API, Umzugsseite und Schreibzugriffe bleiben unberührt; neue Adressen ebenso', () => {
  assert.equal(altAdresseWeiterleiten(r('https://lgh.leifps.workers.dev/umzug.html'), nachher), null);
  assert.equal(altAdresseWeiterleiten(r('https://lgh.leifps.workers.dev/api/ich'), nachher), null);
  assert.equal(altAdresseWeiterleiten(r('https://lgh.leifps.workers.dev/api'), nachher), null);
  assert.equal(altAdresseWeiterleiten(r('https://lgh.leifps.workers.dev/', 'POST'), nachher), null);
  assert.equal(altAdresseWeiterleiten(r('https://hub.leifps.de/'), nachher), null);
  assert.equal(altAdresseWeiterleiten(r('https://leifps.de/'), nachher), null);
});
