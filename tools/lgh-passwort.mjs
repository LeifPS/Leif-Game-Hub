// Setzt das Passwort eines Hub-Kontos zurück (nur für den Betreiber).
// Aufruf:  node tools/lgh-passwort.mjs <Name> <neues Passwort>
// Ausgabe: eine SQL-Anweisung für die Datenbank "lgh" (Cloudflare → D1 → lgh → Console, oder durch Claude über das D1-Werkzeug).
// Alle angemeldeten Geräte des Kontos werden dabei abgemeldet.
import { webcrypto as c } from 'node:crypto';
const [name, pw] = process.argv.slice(2);
if (!name || !pw) { console.error('Aufruf: node tools/lgh-passwort.mjs <Name> <neues Passwort>'); process.exit(1); }
const hex = (u8) => [...new Uint8Array(u8)].map((b) => b.toString(16).padStart(2, '0')).join('');
const k = await c.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
const key = hex(await c.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 210000, salt: new TextEncoder().encode('lgh1:' + name.normalize('NFC').toLowerCase()) }, k, 256));
const salt = hex(c.getRandomValues(new Uint8Array(16)));
const hash = hex(await c.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + key)));
const lc = name.normalize('NFC').toLowerCase().replace(/'/g, "''");
console.log(`UPDATE users SET salt='${salt}', hash='${hash}' WHERE name_lc='${lc}';`);
console.log(`DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE name_lc='${lc}');`);
