// Chat-Gruppen: mehrere Freunde in einem Chat. Läuft im Konten-Worker (src/konten.js reicht die Helfer durch).
//
// Regeln:
// - Jede angemeldete Person kann Gruppen anlegen und darin chatten. Die Gruppe gehört dem, der sie angelegt hat (Besitzer).
// - Nur der Besitzer fügt Mitglieder hinzu (nur eigene bestätigte Freunde), entfernt sie, benennt die Gruppe um oder löscht sie.
// - Jedes Mitglied kann jederzeit austreten. Verlässt der Besitzer die Gruppe, wird das am längsten dabeigebliebene Mitglied Besitzer;
//   ist niemand mehr drin, verschwindet die Gruppe samt Nachrichten.
// - Endet die Freundschaft zwischen Besitzer und Mitglied, ist das Mitglied draußen. Beim Löschen eines Kontos tritt es aus allen Gruppen aus.
// - Höchstens 12 Mitglieder pro Gruppe, 20 Gruppen pro Konto, 500 Nachrichten pro Gruppe, 500 Zeichen pro Nachricht (wie im Freunde-Chat).
export const GRUPPE_MITGLIEDER_MAX = 12, GRUPPEN_PRO_KONTO = 20, GRUPPE_NAME_MAX = 30, GRUPPE_BEHALTEN = 500, GRUPPE_SEITE = 50;

export function gruppeNameBereinigen(v) {
  if (typeof v !== 'string') return null;
  const t = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t || [...t].length > GRUPPE_NAME_MAX || /[\u0000-\u001f\u007f<>]/.test(t)) return null;
  return t;
}

export function gruppenModul(h) {
  const { antwort, fehler, lies, gesperrt, zaehle, suche, paar, avParse, chatText, chatVorschau } = h;

  const mitgliedVon = (db, gid, uid) => db.prepare('SELECT g.id AS id, g.name AS name, g.owner AS owner, m.last_read AS last_read FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.group_id = ? AND m.user_id = ?').bind(gid, uid).first();
  async function istFreund(db, x, y) {
    const [a, b] = paar(x, y);
    const f = await db.prepare("SELECT status FROM friends WHERE a = ? AND b = ?").bind(a, b).first();
    return !!f && f.status === 'accepted';
  }

  async function details(db, s, gid) {
    const g = await mitgliedVon(db, gid, s.id);
    if (!g) return fehler(404, 'unbekannt');
    const r = await db.prepare('SELECT u.id AS uid, u.name AS name, u.display AS display, u.avatar AS avatar FROM chat_group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined, u.id').bind(gid).all();
    const mitglieder = r.results.map((x) => ({ name: x.name, anzeige: x.display || x.name, av: avParse(x.avatar), besitzer: x.uid === g.owner, ich: x.uid === s.id }));
    mitglieder.sort((a, b) => (b.besitzer - a.besitzer) || a.anzeige.toLowerCase().localeCompare(b.anzeige.toLowerCase()));
    return antwort({ gruppe: { id: g.id, name: g.name, eigener: g.owner === s.id, mitglieder } });
  }

  async function liste(db, s) {
    const r = await db.prepare(
      `SELECT g.id AS id, g.name AS name, g.owner AS owner,
         (SELECT COUNT(*) FROM chat_group_members x WHERE x.group_id = g.id) AS n,
         (SELECT COUNT(*) FROM chat_group_messages t WHERE t.group_id = g.id AND t.sender <> m.user_id AND t.id > m.last_read) AS ung,
         (SELECT t.text FROM chat_group_messages t WHERE t.group_id = g.id ORDER BY t.id DESC LIMIT 1) AS text,
         (SELECT COALESCE(u.display, u.name) FROM chat_group_messages t JOIN users u ON u.id = t.sender WHERE t.group_id = g.id ORDER BY t.id DESC LIMIT 1) AS von,
         COALESCE((SELECT MAX(t.created) FROM chat_group_messages t WHERE t.group_id = g.id), g.created) AS zeit
       FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY zeit DESC, g.id DESC`
    ).bind(s.id).all();
    return r.results.map((x) => ({ id: x.id, name: x.name, mitglieder: x.n, ungelesen: x.ung, vorschau: x.text ? chatVorschau(x.text) : null, von: x.von || null, zeit: x.zeit, eigener: x.owner === s.id }));
  }

  // Für den Hub im Spiel: ungelesene Gruppennachrichten (höchstens 5 Gruppen), eine Zeile je Gruppe wie bei Freunden
  async function ungelesen(db, s) {
    const r = await db.prepare(
      `SELECT g.id AS id, g.name AS gname, COUNT(t.id) AS n, MAX(t.id) AS neu
       FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id
       JOIN chat_group_messages t ON t.group_id = g.id AND t.sender <> m.user_id AND t.id > m.last_read
       WHERE m.user_id = ? GROUP BY g.id ORDER BY neu DESC LIMIT 5`
    ).bind(s.id).all();
    const out = [];
    for (const x of r.results) {
      const t = await db.prepare('SELECT t.text AS text, COALESCE(u.display, u.name) AS von FROM chat_group_messages t JOIN users u ON u.id = t.sender WHERE t.id = ?').bind(x.neu).first();
      out.push({ name: '#g' + x.id, anzeige: x.gname, av: null, n: x.n, neu: x.neu, text: (t ? t.von + ': ' : '') + (t ? chatVorschau(t.text) : ''), gruppe: x.id });
    }
    return out;
  }

  async function anlegen(request, db, s, jetzt) {
    const { b } = await lies(request);
    if (!b) return fehler(400, 'eingabe');
    const name = gruppeNameBereinigen(b.name);
    if (!name) return fehler(400, 'name');
    const namen = Array.isArray(b.mitglieder) ? b.mitglieder.slice(0, GRUPPE_MITGLIEDER_MAX + 1) : [];
    const k = 'gr:' + s.id;
    const warte = await gesperrt(db, k, jetzt);
    if (warte) return fehler(429, 'zu_viele', { warte });
    const eigene = await db.prepare('SELECT COUNT(*) AS n FROM chat_group_members WHERE user_id = ?').bind(s.id).first();
    if (eigene.n >= GRUPPEN_PRO_KONTO) return fehler(400, 'zu_viele_gruppen');
    const ids = [];
    for (const n of namen) {
      const z = await suche(db, n);
      if (!z || z.id === s.id || ids.includes(z.id) || !(await istFreund(db, s.id, z.id))) return fehler(404, 'unbekannt');   // nur eigene Freunde
      ids.push(z.id);
    }
    if (ids.length + 1 > GRUPPE_MITGLIEDER_MAX) return fehler(400, 'zu_viele');
    for (const id of ids) {
      const n = await db.prepare('SELECT COUNT(*) AS n FROM chat_group_members WHERE user_id = ?').bind(id).first();
      if (n.n >= GRUPPEN_PRO_KONTO) return fehler(400, 'ziel_zu_viele_gruppen');
    }
    await zaehle(db, k, jetzt, 10, 3600, 3600);   // höchstens 10 neue Gruppen pro Stunde
    const g = await db.prepare('INSERT INTO chat_groups (name, owner, created) VALUES (?, ?, ?) RETURNING id').bind(name, s.id, jetzt).first();
    await db.batch([s.id, ...ids].map((uid) => db.prepare('INSERT INTO chat_group_members (group_id, user_id, joined, last_read) VALUES (?, ?, ?, 0)').bind(g.id, uid, jetzt)));
    return details(db, s, g.id);
  }

  async function hinzufuegen(request, db, s, gid, jetzt) {
    const g = await mitgliedVon(db, gid, s.id);
    if (!g) return fehler(404, 'unbekannt');
    if (g.owner !== s.id) return fehler(403, 'nur_besitzer');
    const { b } = await lies(request);
    const z = b && await suche(db, b.name);
    if (!z || z.id === s.id || !(await istFreund(db, s.id, z.id))) return fehler(404, 'unbekannt');
    if (await mitgliedVon(db, gid, z.id)) return fehler(409, 'schon_mitglied');
    const n = await db.prepare('SELECT COUNT(*) AS n FROM chat_group_members WHERE group_id = ?').bind(gid).first();
    if (n.n >= GRUPPE_MITGLIEDER_MAX) return fehler(400, 'zu_viele');
    const zn = await db.prepare('SELECT COUNT(*) AS n FROM chat_group_members WHERE user_id = ?').bind(z.id).first();
    if (zn.n >= GRUPPEN_PRO_KONTO) return fehler(400, 'ziel_zu_viele_gruppen');
    const letzte = await db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM chat_group_messages WHERE group_id = ?').bind(gid).first();
    await db.prepare('INSERT INTO chat_group_members (group_id, user_id, joined, last_read) VALUES (?, ?, ?, ?)').bind(gid, z.id, jetzt, letzte.id).run();   // alte Nachrichten zählen für Neue nicht als ungelesen
    return details(db, s, gid);
  }

  async function entfernen(request, db, s, gid) {
    const g = await mitgliedVon(db, gid, s.id);
    if (!g) return fehler(404, 'unbekannt');
    if (g.owner !== s.id) return fehler(403, 'nur_besitzer');
    const { b } = await lies(request);
    const z = b && await suche(db, b.name);
    if (!z || z.id === s.id || !(await mitgliedVon(db, gid, z.id))) return fehler(404, 'unbekannt');
    await db.prepare('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?').bind(gid, z.id).run();
    return details(db, s, gid);
  }

  // Austreten: gemeinsam genutzt von "verlassen" und vom Löschen eines Kontos
  async function austreten(db, gid, uid) {
    await db.prepare('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?').bind(gid, uid).run();
    const rest = await db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ? ORDER BY joined, user_id LIMIT 1').bind(gid).first();
    if (!rest) {
      await db.batch([db.prepare('DELETE FROM chat_group_messages WHERE group_id = ?').bind(gid), db.prepare('DELETE FROM chat_groups WHERE id = ?').bind(gid)]);
    } else await db.prepare('UPDATE chat_groups SET owner = ? WHERE id = ? AND owner = ?').bind(rest.user_id, gid, uid).run();
  }
  async function verlassen(db, s, gid) {
    if (!(await mitgliedVon(db, gid, s.id))) return fehler(404, 'unbekannt');
    await austreten(db, gid, s.id);
    return antwort({ ok: true });
  }
  async function umbenennen(request, db, s, gid) {
    const g = await mitgliedVon(db, gid, s.id);
    if (!g) return fehler(404, 'unbekannt');
    if (g.owner !== s.id) return fehler(403, 'nur_besitzer');
    const { b } = await lies(request);
    const name = b && gruppeNameBereinigen(b.name);
    if (!name) return fehler(400, 'name');
    await db.prepare('UPDATE chat_groups SET name = ? WHERE id = ?').bind(name, gid).run();
    return details(db, s, gid);
  }
  async function loeschen(db, s, gid) {
    const g = await mitgliedVon(db, gid, s.id);
    if (!g) return fehler(404, 'unbekannt');
    if (g.owner !== s.id) return fehler(403, 'nur_besitzer');
    await db.batch([
      db.prepare('DELETE FROM chat_group_messages WHERE group_id = ?').bind(gid),
      db.prepare('DELETE FROM chat_group_members WHERE group_id = ?').bind(gid),
      db.prepare('DELETE FROM chat_groups WHERE id = ?').bind(gid),
    ]);
    return antwort({ ok: true });
  }

  /* ---------- Nachrichten ---------- */
  const nachricht = (s, r) => ({ id: r.id, von: r.sender === s.id ? 'ich' : 'er', name: r.name, anzeige: r.display || r.name, text: r.text, zeit: r.created });
  const SEL = 'SELECT m.id AS id, m.sender AS sender, m.text AS text, m.created AS created, u.name AS name, u.display AS display FROM chat_group_messages m JOIN users u ON u.id = m.sender WHERE m.group_id = ?';

  // Wie beim Freunde-Chat: ohne Parameter die neuesten 50; nach=<id> nur Neueres; vor=<id> Älteres; gelesen=1 markiert als gelesen
  async function lesen(db, s, gid, url, jetzt) {
    if (!(await mitgliedVon(db, gid, s.id))) return fehler(404, 'unbekannt');
    const nach = parseInt(url.searchParams.get('nach') || '0', 10) || 0, vor = parseInt(url.searchParams.get('vor') || '0', 10) || 0;
    let rows, mehr = false;
    if (nach > 0) rows = (await db.prepare(SEL + ' AND m.id > ? ORDER BY m.id LIMIT 100').bind(gid, nach).all()).results;
    else {
      rows = (await db.prepare(SEL + (vor > 0 ? ' AND m.id < ?' : '') + ' ORDER BY m.id DESC LIMIT ?').bind(...(vor > 0 ? [gid, vor, GRUPPE_SEITE] : [gid, GRUPPE_SEITE])).all()).results.reverse();
      mehr = rows.length === GRUPPE_SEITE;
    }
    if (url.searchParams.get('gelesen') === '1' && !vor && rows.length) {
      await db.prepare('UPDATE chat_group_members SET last_read = MAX(last_read, ?) WHERE group_id = ? AND user_id = ?').bind(rows[rows.length - 1].id, gid, s.id).run();
    }
    return antwort({ nachrichten: rows.map((r) => nachricht(s, r)), mehr, jetzt });
  }

  async function senden(request, db, s, gid, jetzt) {
    const { b } = await lies(request);
    if (!b) return fehler(400, 'eingabe');
    const t = chatText(b.text);
    if (t.fehler) return fehler(400, t.fehler);
    const k = 'c:' + s.id;
    const warte = await gesperrt(db, k, jetzt);
    if (warte) return fehler(429, 'zu_viele', { warte });
    if (!(await mitgliedVon(db, gid, s.id))) return fehler(404, 'unbekannt');
    await zaehle(db, k, jetzt, 30, 30, 60);   // gemeinsam mit dem Freunde-Chat: höchstens 30 Nachrichten pro Minute
    const neu = await db.prepare('INSERT INTO chat_group_messages (group_id, sender, text, created) VALUES (?, ?, ?, ?) RETURNING id').bind(gid, s.id, t.wert, jetzt).first();
    await db.batch([
      db.prepare('UPDATE chat_group_members SET last_read = MAX(last_read, ?) WHERE group_id = ? AND user_id = ?').bind(neu.id, gid, s.id),
      db.prepare('DELETE FROM chat_group_messages WHERE group_id = ? AND id < (SELECT id FROM chat_group_messages WHERE group_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)').bind(gid, gid, GRUPPE_BEHALTEN - 1),
    ]);
    return antwort({ ok: true, nachricht: { id: neu.id, von: 'ich', name: s.name, anzeige: s.anzeige || s.name, text: t.wert, zeit: jetzt } });
  }

  async function nachrichtLoeschen(request, db, s, gid) {
    const { b } = await lies(request);
    const id = b && Number.isInteger(b.id) ? b.id : 0;
    if (!id) return fehler(400, 'eingabe');
    if (!(await mitgliedVon(db, gid, s.id))) return fehler(404, 'unbekannt');
    const r = await db.prepare('DELETE FROM chat_group_messages WHERE id = ? AND group_id = ? AND sender = ?').bind(id, gid, s.id).run();
    if (!r.meta || r.meta.changes !== 1) return fehler(404, 'nicht_gefunden');
    return antwort({ ok: true });
  }

  /* ---------- Aufräumen ---------- */
  // Freundschaft zwischen x und y ist beendet: wer in einer Gruppe des anderen war, ist draußen
  const freundschaftEnde = (db, x, y) => db.batch([
    db.prepare('DELETE FROM chat_group_members WHERE user_id = ? AND group_id IN (SELECT id FROM chat_groups WHERE owner = ?)').bind(x, y),
    db.prepare('DELETE FROM chat_group_members WHERE user_id = ? AND group_id IN (SELECT id FROM chat_groups WHERE owner = ?)').bind(y, x),
  ]);
  async function kontoWeg(db, uid) {
    const r = await db.prepare('SELECT group_id FROM chat_group_members WHERE user_id = ?').bind(uid).all();
    for (const x of r.results) await austreten(db, x.group_id, uid);
    await db.prepare('DELETE FROM chat_group_messages WHERE sender = ?').bind(uid).run();
  }

  async function route(request, db, s, jetzt, m, gid, a, b, url) {
    if (!gid) {
      if (!a && m === 'GET') return antwort({ gruppen: await liste(db, s) });
      if (!a && m === 'POST') return anlegen(request, db, s, jetzt);
      return fehler(404, 'unbekannt');
    }
    if (!a && m === 'GET') return details(db, s, gid);
    if (a === 'chat' && !b && m === 'GET') return lesen(db, s, gid, url, jetzt);
    if (a === 'chat' && !b && m === 'POST') return senden(request, db, s, gid, jetzt);
    if (a === 'chat' && b === 'loeschen' && m === 'POST') return nachrichtLoeschen(request, db, s, gid);
    if (b) return fehler(404, 'unbekannt');
    if (m === 'POST') {
      if (a === 'mitglied') return hinzufuegen(request, db, s, gid, jetzt);
      if (a === 'entfernen') return entfernen(request, db, s, gid);
      if (a === 'verlassen') return verlassen(db, s, gid);
      if (a === 'umbenennen') return umbenennen(request, db, s, gid);
      if (a === 'loeschen') return loeschen(db, s, gid);
    }
    return fehler(404, 'unbekannt');
  }

  return { route, liste, ungelesen, freundschaftEnde, kontoWeg };
}
