import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/konten.js';
import { sichern, kontoSichern, LOESCH_TAGE } from '../src/sicherung.js';
import { makeD1 } from './helpers/d1.js';
import { schluessel } from './helpers/schluessel.js';

let uhr = 1_800_000_000_000;
async function call(env, methode, pfad, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await handle(new Request('https://hub.test' + pfad, { method: methode, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, uhr);
  return { status: r.status, j: await r.json() };
}
async function konto(env, name = 'Leif') {
  const r = await call(env, 'POST', '/api/registrieren', { name, key: await schluessel(name, 'geheim123'), geraet: 'iPhone' });
  assert.equal(r.status, 200);
  return r.j.token;
}
const env2 = () => ({ DB: makeD1(), BACKUP_DB: makeD1() });
const n = (db, sql) => db.raw.prepare(sql).get().n;

test('Nächtliche Sicherung kopiert Stände und Konten und ist wiederholbar', async () => {
  const env = env2();
  const t = await konto(env);
  await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 0, daten: '{"t":1,"d":{"x":"1"}}', geraet: 'iPad' }, t);
  const a = await sichern(env, Math.floor(uhr / 1000));
  assert.equal(a.staende, 1);
  assert.equal(n(env.BACKUP_DB, 'SELECT COUNT(*) AS n FROM saves_bak'), 1);
  assert.equal(n(env.BACKUP_DB, 'SELECT COUNT(*) AS n FROM users_bak'), 1);
  uhr += 60000;
  await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 1, daten: '{"t":2,"d":{"x":"2"}}', geraet: 'iPad' }, t);
  await sichern(env, Math.floor(uhr / 1000));
  await sichern(env, Math.floor(uhr / 1000));   // doppelt: nichts wird doppelt angelegt
  assert.equal(n(env.BACKUP_DB, 'SELECT COUNT(*) AS n FROM saves_bak'), 2);
});

test('Ohne Backup-Datenbank läuft alles wie bisher', async () => {
  const env = { DB: makeD1() };
  assert.deepEqual(await sichern(env), { uebersprungen: true });
  const t = await konto(env);
  assert.equal((await call(env, 'POST', '/api/loeschen', { key: await schluessel('Leif', 'geheim123') }, t)).status, 200);
});

test('Konto löschen: erst sichern, danach löschen; nach 30 Tagen räumt die Nachtsicherung auf', async () => {
  const env = env2();
  const t = await konto(env);
  await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 0, daten: '{"t":1,"d":{"x":"wichtig"}}', geraet: 'iPad' }, t);
  assert.equal((await call(env, 'POST', '/api/loeschen', { key: await schluessel('Leif', 'geheim123') }, t)).status, 200);
  assert.equal(n(env.DB, 'SELECT COUNT(*) AS n FROM saves'), 0);
  assert.equal(n(env.BACKUP_DB, 'SELECT COUNT(*) AS n FROM saves_bak'), 1, 'Stand liegt in der Sicherung');
  const u = env.BACKUP_DB.raw.prepare('SELECT * FROM users_bak').get();
  assert.ok(u.deleted_at > 0);
  const jetzt = Math.floor(uhr / 1000);
  await sichern(env, jetzt + 5 * 86400);
  assert.equal(n(env.BACKUP_DB, 'SELECT COUNT(*) AS n FROM users_bak'), 1, 'nach 5 Tagen noch da');
  await sichern(env, jetzt + (LOESCH_TAGE + 2) * 86400);
  assert.equal(n(env.BACKUP_DB, 'SELECT COUNT(*) AS n FROM users_bak'), 0, 'nach 30 Tagen weg');
  assert.equal(n(env.BACKUP_DB, 'SELECT COUNT(*) AS n FROM saves_bak'), 0);
});

test('Konto löschen bricht ab, wenn die Sicherung nicht klappt', async () => {
  const env = env2();
  const t = await konto(env);
  await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 0, daten: '{"t":1,"d":{}}' }, t);
  env.BACKUP_DB = { prepare() { throw new Error('kaputt'); }, batch() { throw new Error('kaputt'); } };
  const r = await call(env, 'POST', '/api/loeschen', { key: await schluessel('Leif', 'geheim123') }, t);
  assert.equal(r.status, 503);
  assert.equal(n(env.DB, 'SELECT COUNT(*) AS n FROM saves'), 1, 'nichts gelöscht');
  assert.equal((await call(env, 'GET', '/api/ich', undefined, t)).status, 200);
});

test('Wiederherstellung: Server-Stand fehlt, Sicherung hat ihn', async () => {
  const env = env2();
  const t = await konto(env);
  await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 0, daten: '{"t":1,"d":{"x":"gerettet"}}', geraet: 'iPad' }, t);
  await sichern(env, Math.floor(uhr / 1000));
  env.DB.raw.prepare('DELETE FROM saves').run();          // Unglück
  assert.equal((await call(env, 'GET', '/api/stand/zahlenwerk', undefined, t)).status, 404);
  const bak = env.BACKUP_DB.raw.prepare('SELECT user_id, game, rev, data, size, updated, device FROM saves_bak').all();
  assert.equal(bak.length, 1);
  for (const r of bak) env.DB.raw.prepare('INSERT INTO saves (user_id, game, rev, data, size, updated, device) VALUES (?,?,?,?,?,?,?)').run(r.user_id, r.game, r.rev, r.data, r.size, r.updated, r.device);
  const g = await call(env, 'GET', '/api/stand/zahlenwerk', undefined, t);
  assert.equal(g.status, 200);
  assert.match(JSON.stringify(g.j), /gerettet/);
});

test('Meilensteine: größter Stand und Monatsstände bleiben trotz Ausdünnung', async () => {
  const env = env2();
  const t = await konto(env);
  const monat = 30 * 86400 * 1000;
  uhr = 1_800_000_000_000;
  const gross = JSON.stringify({ t: 0, d: { x: 'g'.repeat(4000) } });
  await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 0, daten: gross, geraet: 'a' }, t);   // rev 1: groß
  let basis = 1;
  for (let i = 1; i <= 60; i++) {
    uhr += monat / 10;
    const r = await call(env, 'PUT', '/api/stand/zahlenwerk', { basis, daten: JSON.stringify({ t: i, d: { x: 'k' + i } }), geraet: 'a' }, t);
    basis = r.j.rev;
  }
  const revs = env.DB.raw.prepare('SELECT rev FROM saves').all().map((x) => x.rev);
  assert.ok(revs.includes(1), 'größter Stand bleibt');
  assert.ok(revs.includes(basis), 'neuester bleibt');
  assert.ok(revs.length < 61, 'es wird trotzdem ausgedünnt');
});

test('kontoSichern ohne Backup-DB ist ein No-op', async () => {
  assert.equal(await kontoSichern(makeD1(), null, 1, 1, true), true);
});
