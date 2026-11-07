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
  // Zähler gegen Raten von Passwörtern und Massenanmeldungen
  `CREATE TABLE IF NOT EXISTS limits (
    k TEXT PRIMARY KEY,
    n INTEGER NOT NULL,
    until INTEGER NOT NULL,
    t INTEGER NOT NULL
  )`,
];
