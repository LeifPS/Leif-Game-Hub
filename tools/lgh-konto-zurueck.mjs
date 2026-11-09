#!/usr/bin/env node
// Holt ein Konto (oder nur einzelne Spielstände) aus der Sicherungsdatenbank "lgh-backup" zurück in "lgh".
// Aufruf (im Hub-Ordner, mit wrangler angemeldet):
//   node tools/lgh-konto-zurueck.mjs <Kontoname> [Spiel]        zeigt nur, was vorhanden ist (Trockenlauf)
//   node tools/lgh-konto-zurueck.mjs <Kontoname> [Spiel] --los  schreibt zurück (nur was in "lgh" fehlt; nichts wird überschrieben)
import { execFileSync } from 'node:child_process';

const [name, spiel] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const los = process.argv.includes('--los');
if (!name) { console.error('Kontoname fehlt. Aufruf: node tools/lgh-konto-zurueck.mjs <Kontoname> [Spiel] [--los]'); process.exit(1); }
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const d1 = (db, sql) => {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--command', sql], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(out)[0].results || [];
};

const u = d1('lgh-backup', `SELECT id, name, row, deleted_at FROM users_bak WHERE lower(name) = lower(${q(name)})`)[0];
if (!u) { console.error('Konto "' + name + '" ist nicht in der Sicherung.'); process.exit(1); }
const zeile = JSON.parse(u.row);
const staende = d1('lgh-backup', `SELECT user_id, game, rev, data, size, updated, device FROM saves_bak WHERE user_id = ${Number(u.id)}${spiel ? ` AND game = ${q(spiel)}` : ''} ORDER BY game, rev`);
console.log(`Konto ${u.name} (id ${u.id})${u.deleted_at ? ', gelöscht am ' + new Date(u.deleted_at * 1000).toISOString() : ''}: ${staende.length} Spielstände in der Sicherung.`);
for (const s of staende) console.log(`  ${s.game} rev ${s.rev}  ${s.size} B  ${new Date(s.updated * 1000).toISOString()}`);
if (!los) { console.log('\nTrockenlauf. Mit --los zurückschreiben.'); process.exit(0); }

const da = d1('lgh', `SELECT id FROM users WHERE id = ${Number(u.id)}`);
if (!da.length) {
  const sp = Object.keys(zeile), vals = sp.map((k) => (zeile[k] === null ? 'NULL' : typeof zeile[k] === 'number' ? zeile[k] : q(zeile[k])));
  d1('lgh', `INSERT INTO users (${sp.join(',')}) VALUES (${vals.join(',')})`);
  console.log('Konto wieder angelegt (Passwort wie vorher).');
}
let neu = 0;
for (const s of staende) {
  const da = d1('lgh', `SELECT 1 AS x FROM saves WHERE user_id = ${s.user_id} AND game = ${q(s.game)} AND rev = ${s.rev}`);
  if (da.length) continue;
  d1('lgh', `INSERT INTO saves (user_id, game, rev, data, size, updated, device) VALUES (${s.user_id}, ${q(s.game)}, ${s.rev}, ${q(s.data)}, ${s.size}, ${s.updated}, ${s.device === null ? 'NULL' : q(s.device)})`);
  neu++;
}
console.log(`${neu} Spielstände zurückgeschrieben (vorhandene blieben unberührt).`);
