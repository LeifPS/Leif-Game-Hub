// Zusatzinhalte (DLCs) und Hub-Währung („Hexis“, intern so genannt). Läuft im Konten-Worker (src/konten.js reicht die Helfer durch).
//
// - Die Währung heißt intern Hexis. Nach außen hat sie keinen Namen: Hub und Spiele zeigen immer nur das Sechseck-Symbol mit der Zahl.
// - Der Katalog steht nur hier auf dem Server, damit Preise nicht vom Browser aus änderbar sind.
// - Guthaben und Besitz liegen pro Konto in D1. Gekauft wird atomar: Guthaben abziehen und Besitz eintragen in einer Transaktion.
// - Verdienen von Währung ist noch nicht eingebaut. Einmaliges Startgeschenk: jedes Konto, das bis einschließlich 8.11.2026 (Berliner Zeit)
//   angelegt wurde, bekommt beim ersten Abruf 1000 (Tabelle wallet_gift sorgt dafür, dass es nur einmal passiert). Alle weiteren von Hand (README).
export const KATALOG = [
  {
    id: 'schleimmerge-runen',
    spiel: 'schleimmerge',
    name: 'Runenschmiede',
    text: 'Zwölf neue Runenwaffen und das neue Verzauberungs-System: Verzaubere deine Bahnen mit Flamme, Frost, Glück und Blitz und werte die Verzauberungen mit Münzen auf.',
    preis: 500,
  },
];

export const GESCHENK = 1000;
export const GESCHENK_BIS = 1794178800;   // Sekunden: 9.11.2026, 00:00 Uhr Berliner Zeit; wer davor angelegt wurde, bekommt das Geschenk
export const DLC_ID_RE = /^[a-z0-9_-]{1,40}$/;
const dlcDef = (id) => KATALOG.find((d) => d.id === id) || null;

export function dlcModul(h) {
  const { antwort, fehler, lies, gesperrt, zaehle } = h;

  // Einmaliges Startgeschenk für Konten bis GESCHENK_BIS. Alles in einer Transaktion und nur, wenn noch kein Geschenk eingetragen ist.
  async function geschenk(db, s, jetzt) {
    const r = await db.prepare('SELECT (SELECT created FROM users WHERE id = ?1) AS c, EXISTS (SELECT 1 FROM wallet_gift WHERE user_id = ?1) AS g').bind(s.id).first();
    if (!r || r.g || r.c == null || r.c >= GESCHENK_BIS) return;
    const bed = 'NOT EXISTS (SELECT 1 FROM wallet_gift WHERE user_id = ?1) AND (SELECT created FROM users WHERE id = ?1) < ?3';
    await db.batch([
      db.prepare('INSERT INTO wallet (user_id, amount) SELECT ?1, ?2 WHERE ' + bed + ' ON CONFLICT(user_id) DO UPDATE SET amount = amount + ?2').bind(s.id, GESCHENK, GESCHENK_BIS),
      db.prepare("INSERT INTO wallet_log (user_id, delta, grund, created) SELECT ?1, ?2, 'startgeschenk', ?4 WHERE " + bed).bind(s.id, GESCHENK, GESCHENK_BIS, jetzt),
      db.prepare('INSERT OR IGNORE INTO wallet_gift (user_id, amount, created) SELECT ?1, ?2, ?4 WHERE ' + bed.replace('NOT EXISTS (SELECT 1 FROM wallet_gift WHERE user_id = ?1) AND ', '')).bind(s.id, GESCHENK, GESCHENK_BIS, jetzt),
    ]);
  }

  async function stand(db, s, jetzt) {
    await geschenk(db, s, jetzt);
    const g = await db.prepare('SELECT amount FROM wallet WHERE user_id = ?').bind(s.id).first();
    const b = await db.prepare('SELECT dlc, bought FROM dlc_owned WHERE user_id = ?').bind(s.id).all();
    // Das Geschenk wird nicht heimlich gutgeschrieben: Der Hub zeigt es einmal an (bis das Konto es mit "gesehen" bestätigt).
    const ge = await db.prepare('SELECT g.amount AS amount FROM wallet_gift g WHERE g.user_id = ?1 AND NOT EXISTS (SELECT 1 FROM wallet_gift_seen v WHERE v.user_id = ?1)').bind(s.id).first();
    const gekauft = {};
    for (const x of b.results) gekauft[x.dlc] = x.bought;
    return {
      guthaben: g ? g.amount : 0,
      geschenk: ge ? ge.amount : null,
      katalog: KATALOG.map((d) => ({ id: d.id, spiel: d.spiel, name: d.name, text: d.text, preis: d.preis, besitz: d.id in gekauft, gekauft: gekauft[d.id] || null })),
    };
  }

  async function kaufen(request, db, s, jetzt) {
    const { b } = await lies(request);
    if (!b || typeof b.id !== 'string' || !DLC_ID_RE.test(b.id)) return fehler(400, 'eingabe');
    const d = dlcDef(b.id);
    if (!d) return fehler(404, 'unbekannt');
    const k = 'dlc:' + s.id;
    const sp = await gesperrt(db, k, jetzt);
    if (sp) return fehler(429, 'zu_viele', { warte: sp });
    await zaehle(db, k, jetzt, 20, 60, 600);   // 20 Kaufversuche je 10 Minuten reichen weit
    const schon = await db.prepare('SELECT 1 AS x FROM dlc_owned WHERE user_id = ? AND dlc = ?').bind(s.id, d.id).first();
    if (schon) return fehler(409, 'schon_gekauft');
    // Atomar in einer Transaktion: Besitz nur eintragen, wenn das Guthaben reicht; abgebucht wird nur, wenn der Besitz eingetragen wurde.
    // (Doppelklick: der zweite Versuch scheitert am Primärschlüssel und macht alles rückgängig.)
    try {
      await db.batch([
        db.prepare('INSERT INTO dlc_owned (user_id, dlc, price, bought) SELECT ?1, ?2, ?3, ?4 WHERE (SELECT amount FROM wallet WHERE user_id = ?1) >= ?3').bind(s.id, d.id, d.preis, jetzt),
        db.prepare('UPDATE wallet SET amount = amount - ?3 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM dlc_owned WHERE user_id = ?1 AND dlc = ?2 AND bought = ?4)').bind(s.id, d.id, d.preis, jetzt),
      ]);
    } catch (e) { return fehler(409, 'schon_gekauft'); }
    const nun = await db.prepare('SELECT 1 AS x FROM dlc_owned WHERE user_id = ? AND dlc = ?').bind(s.id, d.id).first();
    if (!nun) return fehler(402, 'zu_wenig');
    await db.prepare('INSERT INTO wallet_log (user_id, delta, grund, created) VALUES (?, ?, ?, ?)').bind(s.id, -d.preis, 'dlc:' + d.id, jetzt).run();
    return antwort({ ok: true, ...(await stand(db, s, jetzt)) });
  }

  async function route(request, db, s, jetzt, m, unter) {
    if (!unter && m === 'GET') return antwort(await stand(db, s, jetzt));
    if (unter === 'gesehen' && m === 'POST') {
      await db.prepare('INSERT OR IGNORE INTO wallet_gift_seen (user_id) SELECT user_id FROM wallet_gift WHERE user_id = ?').bind(s.id).run();
      return antwort({ ok: true, ...(await stand(db, s, jetzt)) });
    }
    if (unter === 'kaufen' && m === 'POST') return await kaufen(request, db, s, jetzt);
    return fehler(404, 'unbekannt');
  }

  async function kontoWeg(db, uid) {
    await db.batch([
      db.prepare('DELETE FROM wallet WHERE user_id = ?').bind(uid),
      db.prepare('DELETE FROM wallet_log WHERE user_id = ?').bind(uid),
      db.prepare('DELETE FROM dlc_owned WHERE user_id = ?').bind(uid),
      db.prepare('DELETE FROM wallet_gift WHERE user_id = ?').bind(uid),
      db.prepare('DELETE FROM wallet_gift_seen WHERE user_id = ?').bind(uid),
    ]);
  }

  return { route, kontoWeg };
}
