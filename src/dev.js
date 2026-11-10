// dev.leifps.de: Entwickler-Seite. Jedes Hub-Konto kann eigene Spiele einreichen (keine Prüfung vorab), Mitentwickler einladen
// (sie müssen auf ihrem Konto zustimmen) und Statistiken sehen. Die Spiele erscheinen im Hub neben denen aus games.json.
// Läuft im Konten-Worker (src/konten.js reicht die Helfer durch). Tabellen: dev_games, dev_co, spiel_tag (src/schema.js).
export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const MAX_SPIELE = 10;            // so viele Spiele darf ein Konto höchstens einreichen
export const MAX_MIT = 5;                // so viele Mitentwickler pro Spiel
export const SHOTS_MIN = 3, SHOTS_MAX = 20, TRAILER_MAX = 2, TAGS_MAX = 5;
const RESERVIERT = new Set(['api', 'dev', 'hub', 'admin', 'wiki', 'wikis', 'profil', 'spiel', 'konto', 'neu', 'alle']);
const HUB_HOSTS = ['hub.leifps.de', 'dev.leifps.de', 'leifps.de', 'lgh.leifps.workers.dev', 'leif-game-hub.leifps.workers.dev'];
const FARBEN = ['#5b8fc9', '#6fa86a', '#c9795b', '#a06fc9', '#c9b45b', '#5bb5b0', '#c95b8f', '#7a8fa8'];

const sauber = (t, max) => (typeof t === 'string' ? t.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').trim() : '').slice(0, max);
const ohneBreaks = (t) => t.replace(/\s+/g, ' ').trim();

export function slug(t) {
  return t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
}
export function httpsUrl(v, max = 500) {
  if (typeof v !== 'string' || v.length > max) return null;
  let u; try { u = new URL(v.trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null;
  return u.href;
}
export function youtubeId(v) {
  if (typeof v !== 'string') return null;
  let u; try { u = new URL(v.trim()); } catch (e) { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = /^\/(?:embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
    if (!id && m) id = m[1];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function devModul(h) {
  const { antwort, fehler, lies, gesperrt, zaehle } = h;
  const lesen = (t, f) => { try { const x = JSON.parse(t); return Array.isArray(x) ? x : f; } catch (e) { return f; } };

  async function namenZu(db, ids) {
    if (!ids.length) return new Map();
    const r = await db.prepare('SELECT id, name, display FROM users WHERE id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).all();
    return new Map(r.results.map((u) => [u.id, { name: u.name, anzeige: u.display || u.name }]));
  }
  async function mitglieder(db, game) {
    return (await db.prepare('SELECT user_id, accepted FROM dev_co WHERE game = ?').bind(game).all()).results;
  }
  // Ein Eintrag fürs Frontend. voll = alle Angaben (Besitzer und Mitentwickler, nach Veröffentlichung alle), sonst nur Teaser mit Datum.
  async function zeile(db, g, jetzt, wer, namen) {
    const co = await mitglieder(db, g.id);
    const mit = co.filter((c) => c.accepted).map((c) => c.user_id);
    const n = namen || await namenZu(db, [g.owner_id, ...co.map((c) => c.user_id)]);
    const ich = wer ? wer.id : 0;
    const beteiligt = ich === g.owner_id || mit.includes(ich);
    const live = !g.release || g.release <= jetzt;
    const entw = [g.owner_id, ...mit].map((id) => (n.get(id) || {}).name).filter(Boolean);
    const o = { id: g.id, name: g.title, farbe: g.color, entwickler: entw, release: g.release ? new Date(g.release * 1000).toISOString() : null, dev: true };
    if (!live && !beteiligt) return { ...o, teaser: true };
    return {
      ...o, text: g.text, beschreibung: g.description || g.text, kategorien: lesen(g.tags, []), url: g.url, repo: g.repo || undefined,
      wallpaper: g.banner, screenshots: lesen(g.shots, []), trailer_yt: lesen(g.trailer, []), phase: 'alpha',
      version: g.version || undefined, erschienen: new Date((g.release || g.created) * 1000).toISOString().slice(0, 10),
      aktualisiert: new Date(g.updated * 1000).toISOString().slice(0, 10),
      ...(beteiligt ? { eigen: true, live } : {}),
    };
  }

  // Für den Hub: alle Spiele von Entwicklern (nicht Veröffentlichte nur als Teaser, außer für Beteiligte)
  async function oeffentlich(db, s, jetzt) {
    const gs = (await db.prepare('SELECT * FROM dev_games ORDER BY created').all()).results;
    const ids = new Set(); gs.forEach((g) => ids.add(g.owner_id));
    const co = (await db.prepare('SELECT game, user_id, accepted FROM dev_co').all()).results;
    co.forEach((c) => ids.add(c.user_id));
    const n = await namenZu(db, [...ids]);
    const out = [];
    for (const g of gs) {
      const mit = co.filter((c) => c.game === g.id && c.accepted).map((c) => c.user_id);
      const beteiligt = s.id === g.owner_id || mit.includes(s.id), live = !g.release || g.release <= jetzt;
      const entw = [g.owner_id, ...mit].map((id) => (n.get(id) || {}).name).filter(Boolean);
      const o = { id: g.id, name: g.title, farbe: g.color, entwickler: entw, release: g.release ? new Date(g.release * 1000).toISOString() : null, dev: true };
      if (!live && !beteiligt) { out.push({ ...o, teaser: true }); continue; }
      out.push({
        ...o, text: g.text, beschreibung: g.description || g.text, kategorien: lesen(g.tags, []), url: g.url, wallpaper: g.banner,
        screenshots: lesen(g.shots, []), trailer_yt: lesen(g.trailer, []), phase: 'alpha', version: g.version || undefined,
        erschienen: new Date((g.release || g.created) * 1000).toISOString().slice(0, 10), aktualisiert: new Date(g.updated * 1000).toISOString().slice(0, 10),
        ...(live ? {} : { fruehzugang: true }),
      });
    }
    return antwort({ spiele: out, jetzt });
  }

  // Meine Spiele (Besitzer oder zugestimmter Mitentwickler) und offene Einladungen an mich
  async function meine(db, s, jetzt) {
    const gs = (await db.prepare('SELECT g.* FROM dev_games g WHERE g.owner_id = ?1 OR EXISTS (SELECT 1 FROM dev_co c WHERE c.game = g.id AND c.user_id = ?1 AND c.accepted = 1) ORDER BY g.created').bind(s.id).all()).results;
    const einl = (await db.prepare('SELECT g.id, g.title, g.owner_id, c.invited FROM dev_co c JOIN dev_games g ON g.id = c.game WHERE c.user_id = ? AND c.accepted = 0').bind(s.id).all()).results;
    const spiele = [];
    for (const g of gs) {
      const co = await mitglieder(db, g.id);
      const n = await namenZu(db, [g.owner_id, ...co.map((c) => c.user_id)]);
      const z = await zeile(db, g, jetzt, s, n);
      spiele.push({
        ...z, ich_besitzer: g.owner_id === s.id, besitzer: (n.get(g.owner_id) || {}).name, shots: lesen(g.shots, []), trailer: lesen(g.trailer, []), banner: g.banner,
        mitentwickler: co.map((c) => ({ name: (n.get(c.user_id) || {}).name, zugestimmt: !!c.accepted })), release_unix: g.release,
      });
    }
    const n2 = await namenZu(db, einl.map((e) => e.owner_id));
    return antwort({ spiele, einladungen: einl.map((e) => ({ spiel: e.id, titel: e.title, von: (n2.get(e.owner_id) || {}).name })), max: MAX_SPIELE });
  }

  /* ---------- Prüfen der Eingaben ---------- */
  async function eingabe(db, b, gid) {
    if (!b || typeof b !== 'object') return { fehler: 'eingabe' };
    const titel = ohneBreaks(sauber(b.titel, 60));
    if ([...titel].length < 2 || [...titel].length > 40) return { fehler: 'titel' };
    const text = ohneBreaks(sauber(b.text, 300));
    if ([...text].length < 5 || [...text].length > 160) return { fehler: 'text' };
    const beschr = sauber(b.beschreibung, 4100).replace(/\r/g, '');
    if (beschr.length > 4000) return { fehler: 'beschreibung' };
    const tags = [];
    for (const t of Array.isArray(b.tags) ? b.tags : []) {
      const x = ohneBreaks(sauber(t, 40));
      if (!x) continue;
      if ([...x].length < 2 || [...x].length > 20) return { fehler: 'tags' };
      if (!tags.some((y) => y.toLowerCase() === x.toLowerCase())) tags.push(x);
    }
    if (tags.length < 1 || tags.length > TAGS_MAX) return { fehler: 'tags' };
    const banner = httpsUrl(b.banner);
    if (!banner) return { fehler: 'banner' };
    const url = httpsUrl(b.website);
    if (!url) return { fehler: 'website' };
    const host = new URL(url).hostname.toLowerCase();
    if (HUB_HOSTS.some((x) => host === x)) return { fehler: 'website_hub' };
    let repo = null;
    if (b.repo != null && String(b.repo).trim() !== '') {
      repo = String(b.repo).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');
      if (!/^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)) return { fehler: 'repo' };
    }
    const shots = [];
    for (const u of Array.isArray(b.screenshots) ? b.screenshots : []) {
      if (typeof u === 'string' && !u.trim()) continue;
      const x = httpsUrl(u); if (!x) return { fehler: 'screenshots' }; shots.push(x);
    }
    if (shots.length < SHOTS_MIN || shots.length > SHOTS_MAX) return { fehler: 'screenshots' };
    const trailer = [];
    for (const u of Array.isArray(b.trailer) ? b.trailer : []) {
      if (typeof u === 'string' && !u.trim()) continue;
      const id = youtubeId(u); if (!id) return { fehler: 'trailer' }; if (!trailer.includes(id)) trailer.push(id);
    }
    if (trailer.length > TRAILER_MAX) return { fehler: 'trailer' };
    let release = 0;
    if (b.release != null && String(b.release).trim() !== '') {
      const t = Date.parse(String(b.release));
      if (!t) return { fehler: 'release' };
      release = Math.floor(t / 1000);
    }
    const version = b.version == null ? null : ohneBreaks(sauber(b.version, 30)) || null;
    if (version && version.length > 12) return { fehler: 'version' };
    let farbe = typeof b.farbe === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.farbe) ? b.farbe.toLowerCase() : null;
    const mit = [];
    for (const n of Array.isArray(b.mitentwickler) ? b.mitentwickler : []) {
      const x = String(n || '').trim().replace(/^@/, '').normalize('NFC').toLowerCase();
      if (!x) continue;
      if (!mit.includes(x)) mit.push(x);
    }
    if (mit.length > MAX_MIT) return { fehler: 'mitentwickler' };
    return { w: { titel, text, beschr: beschr || null, tags, banner, url, repo, shots, trailer, release, version, farbe, mit } };
  }

  async function freieId(db, env, request, titel, gamesIds) {
    let basis = slug(titel);
    if (!basis || RESERVIERT.has(basis) || !ID_RE.test(basis)) basis = 'spiel-' + Math.random().toString(36).slice(2, 7);
    for (let i = 0; i < 50; i++) {
      const id = i ? basis.slice(0, 36) + '-' + (i + 1) : basis;
      if (gamesIds.has(id) || RESERVIERT.has(id)) continue;
      if (!(await db.prepare('SELECT 1 AS x FROM dev_games WHERE id = ?').bind(id).first())) return id;
    }
    return 'spiel-' + Math.random().toString(36).slice(2, 10);
  }

  // Namen der Mitentwickler in Konten auflösen (vor dem Speichern, damit bei einem Fehler nichts halb angelegt wird)
  async function mitAufloesen(db, ownerId, namen) {
    const ids = [];
    for (const lc of namen) {
      const u = await db.prepare('SELECT id FROM users WHERE name_lc = ?').bind(lc).first();
      if (!u) return { fehler: 'mitentwickler_unbekannt', name: lc };
      if (u.id === ownerId) return { fehler: 'mitentwickler_selbst' };
      ids.push(u.id);
    }
    return { ids };
  }
  async function mitSetzen(db, game, will, jetzt) {
    const alt = new Map((await mitglieder(db, game)).map((c) => [c.user_id, c.accepted]));
    const st = [];
    for (const [id] of alt) if (!will.includes(id)) st.push(db.prepare('DELETE FROM dev_co WHERE game = ? AND user_id = ?').bind(game, id));
    for (const id of will) if (!alt.has(id)) st.push(db.prepare('INSERT INTO dev_co (game, user_id, accepted, invited) VALUES (?, ?, 0, ?)').bind(game, id, jetzt));
    if (st.length) await db.batch(st);
  }

  async function speichern(request, env, db, s, jetzt, id, gamesIds) {
    const { b, zuGross } = await lies(request);
    if (zuGross) return fehler(413, 'zu_gross');
    const ek = 'dw:' + s.id;
    const warte = await gesperrt(db, ek, jetzt);
    if (warte) return fehler(429, 'zu_viele', { warte });
    const e = await eingabe(db, b);
    if (e.fehler) return fehler(400, e.fehler);
    const w = e.w;
    const mit = await mitAufloesen(db, s.id, w.mit);
    if (mit.fehler) return fehler(400, mit.fehler, mit.name ? { name: mit.name } : undefined);
    await zaehle(db, ek, jetzt, 60, 600, 3600);
    if (!id) {
      const n = await db.prepare('SELECT COUNT(*) AS n FROM dev_games WHERE owner_id = ?').bind(s.id).first();
      if (n.n >= MAX_SPIELE) return fehler(400, 'zu_viele_spiele');
      id = await freieId(db, env, request, w.titel, gamesIds);
      const farbe = w.farbe || FARBEN[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % FARBEN.length];
      await db.prepare('INSERT INTO dev_games (id, owner_id, title, text, description, tags, banner, url, repo, color, release, version, shots, trailer, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, s.id, w.titel, w.text, w.beschr, JSON.stringify(w.tags), w.banner, w.url, w.repo, farbe, w.release, w.version, JSON.stringify(w.shots), JSON.stringify(w.trailer), jetzt, jetzt).run();
    } else {
      const g = await db.prepare('SELECT owner_id, color FROM dev_games WHERE id = ?').bind(id).first();
      if (!g) return fehler(404, 'unbekannt');
      if (g.owner_id !== s.id) return fehler(403, 'nur_besitzer');
      await db.prepare('UPDATE dev_games SET title = ?, text = ?, description = ?, tags = ?, banner = ?, url = ?, repo = ?, color = ?, release = ?, version = ?, shots = ?, trailer = ?, updated = ? WHERE id = ?')
        .bind(w.titel, w.text, w.beschr, JSON.stringify(w.tags), w.banner, w.url, w.repo, w.farbe || g.color, w.release, w.version, JSON.stringify(w.shots), JSON.stringify(w.trailer), jetzt, id).run();
    }
    await mitSetzen(db, id, mit.ids, jetzt);
    return antwort({ ok: true, id });
  }

  async function loeschen(db, s, id) {
    const g = await db.prepare('SELECT owner_id FROM dev_games WHERE id = ?').bind(id).first();
    if (!g) return fehler(404, 'unbekannt');
    if (g.owner_id !== s.id) return fehler(403, 'nur_besitzer');
    await db.batch([
      db.prepare('DELETE FROM dev_games WHERE id = ?').bind(id), db.prepare('DELETE FROM dev_co WHERE game = ?').bind(id),
      db.prepare('DELETE FROM spiel_tag WHERE game = ?').bind(id),
    ]);
    return antwort({ ok: true });
  }

  // Einladung annehmen/ablehnen; ein zugestimmter Mitentwickler kann auch wieder austreten (ablehnen)
  async function einladung(db, s, id, ja) {
    const c = await db.prepare('SELECT accepted FROM dev_co WHERE game = ? AND user_id = ?').bind(id, s.id).first();
    if (!c) return fehler(404, 'unbekannt');
    if (ja) { if (c.accepted) return antwort({ ok: true }); await db.prepare('UPDATE dev_co SET accepted = 1 WHERE game = ? AND user_id = ?').bind(id, s.id).run(); }
    else await db.prepare('DELETE FROM dev_co WHERE game = ? AND user_id = ?').bind(id, s.id).run();
    return antwort({ ok: true });
  }

  /* ---------- Statistik (nur Summen, nie einzelne Konten) ---------- */
  const tagStr = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
  async function statistik(db, s, id, jetzt) {
    const g = await db.prepare('SELECT owner_id, created, release FROM dev_games WHERE id = ?').bind(id).first();
    if (!g) return fehler(404, 'unbekannt');
    const darf = g.owner_id === s.id || await db.prepare('SELECT 1 AS x FROM dev_co WHERE game = ? AND user_id = ? AND accepted = 1').bind(id, s.id).first();
    if (!darf) return fehler(403, 'nicht_beteiligt');
    const tag = Math.floor(jetzt / 86400);
    const p = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(seconds), 0) AS s, COALESCE(SUM(seconds >= 900), 0) AS ab15, COALESCE(SUM(seconds < 900), 0) AS u15, COALESCE(SUM(seconds >= 900 AND seconds < 3600), 0) AS b1, COALESCE(SUM(seconds >= 3600 AND seconds < 18000), 0) AS b2, COALESCE(SUM(seconds >= 18000), 0) AS b3, COALESCE(SUM(last >= ?), 0) AS a7, COALESCE(SUM(last >= ?), 0) AS a30 FROM playtime WHERE game = ?')
      .bind(jetzt - 7 * 86400, jetzt - 30 * 86400, id).first();
    const fav = await db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE game = ?').bind(id).first();
    const bw = await db.prepare('SELECT stars, COUNT(*) AS n FROM ratings WHERE game = ? GROUP BY stars').bind(id).all();
    const verteilung = [0, 0, 0, 0, 0]; let summe = 0, anz = 0;
    for (const r of bw.results) { if (r.stars >= 1 && r.stars <= 5) { verteilung[r.stars - 1] = r.n; summe += r.stars * r.n; anz += r.n; } }
    const von = tag - 29;
    const tg = (await db.prepare('SELECT day, COUNT(*) AS n, SUM(seconds) AS s FROM spiel_tag WHERE game = ? AND day >= ? GROUP BY day').bind(id, von).all()).results;
    const map = new Map(tg.map((r) => [r.day, r]));
    const tage = [];
    for (let d = von; d <= tag; d++) { const r = map.get(d); tage.push({ tag: tagStr(d), spieler: r ? r.n : 0, sekunden: r ? r.s : 0 }); }
    const erst = await db.prepare('SELECT MIN(day) AS d FROM spiel_tag WHERE game = ?').bind(id).first();
    // Wiederkehrer: Konten, die an mindestens 2 verschiedenen Tagen gespielt haben (ab Zählbeginn der Tagesstatistik)
    const wk = await db.prepare('SELECT COUNT(*) AS n FROM (SELECT user_id FROM spiel_tag WHERE game = ? GROUP BY user_id HAVING COUNT(*) >= 2)').bind(id).first();
    return antwort({
      spiel: id, veroeffentlicht: !g.release || g.release <= jetzt, release: g.release || null,
      spieler: p.n, aktiv7: p.a7, aktiv30: p.a30, spielzeit: p.s, schnitt: p.n ? Math.round(p.s / p.n) : 0,
      ueber15: p.ab15, gestaffelt: { unter15: p.u15, min15bis60: p.b1, std1bis5: p.b2, ueber5std: p.b3 },
      wiederkehrer: wk.n, favoriten: fav.n, bewertung: { anzahl: anz, schnitt: anz ? Math.round((summe / anz) * 10) / 10 : null, verteilung },
      tage, tageSeit: erst && erst.d != null ? tagStr(erst.d) : null,
    });
  }

  /* ---------- Website prüfen (Hinweis, keine Sperre) ---------- */
  async function hole(url, f, maxByte = 600000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await f(url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'LGH-Pruefung/1', accept: 'text/html,*/*' } });
      const text = r.ok ? (await r.text()).slice(0, maxByte) : '';
      return { r, text };
    } finally { clearTimeout(t); }
  }
  async function pruefen(request, db, s, jetzt, f) {
    const { b } = await lies(request);
    const url = b && httpsUrl(b.website);
    if (!url) return fehler(400, 'website');
    if (HUB_HOSTS.includes(new URL(url).hostname.toLowerCase())) return fehler(400, 'website_hub');
    const k = 'dp:' + s.id; const warte = await gesperrt(db, k, jetzt);
    if (warte) return fehler(429, 'zu_viele', { warte });
    await zaehle(db, k, jetzt, 30, 300, 600);
    const pr = [];
    const add = (id, ok, text, hinweis) => pr.push({ id, ok, text, ...(hinweis ? { hinweis } : {}) });
    let seite;
    try { seite = await hole(url, f); } catch (e) { add('erreichbar', false, 'Die Seite antwortet nicht (oder zu langsam)'); return antwort({ pruefungen: pr }); }
    if (!seite.r.ok) { add('erreichbar', false, 'Die Seite antwortet mit Fehler ' + seite.r.status); return antwort({ pruefungen: pr }); }
    add('erreichbar', true, 'Seite erreichbar (https)');
    const xfo = (seite.r.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (seite.r.headers.get('content-security-policy') || '').toLowerCase();
    const fa = /frame-ancestors([^;]*)/.exec(csp);
    const erlaubt = (!xfo || xfo.includes('allow')) && (!fa || /\*|hub\.leifps\.de|https:/.test(fa[1]));
    add('einbettbar', erlaubt, erlaubt ? 'Darf im Hub eingebettet werden' : 'Die Seite verbietet das Einbetten (X-Frame-Options oder frame-ancestors) und lässt sich im Hub nicht öffnen');
    const html = seite.text;
    add('viewport', /<meta[^>]+name=["']viewport["']/i.test(html), 'Viewport-Angabe für Handy und Tablet', 'Fehlt: <meta name="viewport" content="width=device-width, initial-scale=1">');
    const sk = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
    const lade = sk.find((x) => /lgh-vorlade/i.test(x)), modul = sk.find((x) => /lgh-modul/i.test(x));
    add('vorlade', !!lade, 'Hub-Anbindung (lgh-vorlade.js, Spielstand bleibt im Hub erhalten)', 'Fehlt: tools/lgh-einbauen.py aus dem Hub-Repo ausführen');
    add('modul', !!modul, 'Einstellungsmenü mit Spielstand-Code (lgh-modul.js)', 'Fehlt: tools/lgh-einbauen.py aus dem Hub-Repo ausführen');
    if (lade) {
      let ton = false;
      try { const j = await hole(new URL(lade, seite.r.url || url).href, f); ton = /ton-bereit/.test(j.text); } catch (e) { /* nicht lesbar */ }
      add('ton', ton, 'Lautstärke lässt sich im Hub regeln (Ton-Block in lgh-vorlade.js)', 'Fehlt: aktuelle tools/lgh-vorlade.js verwenden');
    } else add('ton', false, 'Lautstärke lässt sich im Hub regeln (Ton-Block in lgh-vorlade.js)', 'Erst die Hub-Anbindung einbauen');
    return antwort({ pruefungen: pr });
  }

  /* ---------- Tagesstatistik schreiben (von der Präsenzmeldung aufgerufen) ---------- */
  function tagesStatement(db, uid, spiel, jetzt, sekunden) {
    return db.prepare('INSERT INTO spiel_tag (game, day, user_id, seconds) VALUES (?, ?, ?, ?) ON CONFLICT(game, day, user_id) DO UPDATE SET seconds = seconds + excluded.seconds')
      .bind(spiel, Math.floor(jetzt / 86400), uid, sekunden);
  }

  async function route(request, env, db, s, jetzt, m, pfad, gamesIds, f) {
    if (pfad === '/api/dev/spiele' && m === 'GET') return await oeffentlich(db, s, jetzt);
    if (pfad === '/api/dev/meine' && m === 'GET') return await meine(db, s, jetzt);
    if (pfad === '/api/dev/spiel' && m === 'POST') return await speichern(request, env, db, s, jetzt, null, gamesIds);
    if (pfad === '/api/dev/pruefen' && m === 'POST') return await pruefen(request, db, s, jetzt, f || fetch);
    const x = /^\/api\/dev\/spiel\/([a-z0-9_-]{1,40})(?:\/(einladung|austreten|statistik))?$/.exec(pfad);
    if (x) {
      const id = x[1], u = x[2];
      if (!u && m === 'PUT') return await speichern(request, env, db, s, jetzt, id, gamesIds);
      if (!u && m === 'DELETE') return await loeschen(db, s, id);
      if (u === 'einladung' && m === 'POST') { const { b } = await lies(request); return await einladung(db, s, id, !!(b && b.an)); }
      if (u === 'austreten' && m === 'POST') return await einladung(db, s, id, false);
      if (u === 'statistik' && m === 'GET') return await statistik(db, s, id, jetzt);
    }
    return fehler(404, 'unbekannt');
  }

  // Beim Löschen eines Kontos: eigene Spiele samt Mitentwickler-Einträgen entfernen, Teilnahmen und Tagesstatistik des Kontos löschen
  async function kontoWeg(db, uid) {
    const eigene = (await db.prepare('SELECT id FROM dev_games WHERE owner_id = ?').bind(uid).all()).results;
    const st = [
      db.prepare('DELETE FROM dev_co WHERE user_id = ?').bind(uid), db.prepare('DELETE FROM spiel_tag WHERE user_id = ?').bind(uid),
    ];
    for (const g of eigene) {
      st.push(db.prepare('DELETE FROM dev_co WHERE game = ?').bind(g.id), db.prepare('DELETE FROM spiel_tag WHERE game = ?').bind(g.id));
    }
    st.push(db.prepare('DELETE FROM dev_games WHERE owner_id = ?').bind(uid));
    await db.batch(st);
  }

  // Entwickler-Namen aller (veröffentlichten) Spiele für /api/entwickler und Profile
  async function entwicklerNamen(db, jetzt) {
    const r = await db.prepare('SELECT DISTINCT u.name_lc AS n FROM dev_games g JOIN users u ON u.id = g.owner_id WHERE g.release <= ? UNION SELECT u.name_lc FROM dev_co c JOIN users u ON u.id = c.user_id JOIN dev_games g ON g.id = c.game WHERE c.accepted = 1 AND g.release <= ?').bind(jetzt, jetzt).all();
    return r.results.map((x) => x.n);
  }

  return { route, kontoWeg, tagesStatement, entwicklerNamen };
}
