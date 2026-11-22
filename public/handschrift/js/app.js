// Start der App: Zustand, Gerüst, Ansichten
import { startSession } from './session.js';
import { h, uid } from './util.js';
import { ic, mark } from './ui.js';
import { Font, DEF } from './render.js';
import { dbAll, dbPut, kvGet, kvSet, persist, aenderungsHoerer } from './store.js';
import { initSync } from './sync.js';
import { editorView } from './editor.js';
import { fontsView } from './fonts.js';
import { docsView } from './docs.js';
import { moreView } from './more.js';

const app = {
  folders: [], folder: null,
  async saveFolders() { await kvSet('folders', this.folders); aenderungsHoerer.forEach((f) => f()); },
  // Der Abgleich hat Änderungen von einem anderen Gerät eingespielt
  async syncApplied() {
    this.folders = await kvGet('folders', []); await this.loadFonts(); this.fontCache.clear(); await this.loadDocs();
    if (!this.fonts.find((f) => f.id === this.fontId)) this.fontId = this.fonts[0].id;
    if (this.doc) { const n = this.docs.find((d) => d.id === this.doc.id); if (!n) { this.doc = null; if (this.view === 'write') this.show('docs'); } else if ((n.updated || 0) > (this.doc.updated || 0)) { this.doc = n; await this.views.write.load(n); } else this.doc = n; }
    for (const k of ['docs', 'fonts', 'more']) this.views[k].refresh && this.views[k].refresh();
  },
  folderOf(id) { return this.folders.find((f) => f.id === id) || null; },
  fonts: [], fontId: 'leif', fontCache: new Map(), docs: [], doc: null, view: 'write', theme: 'auto', installPrompt: null, swState: 'pending', views: {},
  async getFont(id) {
    id = this.fonts.find(f => f.id === id) ? id : this.fonts[0].id;
    if (!this.fontCache.has(id)) { const rec = this.fonts.find(f => f.id === id), f = new Font(rec); f.name = rec.name; f.id = id; this.fontCache.set(id, f.load().then(() => f)); }
    return this.fontCache.get(id);
  },
  setFont(id, quiet) { this.fontId = id; kvSet('fontId', id); if (!quiet && this.doc) { this.doc.fontId = id; dbPut('docs', this.doc); } this.views.write.refresh(); },
  refreshFontLabel() { this.fontCache.clear(); this.views.write.refresh(); },
  async loadFonts() {
    let builtin = this._builtin;
    if (!builtin) { const d = await (await fetch('data/leif.json')).json(); builtin = this._builtin = { id: 'leif', name: 'always * forever (Beispiel)', builtin: true, meta: d.meta, g: d.g, packs: ['standard', 'sonder', 'mathe', 'franz'], updated: 0 }; }
    const mine = (await dbAll('fonts')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    this.fonts = [...mine, builtin];
  },
  async fontSaved(rec) { persist(); this.fontCache.delete(rec.id); await this.loadFonts(); this.fontId = rec.id; kvSet('fontId', rec.id); if (this.doc) { this.doc.fontId = rec.id; dbPut('docs', this.doc); } this.views.fonts.refresh(); await this.views.write.refresh(); this.show(this.doc ? 'write' : 'docs'); },
  async fontsChanged() { await this.loadFonts(); if (!this.fonts.find(f => f.id === this.fontId)) this.fontId = this.fonts[0].id; this.fontCache.clear(); this.views.write.refresh(); },
  async loadDocs() { this.docs = (await dbAll('docs')).sort((a, b) => (b.updated || 0) - (a.updated || 0)); },
  docSaved(d) { const i = this.docs.findIndex(x => x.id === d.id); if (i < 0) this.docs.unshift(d); else this.docs[i] = d; this.docs.sort((a, b) => (b.updated || 0) - (a.updated || 0)); },
  async newDoc(o = {}) {
    const last = await kvGet('lastS', {}), now = Date.now();
    const folder = o.folder !== undefined ? o.folder : this.folder, fv = (this.folderOf(folder) || {}).s || {};   // Vorgaben des Ordners (z. B. kariert für Mathe)
    const d = { id: uid(), title: 'Neues Dokument', text: '', fontId: this.fontId, created: now, updated: now, ...o, folder: folder || null, s: { ...DEF, ...last, ...fv, ...(o.s || {}) } };
    if (!o.id) d.id = uid(); await dbPut('docs', d); this.docSaved(d); return d;
  },
  async openDoc(id) { const d = this.docs.find(x => x.id === id); if (!d) return; this.doc = d; d.opened = Date.now(); dbPut('docs', d); kvSet('docId', id); if (d.fontId && this.fonts.find(f => f.id === d.fontId)) this.fontId = d.fontId; await this.views.write.load(d); this.show('write'); },
  async docsChanged(deletedId) { await this.loadDocs(); if (this.doc && this.doc.id === deletedId) this.doc = null; if (!this.docs.length) await this.newDoc({ title: 'Willkommen', text: WELCOME, fontId: this.fontId }); },
  async wipe() { for (const n of ['fonts', 'docs', 'kv']) { for (const r of await dbAll(n)) await (await import('./store.js')).dbDel(n, r.id || r.k); } if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); if (self.caches) for (const k of await caches.keys()) await caches.delete(k); location.reload(); },
  setTheme(t) { this.theme = t; kvSet('theme', t); applyTheme(t); },
  show(v) {
    this.view = v;
    for (const [k, el] of Object.entries(viewEls)) el.classList.toggle('on', k === v);
    const nv = v === 'write' ? 'docs' : v;   // das Schreiben gehört zu „Dokumente“
    for (const b of document.querySelectorAll('[data-nav]')) { b.classList.toggle('on', b.dataset.nav === nv); b.setAttribute('aria-current', b.dataset.nav === nv ? 'page' : 'false'); }
    if (v !== 'write') this.views[v].refresh && this.views[v].refresh();
    else this.views.write.refresh();
  },
};
const viewEls = {};
function applyTheme(t) {
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#16171b' : '#ffffff';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(app.theme));

const NAV = [['docs', 'Dokumente', 'folder'], ['fonts', 'Schriften', 'type'], ['more', 'Mehr', 'more']];
const WELCOME = `# Hallo!
Das hier ist noch die Beispielschrift „always * forever“ von Brittney Murphy. Unter ==Schriften== machst du in wenigen Minuten deine eigene.

- Text links tippen oder einfügen, rechts siehst du das Ergebnis
- Hochzahlen gehen so: x^2 + y^3
- Für GoodNotes: oben auf [rot]Exportieren[/] und „GoodNotes: echte Striche“ wählen

Viel Spaß beim Schreiben!`;

async function boot() {
  const root = document.getElementById('app');
  app.theme = await kvGet('theme', 'auto'); applyTheme(app.theme);
  await app.loadFonts(); await app.loadDocs(); app.folders = await kvGet('folders', []);
  app.fontId = await kvGet('fontId', app.fonts[0].id); if (!app.fonts.find(f => f.id === app.fontId)) app.fontId = app.fonts[0].id;
  app.views.write = editorView(app); app.views.fonts = fontsView(app); app.views.docs = docsView(app); app.views.more = moreView(app);
  const nav = (cls) => NAV.map(([k, t, i]) => h('button', { type: 'button', class: cls, dataset: { nav: k }, onclick: () => app.show(k) }, ic(i), h('span', null, t)));
  const side = h('nav', { class: 'side', 'aria-label': 'Hauptmenü' }, h('div', { class: 'brand' }, mark(32), 'STools'), ...nav('navb'), h('div', { class: 'sp' }), h('p', { class: 'xs mut', style: { margin: '8px' } }, 'Alles bleibt auf deinem Gerät'));
  const main = h('main', { class: 'main' });
  for (const k of ['write', 'fonts', 'docs', 'more']) { const v = h('div', { class: 'view' }); v.append(app.views[k].el); viewEls[k] = v; main.append(v); }
  root.append(h('div', { class: 'shell' }, side, main, h('nav', { class: 'tabs', 'aria-label': 'Hauptmenü' }, ...nav('tab'))));
  // Dokument öffnen oder Willkommens-Dokument anlegen
  const lastId = await kvGet('docId', null);
  let d = app.docs.find(x => x.id === lastId) || app.docs[0];
  if (!d) d = await app.newDoc({ title: 'Willkommen', text: WELCOME, fontId: app.fontId });
  app.doc = d; await app.views.write.load(d); app.show('docs');
  { const bt = document.getElementById('boot'); if (bt) { bt.style.transition = 'opacity .25s'; bt.style.opacity = '0'; setTimeout(() => bt.remove(), 280); } }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); app.installPrompt = e; if (app.view === 'more') app.views.more.refresh(); });
  window.addEventListener('online', () => app.view === 'more' && app.views.more.refresh()); window.addEventListener('offline', () => app.view === 'more' && app.views.more.refresh());
  registerSw(); startSession(); initSync(app);
  if (app.fonts.some((f) => !f.builtin)) persist();   // Browser bitten, die Daten nicht von selbst zu löschen (still, ohne Nachfrage)
  for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, e => e.preventDefault(), { passive: false });   // iOS: kein Pinch-Zoom
  window.__app = app;
}
function registerSw() {
  if (!('serviceWorker' in navigator)) { app.swState = 'unsupported'; return; }
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'ready') { app.swState = 'ready'; if (app.view === 'more') app.views.more.refresh(); } });
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
    const check = () => { if (reg.active) reg.active.postMessage({ type: 'status' }); };
    if (reg.active) check(); navigator.serviceWorker.ready.then(check);
  }).catch(() => { app.swState = 'unsupported'; });
}
boot().catch(e => { console.error(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Die App konnte nicht starten: ' + e.message; });
