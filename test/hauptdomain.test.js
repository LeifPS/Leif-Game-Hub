import test from 'node:test';
import assert from 'node:assert/strict';
import { hauptdomainWeiche } from '../src/hauptdomain.js';

const r = (url) => new Request(url);

test('leifps.de: Startseite und unbekannte Pfade gehen zum Hub (Pfad und Query bleiben)', () => {
  const a = hauptdomainWeiche(r('https://leifps.de/'));
  assert.equal(a.status, 302);
  assert.equal(a.headers.get('location'), 'https://hub.leifps.de/');
  assert.equal(hauptdomainWeiche(r('https://leifps.de/kontakt.html?x=1')).headers.get('location'), 'https://hub.leifps.de/kontakt.html?x=1');
});

test('leifps.de: eigene Seiten wie /logicsim bleiben auf leifps.de', () => {
  assert.equal(hauptdomainWeiche(r('https://leifps.de/logicsim')), null);
  assert.equal(hauptdomainWeiche(r('https://leifps.de/logicsim/')), null);
  assert.equal(hauptdomainWeiche(r('https://leifps.de/logicsim/index.html')), null);
  assert.notEqual(hauptdomainWeiche(r('https://leifps.de/logicsimx')), null);
});

test('www.leifps.de geht auf leifps.de, andere Adressen bleiben unberührt', () => {
  assert.equal(hauptdomainWeiche(r('https://www.leifps.de/logicsim/')).headers.get('location'), 'https://leifps.de/logicsim/');
  assert.equal(hauptdomainWeiche(r('https://hub.leifps.de/')), null);
  assert.equal(hauptdomainWeiche(r('https://tippschrift.de/')), null);
});
