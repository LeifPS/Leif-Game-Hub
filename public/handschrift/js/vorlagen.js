// Vorlagenbibliothek: Sheet mit Kacheln (Vorschau der ersten Seite in deiner Handschrift). Tippen = neues Dokument.
import { h, toast } from './util.js';
import { sheet, chips } from './ui.js';
import { layout, drawPage, ensureImages, DEF } from './render.js';
import { TEMPLATES, TEMPLATE_CATS } from './templates.js';

export function openTemplates(app) {
  let cat = 'alle';
  const cache = new Map();
  sheet('Vorlagen', (body, api) => {
    const hint = h('p', { class: 'mut sm', style: { margin: '0 0 10px' } }, 'Eine Vorlage ist ein fertig gesetztes Blatt in deiner Handschrift. Öffne sie als neues Dokument und ändere den Text, deine Vorlage bleibt unverändert.');
    const grid = h('div', { class: 'dgrid' });
    let chain = Promise.resolve();
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); chain = chain.then(() => paint(e.target)).catch(() => {}); } }, { root: body, rootMargin: '200px' });
    async function paint(box) {
      const t = TEMPLATES.find(x => x.id === box.dataset.id); if (!t || !box.isConnected) return;
      let cv = cache.get(t.id);
      if (!cv) {
        const font = await app.getFont(app.fontId), S = { ...DEF, ...t.s };
        await font.prepare(t.text.slice(0, 3000) + ' •');
        const L = layout(t.text.slice(0, 3000), S, font), ent = L.pages[0] || [];
        await ensureImages(ent);
        cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block';
        drawPage(cv, ent, L, S, .4, false); cache.set(t.id, cv);
      }
      if (box.isConnected) box.replaceChildren(cv);
    }
    async function use(t) {
      const d = await app.newDoc({ title: t.title, text: t.text, fontId: app.fontId, s: t.s });
      api.close(); await app.openDoc(d.id); toast('Vorlage „' + t.title + '“ geöffnet');
    }
    function draw() {
      grid.replaceChildren(...TEMPLATES.filter(t => cat === 'alle' || t.cat === cat).map(t => {
        const prev = h('div', { class: 'dprev', dataset: { id: t.id }, style: { aspectRatio: '948 / 1226' } });
        const c = cache.get(t.id); if (c) prev.append(c); else { prev.append(h('span', { class: 'dtxt' }, t.text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').slice(0, 80))); io.observe(prev); }
        return h('div', { class: 'dcard', role: 'button', tabindex: 0, onclick: () => use(t), onkeydown: (e) => { if (e.key === 'Enter') use(t); } }, prev,
          h('div', { class: 'dtitle' }, h('b', null, t.title)), h('span', { class: 'xs mut' }, t.desc));
      }));
    }
    body.append(hint, h('div', { style: { margin: '0 0 10px', overflowX: 'auto' } }, chips(TEMPLATE_CATS, () => cat, (v) => { cat = v; draw(); })), grid);
    draw();
  }, { wide: true });
}
