// Zusatzinhalte (DLCs) und Hub-Währung. Läuft im Konten-Worker (src/konten.js reicht die Helfer durch).
//
// - Die Währung hat genau einen Namen: WAEHRUNG.name (hier ändern, Hub und Spiele übernehmen ihn von der API).
// - Der Katalog steht nur hier auf dem Server, damit Preise nicht vom Browser aus änderbar sind.
// - Guthaben und Besitz liegen pro Konto in D1. Gekauft wird atomar: Guthaben abziehen und Besitz eintragen in einer Transaktion.
// - Verdienen von Währung ist noch nicht eingebaut; Guthaben wird bisher nur von Hand vergeben (siehe README).
export const WAEHRUNG = { name: 'Aurum' };

export const KATALOG = [
  {
    id: 'schleimmerge-runen',
    spiel: 'schleimmerge',
    name: 'Runenschmiede',
    text: 'Zwölf neue Runenwaffen und das neue Verzauberungs-System: Verzaubere deine Bahnen mit Flamme, Frost, Glück und Blitz und werte die Verzauberungen mit Münzen auf.',
    preis: 500,
  },
];

export const DLC_ID_RE = /^[a-z0-9_-]{1,40}$/;
const dlcDef = (id) => KATALOG.find((d) => d.id === id) || null;

export function dlcModul(h) {
  const { antwort, fehler, lies, gesperrt, zaehle } = h;

  async function stand(db, s) {
    const g = await db.prepare('SELECT amount FROM wallet WHERE user_id = ?').bind(s.id).first();
    const b = await db.prepare('SELECT dlc, bought FROM dlc_owned WHERE user_id = ?').bind(s.id).all();
    const gekauft = {};
    for (const x of b.results) gekauft[x.dlc] = x.bought;
    return {
      waehrung: WAEHRUNG.name,
      guthaben: g ? g.amount : 0,
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
    return antwort({ ok: true, ...(await stand(db, s)) });
  }

  async function route(request, db, s, jetzt, m, unter) {
    if (!unter && m === 'GET') return antwort(await stand(db, s));
    if (unter === 'kaufen' && m === 'POST') return await kaufen(request, db, s, jetzt);
    return fehler(404, 'unbekannt');
  }

  async function kontoWeg(db, uid) {
    await db.batch([
      db.prepare('DELETE FROM wallet WHERE user_id = ?').bind(uid),
      db.prepare('DELETE FROM wallet_log WHERE user_id = ?').bind(uid),
      db.prepare('DELETE FROM dlc_owned WHERE user_id = ?').bind(uid),
    ]);
  }

  return { route, kontoWeg };
}
