// Minimaler D1-Ersatz auf Basis von node:sqlite, damit die echten SQL-Statements getestet werden
import { DatabaseSync } from 'node:sqlite';

const norm = (args) => args.map((a) => (a === undefined ? null : a));

function statement(db, sql, args = []) {
  return {
    bind: (...a) => statement(db, sql, norm(a)),
    async run() {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes) } };
    },
    async all() {
      return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })) };
    },
    async first(col) {
      const row = db.prepare(sql).get(...args);
      if (!row) return null;
      return col ? row[col] : { ...row };
    },
    _exec: () => db.prepare(sql).run(...args),
  };
}

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  // Schema kommt aus src/schema.js (der Worker legt es beim ersten Aufruf selbst an); hier bewusst nicht vorab angelegt
  return {
    prepare: (sql) => statement(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => ({ success: true, meta: { changes: Number(s._exec().changes) } }));
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    raw: db,
  };
}
