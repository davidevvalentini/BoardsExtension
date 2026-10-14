// Dai segnalibri (albero di Chrome o file HTML) a un piano: pagine → board → link.
// La logica è pura (niente chrome.*), così si prova da sola; il piano viene scritto altrove solo alla conferma.
import { classify, CATEGORIES, THRESHOLD, INBOX } from './classify.js';
import { urlKey, safeUrl, hostOf } from './store.js';

export const MAX_BOARD = 25;
const LIMITS = { page: 40, board: 60, title: 200 };

const isWeb = (u) => /^https?:/i.test(u);

/* ——— Lettura ——— */
export function treeToItems(tree) {
  const items = [];
  const walk = (node, path) => {
    for (const c of node.children || []) {
      if (c.url) {
        if (isWeb(c.url)) items.push({ url: c.url, title: c.title || '', path });
      } else walk(c, [...path, c.title || '']);
    }
  };
  for (const root of tree || []) for (const top of root.children || []) walk(top, []);
  return items;
}

// Formato Netscape (lo esportano Chrome, Edge, Firefox e Safari). Restituisce null se non sembra un export.
export function htmlToItems(text, parse = (t) => new DOMParser().parseFromString(t, 'text/html')) {
  const doc = parse(text);
  const root = doc.querySelector('dl');
  if (!root) return null;
  const items = [];
  // Ogni <DT> contiene o un link, o un titolo di cartella (H3) seguito dal suo <DL>.
  const walk = (dl, path, top) => {
    for (const dt of dl.children) {
      if (dt.tagName !== 'DT') continue;
      const kids = [...dt.children];
      const h3 = kids.find((c) => c.tagName === 'H3');
      if (h3) {
        const sub = kids.find((c) => c.tagName === 'DL');
        if (!sub) continue;
        const title = (h3.textContent || '').trim();
        // Barra dei preferiti e «Altri preferiti» sono contenitori: non diventano pagine.
        if (top && (h3.hasAttribute('personal_toolbar_folder') || h3.hasAttribute('unfiled_bookmarks_folder'))) walk(sub, [], false);
        else walk(sub, [...path, title], false);
        continue;
      }
      const a = kids.find((c) => c.tagName === 'A');
      const href = a?.getAttribute('href') || '';
      if (isWeb(href)) items.push({ url: href, title: (a.textContent || '').trim(), path });
    }
  };
  walk(root, [], true);
  return items;
}

/* ——— Piano ——— */
const clip = (s, n, fallback) => {
  const t = String(s ?? '').trim().slice(0, n).trim();
  return t || fallback;
};

export function splitLong(board, max = MAX_BOARD) {
  if (board.links.length <= max) return [board];
  const parts = Math.ceil(board.links.length / max);
  const out = [];
  for (let i = 0; i < parts; i++) {
    const suffix = ` (${i + 1})`;
    out.push({ name: clip(board.name, LIMITS.board - suffix.length, 'Senza nome') + suffix, links: board.links.slice(i * max, (i + 1) * max) });
  }
  return out;
}

export function buildPlan(items, { structure = 'folders', rules = [], threshold = THRESHOLD, maxBoard = MAX_BOARD } = {}) {
  const seen = new Set();
  let dropped = 0;
  const pages = new Map(); // nome pagina → Map(nome board → link[])
  const put = (page, board, link) => {
    const pn = clip(page, LIMITS.page, 'Senza nome');
    const bn = clip(board, LIMITS.board, 'Senza nome');
    if (!pages.has(pn)) pages.set(pn, new Map());
    const boards = pages.get(pn);
    if (!boards.has(bn)) boards.set(bn, []);
    boards.get(bn).push(link);
  };

  for (const it of items) {
    const url = isWeb(it.url) ? safeUrl(it.url) : '';
    if (!url) { dropped++; continue; }
    const key = urlKey(url);
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key);
    const title = clip(it.title, LIMITS.title, hostOf(url));
    const path = (it.path || []).map((p) => String(p ?? '').trim());
    const link = { url, title };

    if (structure === 'inbox') { put(INBOX, INBOX, { ...link, why: 'da smistare', score: 0 }); continue; }
    if (structure === 'folders' && path.length) {
      put(path[0], path[1] ?? path[0], { ...link, why: 'cartella d’origine', score: 1 });
      continue;
    }
    const extra = structure === 'template' ? ` ${path.join(' ')}` : '';
    const r = classify({ url, title: `${title}${extra}`, path }, rules);
    if (r.score >= threshold) put(r.page, r.board, { ...link, why: r.why, score: r.score });
    else put(INBOX, INBOX, { ...link, why: r.why, score: r.score });
  }

  const order = (name) => (name === INBOX ? 1000 : structure === 'template' && CATEGORIES.includes(name) ? CATEGORIES.indexOf(name) : 500);
  const out = [...pages.entries()]
    .map(([name, boards], i) => ({ name, i, boards: [...boards.entries()].flatMap(([bn, links]) => splitLong({ name: bn, links }, maxBoard)) }))
    .sort((a, b) => order(a.name) - order(b.name) || a.i - b.i)
    .map(({ name, boards }) => ({ name, boards }));
  return { pages: out, dropped };
}
