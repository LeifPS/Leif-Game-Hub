// Datenbank für die Hub-Konten und Cloud-Spielstände (Cloudflare D1, Binding "DB").
// Der Worker führt diese Anweisungen beim ersten Aufruf selbst aus (IF NOT EXISTS), ein manuelles Einspielen ist nicht nötig.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_lc TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    created INTEGER NOT NULL,
    display TEXT,
    device_id TEXT,
    name_changed INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created INTEGER NOT NULL,
    last INTEGER NOT NULL,
    device TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  // Jede Speicherung ist eine neue Version (rev); es bleiben die letzten 5 pro Spiel erhalten.
  `CREATE TABLE IF NOT EXISTS saves (
    user_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    rev INTEGER NOT NULL,
    data TEXT NOT NULL,
    size INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    device TEXT,
    PRIMARY KEY (user_id, game, rev)
  )`,
  // Freundschaften: ein Eintrag pro Paar (a < b), requester hat die Anfrage gestellt
  `CREATE TABLE IF NOT EXISTS friends (
    a INTEGER NOT NULL,
    b INTEGER NOT NULL,
    requester INTEGER NOT NULL,
    status TEXT NOT NULL,
    created INTEGER NOT NULL,
    PRIMARY KEY (a, b)
  )`,
  `CREATE INDEX IF NOT EXISTS friends_b ON friends(b)`,
  // Wer ist gerade in welchem Spiel (nur für Freunde sichtbar); seen = letzter Herzschlag des Hubs
  `CREATE TABLE IF NOT EXISTS presence (
    user_id INTEGER PRIMARY KEY,
    game TEXT,
    raum TEXT,
    seen INTEGER NOT NULL
  )`,
  // Spielzeit pro Spiel (aus den Herzschlägen des Hubs), last = letzter Herzschlag in diesem Spiel
  `CREATE TABLE IF NOT EXISTS playtime (
    user_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    seconds INTEGER NOT NULL DEFAULT 0,
    last INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
  )`,
  // Chat unter Freunden: ein Eintrag pro Nachricht, (a, b) ist das Freundespaar (a < b) wie in friends, sender ist einer von beiden.
  // Es bleiben die letzten 500 Nachrichten pro Paar; beim Entfernen der Freundschaft und beim Löschen eines Kontos verschwinden sie.
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    a INTEGER NOT NULL,
    b INTEGER NOT NULL,
    sender INTEGER NOT NULL,
    text TEXT NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_paar ON messages(a, b, id)`,
  // Bis zu welcher Nachricht user_id den Chat mit other gelesen hat (alles danach von other zählt als ungelesen)
  `CREATE TABLE IF NOT EXISTS chat_read (
    user_id INTEGER NOT NULL,
    other INTEGER NOT NULL,
    last_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, other)
  )`,
  // Favoriten: Spiele, die ein Konto oben in der Bibliothek haben möchte (geräteübergreifend)
  `CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    created INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
  )`,
  // Bewertungen: ein Konto gibt einem Spiel 1 bis 5 Sterne (nur Sterne, keine Texte); Antippen derselben Zahl nimmt sie zurück
  `CREATE TABLE IF NOT EXISTS ratings (
    user_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    stars INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
  )`,
  `CREATE INDEX IF NOT EXISTS ratings_game ON ratings(game)`,
  // Chat-Gruppen (siehe src/gruppen.js): Gruppe, Mitglieder (last_read = bis zu welcher Nachricht gelesen) und Nachrichten
  `CREATE TABLE IF NOT EXISTS chat_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner INTEGER NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined INTEGER NOT NULL,
    last_read INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS chat_group_members_user ON chat_group_members(user_id)`,
  `CREATE TABLE IF NOT EXISTS chat_group_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    sender INTEGER NOT NULL,
    text TEXT NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS chat_group_messages_gruppe ON chat_group_messages(group_id, id)`,
  // Hub-Währung und Zusatzinhalte (DLCs), siehe src/dlc.js
  `CREATE TABLE IF NOT EXISTS wallet (
    user_id INTEGER PRIMARY KEY,
    amount INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    grund TEXT NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS dlc_owned (
    user_id INTEGER NOT NULL,
    dlc TEXT NOT NULL,
    price INTEGER NOT NULL,
    bought INTEGER NOT NULL,
    PRIMARY KEY (user_id, dlc)
  )`,
  // Zähler gegen Raten von Passwörtern und Massenanmeldungen
  `CREATE TABLE IF NOT EXISTS limits (
    k TEXT PRIMARY KEY,
    n INTEGER NOT NULL,
    until INTEGER NOT NULL,
    t INTEGER NOT NULL
  )`,
];
