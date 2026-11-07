// Gibt ein Hub-Konto für ein anderes Gerät frei (nur für den Betreiber): Das Konto wird beim nächsten Anmelden an das dann benutzte Gerät gebunden.
// Aufruf:  node tools/lgh-geraet.mjs <Name>
// Ausgabe: eine SQL-Anweisung für die Datenbank "lgh" (Cloudflare → D1 → lgh → Console, oder durch Claude über das D1-Werkzeug).
const [name] = process.argv.slice(2);
if (!name) { console.error('Aufruf: node tools/lgh-geraet.mjs <Name>'); process.exit(1); }
const lc = name.normalize('NFC').toLowerCase().replace(/^@/, '').replace(/'/g, "''");
console.log(`UPDATE users SET device_id=NULL WHERE name_lc='${lc}';`);
