import { IMAGES, GRADIENTS, HIGHLIGHTS, imageUrl, imagePage } from './catalog.js';
import {
  uid, safeUrl, load, save, onChange, hostOf, faviconUrl, sanitizeState, sanitizeSettings, defaultSettings,
  countLinks, snapshotIfDue, listSnapshots, putFile, getFile, delFile
} from './store.js';
import { applyTheme } from './theme.js';
import { h, icon, toast, openMenu, askText, askLink, askBoard, askConfirm, askReminder, openModal } from './ui.js';
import { mountSettings } from './settings.js';
import { openWorkspaces } from './workspaces.js';

const $ = (id) => document.getElementById(id);
const el = {
  tabs: $('tabs'), grid: $('grid'), search: $('search'), privacy: $('privacy'), clock: $('clock'),
  greeting: $('greeting'), date: $('date'), file: $('file'), photo: $('photo'), bookmarks: $('bm-file'), bg: $('bg'), bgImg: $('bg-img'), credit: $('credit')
};

let state;
let lastJson = '';
let drag = null; // { type: 'link'|'board', ... }
let saveTimer;
const iconOK = new Set(); // favicon già caricate: niente sfarfallio ai ridisegni

const curPage = () => state.pages.find((p) => p.id === state.activePage) || state.pages[0];
const allBoards = () => state.pages.flatMap((p) => p.boards);
const wsPages = () => state.pages.filter((p) => p.ws === state.activeWorkspace);
const curWs = () => state.workspaces.find((w) => w.id === state.activeWorkspace) || state.workspaces[0];
const palette = () => state.settings.boardColors;

/* ——— Salvataggio ——— */
async function commit() {
  lastJson = JSON.stringify(state);
  await save(state);
  render();
}
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { lastJson = JSON.stringify(state); save(state); }, 250);
}

/* ——— Pagine ——— */
async function addPage() {
  const name = await askText({ title: 'Nuova pagina', label: 'Nome', ok: 'Crea' });
  if (!name) return;
  const page = { id: uid(), ws: state.activeWorkspace, name, boards: [] };
  state.pages.push(page);
  state.activePage = page.id;
  await commit();
}
async function renamePage(page) {
  const name = await askText({ title: 'Rinomina pagina', label: 'Nome', value: page.name });
  if (!name) return;
  page.name = name;
  await commit();
}
async function deletePage(page) {
  if (wsPages().length === 1) { toast('Serve almeno una pagina in questo workspace.'); return; }
  const n = page.boards.reduce((a, b) => a + b.links.length, 0);
  const ok = await askConfirm({ title: `Eliminare «${page.name}»?`, text: `Verranno eliminate ${page.boards.length} board e ${n} link.` });
  if (!ok) return;
  state.pages = state.pages.filter((p) => p !== page);
  state.activePage = wsPages()[0].id;
  await commit();
}
// Cambio pagina senza ridisegnare le schede: il doppio clic per rinominare resta affidabile.
function setActivePage(id) {
  if (state.activePage === id) return;
  state.activePage = id;
  curWs().lastPage = id;
  el.tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.page === id)));
  renderGrid();
  persistSoon();
}

/* ——— Workspace ——— */
function switchWorkspace(id) {
  const w = state.workspaces.find((x) => x.id === id);
  if (!w || id === state.activeWorkspace) return;
  state.activeWorkspace = id;
  const mine = wsPages();
  state.activePage = (mine.find((p) => p.id === w.lastPage) || mine[0]).id;
  el.search.value = '';
  commit();
}
async function addWorkspace({ name, emoji }) {
  const w = { id: uid(), name, emoji };
  const page = { id: uid(), ws: w.id, name: 'Principale', boards: [] };
  state.workspaces.push(w);
  state.pages.push(page);
  await commit();
  toast(`Workspace «${name}» creato.`, { label: 'Passa a', run: () => switchWorkspace(w.id) });
}
async function renameWorkspace(id) {
  const w = state.workspaces.find((x) => x.id === id);
  if (!w) return;
  const name = await askText({ title: 'Rinomina workspace', label: 'Nome', value: w.name });
  if (!name) return;
  w.name = name.slice(0, 30);
  await commit();
}
async function removeWorkspace(id) {
  const w = state.workspaces.find((x) => x.id === id);
  if (!w || state.workspaces.length === 1) return false;
  const mine = state.pages.filter((p) => p.ws === id);
  const n = mine.reduce((a, p) => a + p.boards.reduce((b, x) => b + x.links.length, 0), 0);
  const ok = await askConfirm({ title: `Eliminare «${w.name}»?`, text: `Verranno eliminate ${mine.length} ${mine.length === 1 ? 'pagina' : 'pagine'} e ${n} link.` });
  if (!ok) return false;
  state.pages = state.pages.filter((p) => p.ws !== id);
  state.workspaces = state.workspaces.filter((x) => x.id !== id);
  if (state.activeWorkspace === id) {
    state.activeWorkspace = state.workspaces[0].id;
    state.activePage = wsPages()[0].id;
  }
  await commit();
  return true;
}
function renderWs() {
  const w = curWs();
  $('ws-btn').replaceChildren(h('span', { class: 'ws-emoji', 'aria-hidden': 'true' }, w.emoji), h('span', { class: 'ws-label' }, w.name), icon('chevron', 16));
  $('ws-btn').setAttribute('aria-label', `Workspace: ${w.name}`);
  $('ws-btn').hidden = false;
}

function pageToWsMenu(anchor, page) {
  const items = state.workspaces.filter((w) => w.id !== page.ws).map((w) => ({ label: `${w.emoji} ${w.name}`, run: () => movePageToWs(page, w.id) }));
  openMenu(anchor, items);
}
async function movePageToWs(page, wsId) {
  if (wsPages().length === 1) { toast('Serve almeno una pagina in questo workspace.'); return; }
  const w = state.workspaces.find((x) => x.id === wsId);
  if (!w) return;
  page.ws = wsId;
  if (state.activePage === page.id) state.activePage = wsPages()[0].id;
  await commit();
  toast(`Pagina «${page.name}» spostata in ${w.emoji} ${w.name}.`);
}

/* ——— Board ——— */
async function addBoard() {
  const used = curPage().boards.length;
  const r = await askBoard({ title: 'Nuova board', palette: palette(), color: palette()[used % palette().length], ok: 'Crea' });
  if (!r) return;
  curPage().boards.push({ id: uid(), name: r.name, color: r.color, links: [] });
  await commit();
}
async function editBoard(board) {
  if (isLocked(board)) return;
  const r = await askBoard({ title: 'Modifica board', palette: palette(), name: board.name, color: board.color });
  if (!r) return;
  board.name = r.name;
  board.color = r.color;
  await commit();
}
async function deleteBoard(page, board) {
  if (isLocked(board)) return;
  const ok = await askConfirm({ title: `Eliminare «${board.name}»?`, text: `Verranno eliminati ${board.links.length} link.` });
  if (!ok) return;
  page.boards = page.boards.filter((b) => b !== board);
  await commit();
}
async function sortBoard(board) {
  if (isLocked(board)) return;
  board.links.sort((a, b) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' }));
  await commit();
}
async function openAll(board) {
  if (!board.links.length) return;
  if (board.links.length > 10) {
    const ok = await askConfirm({ title: `Aprire ${board.links.length} schede?`, text: `Verranno aperte tutte le pagine di «${board.name}».`, ok: 'Apri tutte', danger: false });
    if (!ok) return;
  }
  board.links.forEach((l) => chrome.tabs.create({ url: l.url, active: false }));
}

/* ——— Link ——— */
function isLocked(board) {
  if (board?.locked) { toast(`«${board.name}» è bloccata: sbloccala per modificarla.`); return true; }
  return false;
}
async function addLink(board) {
  if (isLocked(board)) return;
  const r = await askLink({ title: 'Aggiungi link', ok: 'Aggiungi' });
  if (!r) return;
  board.links.push({ id: uid(), title: r.title, url: r.url });
  await commit();
}
async function editLink(board, link) {
  if (isLocked(board)) return;
  const r = await askLink({ title: 'Modifica link', url: link.url, name: link.title });
  if (!r) return;
  link.url = r.url;
  link.title = r.title;
  await commit();
}
async function deleteLink(board, link) {
  if (isLocked(board)) return;
  const idx = board.links.indexOf(link);
  board.links.splice(idx, 1);
  await commit();
  toast('Link eliminato.', {
    label: 'Annulla',
    run: async () => {
      const b = allBoards().find((x) => x.id === board.id);
      if (!b) return;
      b.links.splice(Math.min(idx, b.links.length), 0, link);
      await commit();
    }
  });
}
async function duplicateLink(board, link) {
  if (isLocked(board)) return;
  const copy = { id: uid(), url: link.url, title: link.title };
  if (link.color) copy.color = link.color;
  board.links.splice(board.links.indexOf(link) + 1, 0, copy);
  await commit();
  toast('Link duplicato.');
}
// I link fissati stanno in cima alla board, in ordine di fissaggio.
async function togglePin(board, link) {
  if (isLocked(board)) return;
  board.links.splice(board.links.indexOf(link), 1);
  if (link.pinned) {
    delete link.pinned;
    const firstFree = board.links.findIndex((l) => !l.pinned);
    board.links.splice(firstFree < 0 ? board.links.length : firstFree, 0, link);
  } else {
    link.pinned = true;
    const firstFree = board.links.findIndex((l) => !l.pinned);
    board.links.splice(firstFree < 0 ? board.links.length : firstFree, 0, link);
  }
  await commit();
}
async function setHighlight(board, link, color) {
  if (isLocked(board)) return;
  if (color) link.color = color; else delete link.color;
  await commit();
}
function scheduleAlarm(link) {
  try { chrome.alarms.create(`due-${link.id}`, { when: link.remind }); } catch { /* il controllo ogni minuto lo coprirà */ }
}
async function setReminder(link) {
  const ts = await askReminder({ current: link.remind || 0, title: link.remind ? 'Modifica il promemoria' : 'Ricordamelo' });
  if (!ts) return;
  link.remind = ts;
  delete link.notified;
  scheduleAlarm(link);
  await commit();
  toast(`Ti ricorderò ${new Date(ts).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`);
}
async function clearReminder(link, quiet = false) {
  if (!link.remind) return;
  delete link.remind;
  delete link.notified;
  try { chrome.alarms.clear(`due-${link.id}`); } catch { /* niente */ }
  await commit();
  if (!quiet) toast('Promemoria rimosso.');
}
const isDue = (l) => !!l.remind && l.remind <= Date.now();
function linkMenu(anchor, board, link) {
  const lock = board.locked;
  const items = [];
  if (!lock) items.push({ icon: 'pencil', label: 'Modifica', run: () => editLink(board, link) });
  items.push({ icon: 'bellPlus', label: link.remind ? 'Modifica il promemoria' : 'Ricordamelo', run: () => setReminder(link) });
  if (link.remind) items.push({ icon: 'bell', label: 'Rimuovi il promemoria', run: () => clearReminder(link) });
  if (!lock) {
    items.push(
      { icon: 'pin', label: link.pinned ? 'Non fissare più' : 'Fissa in alto', run: () => togglePin(board, link) },
      { icon: 'copy', label: 'Duplica', run: () => duplicateLink(board, link) },
      { icon: 'move', label: 'Sposta in…', run: () => moveMenu(anchor, board, link) },
      { swatches: { label: 'Evidenzia', colors: HIGHLIGHTS, current: link.color, pick: (c) => setHighlight(board, link, c) } },
      { rule: true },
      { icon: 'trash', label: 'Elimina', danger: true, run: () => deleteLink(board, link) });
  }
  openMenu(anchor, items);
}

async function toggleCollapse(board) {
  if (board.collapsed) delete board.collapsed; else board.collapsed = true;
  await commit();
}
async function toggleLock(board) {
  if (board.locked) delete board.locked; else board.locked = true;
  await commit();
  toast(board.locked ? `«${board.name}» bloccata.` : `«${board.name}» sbloccata.`);
}

function findLink(linkId) {
  for (const b of allBoards()) {
    const l = b.links.find((x) => x.id === linkId);
    if (l) return { board: b, link: l };
  }
  return null;
}
async function moveLinkTo(linkId, toBoardId, index) {
  const found = findLink(linkId);
  const to = allBoards().find((b) => b.id === toBoardId);
  if (!found || !to) return;
  if (isLocked(found.board) || isLocked(to)) return;
  found.board.links = found.board.links.filter((l) => l !== found.link);
  const at = index == null ? to.links.length : Math.min(index, to.links.length);
  to.links.splice(at, 0, found.link);
  await commit();
}
function moveMenu(anchor, board, link) {
  const items = [];
  const multi = state.workspaces.length > 1;
  for (const p of state.pages) {
    const targets = p.boards.filter((b) => b.id !== board.id);
    if (!targets.length) continue;
    const w = state.workspaces.find((x) => x.id === p.ws);
    items.push({ sep: multi && w ? `${w.emoji} ${w.name} · ${p.name}` : p.name });
    targets.forEach((b) => items.push({ label: b.name, run: () => moveLinkTo(link.id, b.id) }));
  }
  if (!items.length) { toast('Crea prima un’altra board.'); return; }
  openMenu(anchor, items);
}
async function moveBoardToPage(boardId, pageId) {
  const from = state.pages.find((p) => p.boards.some((b) => b.id === boardId));
  const to = state.pages.find((p) => p.id === pageId);
  if (!from || !to || from === to) return;
  const b = from.boards.find((x) => x.id === boardId);
  from.boards = from.boards.filter((x) => x !== b);
  to.boards.push(b);
  await commit();
  toast(`Board spostata in «${to.name}».`);
}

async function renameGreeting() {
  const name = await askText({ title: 'Il tuo nome', label: 'Nome nel saluto', value: state.settings.name || '', allowEmpty: true });
  if (name == null) return;
  state.settings.name = name;
  await commit();
  tickClock(true);
}

/* ——— Importa, esporta, ripristina ——— */
/* ——— Importazione: ogni cartella principale diventa una pagina, le sottocartelle diventano board ——— */
// Raccoglie i link in gruppi { page, board, links }. `path` = cartelle sotto il contenitore (barra dei preferiti, altri preferiti…).
function makeCollector() {
  const groups = new Map();
  return {
    add(path, container, link) {
      const page = path[0] || 'Importati';
      const board = path.length <= 1 ? (path[0] || container || 'Senza cartella') : path.slice(1).join(' › ');
      const key = `${page}\u0000${board}`;
      if (!groups.has(key)) groups.set(key, { page, board, links: [] });
      groups.get(key).links.push(link);
    },
    result: () => [...groups.values()]
  };
}

async function importFromChrome() {
  const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) { toast('Serve il permesso di leggere i segnalibri.'); return; }
  const tree = await chrome.bookmarks.getTree();
  const col = makeCollector();
  const walk = (node, path, container) => {
    for (const c of node.children || []) {
      if (c.url) {
        if (/^https?:/i.test(c.url)) col.add(path, container, { title: c.title || hostOf(c.url), url: c.url });
      } else walk(c, [...path, c.title || 'Senza nome'], container);
    }
  };
  for (const top of tree[0].children || []) walk(top, [], top.title);
  await importGroups(col.result());
}

/* File dei segnalibri in HTML (formato Netscape: lo esportano Chrome, Edge, Firefox e Safari). */
function parseBookmarkHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const root = doc.querySelector('dl');
  if (!root) return null;
  const col = makeCollector();
  // Nel DOM, ogni <DT> contiene o un link, o un titolo di cartella (H3) seguito dal suo <DL>.
  const walk = (dl, path, container) => {
    for (const dt of dl.children) {
      if (dt.tagName !== 'DT') continue;
      const kids = [...dt.children];
      const h3 = kids.find((c) => c.tagName === 'H3');
      if (h3) {
        const sub = kids.find((c) => c.tagName === 'DL');
        if (!sub) continue;
        const title = (h3.textContent || '').trim() || 'Senza nome';
        // Barra dei preferiti e "Altri preferiti" sono contenitori: non diventano pagine.
        if (container === undefined && (h3.hasAttribute('personal_toolbar_folder') || h3.hasAttribute('unfiled_bookmarks_folder'))) walk(sub, [], title);
        else walk(sub, [...path, title], container ?? '');
        continue;
      }
      const a = kids.find((c) => c.tagName === 'A');
      const href = a?.getAttribute('href') || '';
      const url = /^https?:/i.test(href) ? safeUrl(href) : '';
      if (url) col.add(path, container, { url, title: (a.textContent || '').trim() });
    }
  };
  walk(root, [], undefined);
  return col.result();
}
async function importBookmarkFile(file) {
  let text;
  try { text = await file.text(); } catch { toast('Non riesco a leggere il file.'); return; }
  const groups = parseBookmarkHtml(text);
  if (!groups) { toast('Il file non sembra un export di segnalibri (HTML).'); return; }
  await importGroups(groups);
}

async function importGroups(groups) {
  if (!groups.length) { toast('Nessun segnalibro da importare.'); return; }
  const pageNames = [...new Set(groups.map((g) => g.page))];
  const total = groups.reduce((a, g) => a + g.links.length, 0);
  const choice = await askImportMode({ total, pages: pageNames.length, boards: groups.length, multi: state.workspaces.length >= 1 });
  if (!choice) return;
  await mergeImported(groups, choice);
}

function askImportMode({ total, pages, boards }) {
  const opts = [
    ['pages', `Una pagina per ogni cartella principale`, `${pages} ${pages === 1 ? 'pagina' : 'pagine'}, le sottocartelle diventano board. Nel workspace «${curWs().name}».`],
    ['newws', 'Come sopra, in un nuovo workspace «Importati»', 'Il tuo ordine attuale non viene toccato: poi sposti le pagine dove vuoi.'],
    ['single', 'Tutto in una sola pagina «Importati»', `${boards} board in un’unica pagina.`]
  ];
  let value = pages > 6 ? 'newws' : 'pages';
  const list = h('div', { class: 'imp-opts', role: 'radiogroup', 'aria-label': 'Dove importare' },
    opts.map(([v, title, hint]) => h('label', { class: 'imp-opt' },
      h('input', { type: 'radio', name: 'imp', value: v, checked: v === value, onchange: () => { value = v; } }),
      h('span', {}, h('strong', {}, title), h('small', {}, hint)))));
  return openModal({
    title: `Importare ${total} link?`, ok: 'Importa',
    content: list,
    collect: () => value
  });
}

async function mergeImported(groups, mode) {
  let ws = state.workspaces.find((w) => w.id === state.activeWorkspace);
  if (mode === 'newws') {
    ws = state.workspaces.find((w) => w.name === 'Importati');
    if (!ws) { ws = { id: uid(), name: 'Importati', emoji: '📥' }; state.workspaces.push(ws); }
  }
  const pageList = () => state.pages.filter((p) => p.ws === ws.id);
  const knownByPage = new Map();
  let added = 0;
  let firstPage = null;
  const touched = new Set();
  for (const g of groups) {
    const pageName = mode === 'single' ? 'Importati' : g.page;
    const boardName = mode === 'single' && g.page !== 'Importati' && g.page !== g.board ? `${g.page} › ${g.board}` : g.board;
    let page = pageList().find((p) => p.name === pageName.slice(0, 40));
    if (!page) { page = { id: uid(), ws: ws.id, name: pageName.slice(0, 40), boards: [] }; state.pages.push(page); }
    if (!knownByPage.has(page)) knownByPage.set(page, new Set(page.boards.flatMap((b) => b.links.map((l) => l.url))));
    const known = knownByPage.get(page);
    let board = page.boards.find((b) => b.name === boardName.slice(0, 60));
    if (!board) {
      board = { id: uid(), name: boardName.slice(0, 60), color: palette()[page.boards.length % palette().length], links: [] };
      page.boards.push(board);
    }
    for (const l of g.links) {
      if (known.has(l.url)) continue;
      known.add(l.url);
      board.links.push({ id: uid(), title: (l.title || hostOf(l.url)).slice(0, 200), url: l.url });
      added++;
    }
    touched.add(page);
    firstPage ??= page;
  }
  for (const page of touched) page.boards = page.boards.filter((b) => b.links.length);
  // Pagine rimaste vuote (tutto già importato): niente schede vuote in più.
  state.pages = state.pages.filter((p) => !touched.has(p) || p.boards.length || state.pages.filter((x) => x.ws === p.ws).length === 1);
  if (!pageList().length) state.pages.push({ id: uid(), ws: ws.id, name: 'Principale', boards: [] });
  state.activeWorkspace = ws.id;
  const target = pageList().find((p) => touched.has(p)) || pageList()[0];
  state.activePage = target.id;
  ws.lastPage = target.id;
  await commit();
  toast(added ? `Importati ${added} link nuovi.` : 'Era già tutto importato.');
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `boards-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  state.lastBackup = Date.now();
  persistSoon();
  settings.refresh();
  toast('Backup esportato.');
}

async function replaceState(next, message) {
  state = sanitizeState(next);
  applyAll();
  await commit();
  settings.refresh();
  toast(message);
}

async function restoreBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('Il file non è un backup valido.'); return; }
  if (!data || !Array.isArray(data.pages) || !data.pages.length) { toast('Il file non è un backup valido.'); return; }
  // Un file senza impostazioni (es. creato a mano) lascia invariati tema e sfondo attuali.
  const keepLook = !data.settings;
  const ok = await askConfirm({ title: 'Ripristinare il backup?', text: keepLook ? 'Sostituisce tutti i workspace, le pagine e le board attuali. Tema e sfondo restano come sono.' : 'Sostituisce tutte le pagine, le board e le impostazioni attuali.', ok: 'Ripristina', danger: false });
  if (ok) await replaceState(keepLook ? { ...data, settings: state.settings } : data, 'Backup ripristinato.');
}
async function restoreSnapshot(snap) {
  const when = new Date(snap.t).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  const ok = await askConfirm({ title: 'Ripristinare questa copia?', text: `Copia automatica del ${when} (${snap.n} link). I dati attuali verranno sostituiti.`, ok: 'Ripristina', danger: false });
  if (ok) await replaceState(snap.data, 'Copia ripristinata.');
}
async function resetSettings() {
  const ok = await askConfirm({ title: 'Ripristinare le impostazioni?', text: 'Tema, sfondo e preferenze tornano come all’inizio. Link e board non cambiano.', ok: 'Ripristina', danger: false });
  if (!ok) return;
  state.settings = defaultSettings();
  applyAll();
  await commit();
  settings.refresh();
}

/* ——— Colori delle board ——— */
function recolor(i, next) {
  const old = state.settings.boardColors[i];
  if (!old || old.toLowerCase() === next.toLowerCase()) return;
  state.settings.boardColors[i] = next;
  allBoards().forEach((b) => { if (b.color.toLowerCase() === old.toLowerCase()) b.color = next; });
  renderGrid();
  persistSoon();
}

/* ——— Trascinamento ——— */
function clearMarks() {
  document.querySelectorAll('.drop-line').forEach((n) => n.remove());
  document.querySelectorAll('[data-drop]').forEach((n) => n.removeAttribute('data-drop'));
  document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
}
function dropSpot(list, y) {
  const items = [...list.querySelectorAll(':scope > .item:not(.dragging)')];
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return { index: i, before: items[i] };
  }
  return { index: items.length, before: null };
}
// Se il rilascio avviene fuori da una vera "dragend" (es. Esc dopo un ridisegno), si azzera appena il mouse si muove.
document.addEventListener('mousemove', (e) => { if (drag && e.buttons === 0) { drag = null; clearMarks(); } });

function wireSection(sec, list, board) {
  sec.addEventListener('dragover', (e) => {
    if (!drag || drag.type !== 'link' || board.locked || board.collapsed) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const spot = dropSpot(list, e.clientY);
    drag.target = { boardId: board.id, index: spot.index };
    document.querySelectorAll('.drop-line').forEach((n) => n.remove());
    const line = h('div', { class: 'drop-line' });
    line.style.setProperty('--c', board.color);
    list.insertBefore(line, spot.before);
  });
  sec.addEventListener('drop', (e) => {
    if (!drag || drag.type !== 'link' || !drag.target || board.locked || board.collapsed) return;
    e.preventDefault();
    const { linkId, target } = drag;
    drag = null;
    clearMarks();
    moveLinkTo(linkId, target.boardId, target.index);
  });
}

el.grid.addEventListener('dragover', (e) => {
  if (!drag || drag.type !== 'board') return;
  e.preventDefault();
  document.querySelectorAll('[data-drop]').forEach((n) => n.removeAttribute('data-drop'));
  const sec = e.target.closest?.('.board');
  if (sec && sec.dataset.id !== drag.boardId) {
    const r = sec.getBoundingClientRect();
    const before = e.clientX < r.left + r.width / 2;
    sec.dataset.drop = before ? 'before' : 'after';
    drag.target = { boardId: sec.dataset.id, before };
  } else if (!sec) {
    const last = [...curPage().boards].reverse().find((b) => b.id !== drag.boardId);
    const lastEl = last && el.grid.querySelector(`.board[data-id="${last.id}"]`);
    if (lastEl) { lastEl.dataset.drop = 'after'; drag.target = { boardId: last.id, before: false }; }
  }
});
el.grid.addEventListener('drop', async (e) => {
  if (!drag || drag.type !== 'board' || !drag.target) return;
  e.preventDefault();
  const { boardId, target } = drag;
  drag = null;
  clearMarks();
  const page = curPage();
  const moving = page.boards.find((b) => b.id === boardId);
  if (!moving) return;
  page.boards = page.boards.filter((b) => b !== moving);
  const at = page.boards.findIndex((b) => b.id === target.boardId);
  page.boards.splice(target.before ? at : at + 1, 0, moving);
  await commit();
});

/* ——— Apertura dei link ——— */
function openUrl(url, { newTab = false, background = false } = {}) {
  if (newTab || state.settings.openNew) chrome.tabs.create({ url, active: !background });
  else chrome.tabs.update({ url });
}
el.grid.addEventListener('click', (e) => {
  const a = e.target.closest('a.row');
  if (!a || a.hasAttribute('href')) return;
  e.preventDefault();
  openUrl(a.dataset.href, { newTab: e.ctrlKey || e.metaKey || e.shiftKey, background: e.ctrlKey || e.metaKey });
  doneReminder(a);
});
// Aprire un link con il promemoria scaduto lo "spegne".
function doneReminder(a) {
  const f = a.dataset.id && findLink(a.dataset.id);
  if (f && isDue(f.link)) clearReminder(f.link, true);
}
el.grid.addEventListener('auxclick', (e) => {
  const a = e.target.closest('a.row');
  if (e.button !== 1 || !a || a.hasAttribute('href')) return;
  e.preventDefault();
  openUrl(a.dataset.href, { newTab: true, background: true });
  doneReminder(a);
});
el.grid.addEventListener('keydown', (e) => {
  const a = e.target.closest?.('a.row');
  if (e.key === 'Enter' && a && !a.hasAttribute('href')) { e.preventDefault(); openUrl(a.dataset.href); doneReminder(a); }
});

/* ——— Disegno dell'interfaccia ——— */
function linkItem(board, link, canDrag) {
  const tile = h('span', { class: 'tile', 'aria-hidden': 'true' }, (link.title || '?').charAt(0).toUpperCase());
  if (state.settings.icons === 'favicon' && /^https?:/.test(link.url)) {
    const img = h('img', { src: faviconUrl(link.url), alt: '', draggable: 'false' });
    const show = () => { img.classList.add('on'); tile.classList.add('has-icon'); iconOK.add(link.url); };
    if (iconOK.has(link.url)) show();
    img.addEventListener('load', show);
    tile.append(img);
  }

  const due = isDue(link);
  const when = link.remind ? new Date(link.remind).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const a = h('a', { class: 'row', draggable: 'false', 'data-href': link.url, 'data-id': link.id },
    tile,
    h('span', { class: 'meta' },
      h('span', { class: 't' }, link.title),
      h('span', { class: 'h' }, hostOf(link.url))),
    h('span', { class: 'flags' },
      link.remind ? h('span', { class: 'flag bell' + (due ? ' due' : ''), title: due ? `Promemoria scaduto (${when})` : `Promemoria: ${when}` }, icon('bell', 16)) : null,
      link.pinned ? h('span', { class: 'flag', title: 'Fissato in alto' }, icon('pin', 16)) : null));
  if (!state.privacy && /^https?:/.test(link.url)) {
    a.href = link.url;
    if (state.settings.openNew) { a.target = '_blank'; a.rel = 'noopener'; }
  } else {
    a.tabIndex = 0;
    a.setAttribute('role', 'link');
  }

  const wrap = h('div', { class: 'item' + (link.color ? ' hl' : '') + (due ? ' due' : ''), draggable: canDrag ? 'true' : 'false', style: link.color ? `--hl:${link.color}` : null }, a,
    h('div', { class: 'row-actions' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Opzioni di ${link.title}`, title: 'Opzioni', 'aria-haspopup': 'menu', onclick: (e) => linkMenu(e.currentTarget, board, link) }, icon('more', 18))));
  wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); linkMenu(wrap.querySelector('.row-actions button'), board, link); });

  if (canDrag) {
    wrap.addEventListener('dragstart', (e) => {
      drag = { type: 'link', linkId: link.id, target: null };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', link.url);
      setTimeout(() => wrap.classList.add('dragging'));
    });
    wrap.addEventListener('dragend', () => { drag = null; wrap.classList.remove('dragging'); clearMarks(); });
  }
  return wrap;
}

function boardEl(page, board, links, searching) {
  const folded = !!board.collapsed && !searching;
  const sec = h('section', { class: 'board' + (folded ? ' collapsed' : '') + (board.locked ? ' locked' : ''), style: `--c:${board.color}`, 'aria-label': board.name, dataset: { id: board.id } });
  const total = board.links.filter((l) => l.remind).length;
  const dueN = board.links.filter(isDue).length;
  const head = h('div', { class: 'board-head', draggable: searching || board.locked ? 'false' : 'true' },
    searching ? null : h('button', {
      class: 'fold', type: 'button', 'aria-expanded': String(!folded), 'aria-label': folded ? `Espandi ${board.name}` : `Comprimi ${board.name}`,
      title: folded ? 'Espandi' : 'Comprimi', onclick: () => toggleCollapse(board)
    }, icon('chevron', 18)),
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    h('h2', { title: board.name }, board.name),
    searching && page !== curPage() ? h('span', { class: 'where' }, state.workspaces.length > 1 ? `${state.workspaces.find((w) => w.id === page.ws)?.emoji || ''} ${page.name}` : page.name) : null,
    total ? h('span', { class: 'rem' + (dueN ? ' due' : ''), title: `${dueN} scaduti su ${total} promemoria` }, icon('bell', 15), `${dueN}/${total}`) : null,
    h('span', { class: 'count', title: `${links.length} link` }, total || board.locked ? String(links.length) : `${links.length} link`),
    board.locked ? h('button', { class: 'lock-btn', type: 'button', title: 'Board bloccata: clicca per sbloccare', 'aria-label': `Sblocca ${board.name}`, onclick: () => toggleLock(board) }, icon('lock', 16)) : null,
    h('button', {
      class: 'icon-btn bare', type: 'button', 'aria-label': `Opzioni ${board.name}`, title: 'Opzioni', 'aria-haspopup': 'menu',
      onclick: (e) => openMenu(e.currentTarget, [
        ...(board.locked ? [] : [
          { icon: 'pencil', label: 'Modifica nome e colore', run: () => editBoard(board) },
          { icon: 'plus', label: 'Aggiungi link', run: () => addLink(board) }]),
        { icon: 'external', label: 'Apri tutte le pagine', run: () => openAll(board) },
        ...(board.locked ? [] : [{ icon: 'tray', label: 'Ordina dalla A alla Z', run: () => sortBoard(board) }]),
        { icon: 'move', label: 'Sposta in un’altra pagina…', run: () => boardToPageMenu(e.currentTarget, board) },
        { icon: board.locked ? 'unlock' : 'lock', label: board.locked ? 'Sblocca la board' : 'Blocca la board', run: () => toggleLock(board) },
        ...(board.locked ? [] : [{ rule: true }, { icon: 'trash', label: 'Elimina board', danger: true, run: () => deleteBoard(page, board) }])
      ])
    }, icon('more', 18)));

  if (!searching) {
    head.addEventListener('dragstart', (e) => {
      if (drag) return;
      drag = { type: 'board', boardId: board.id, target: null };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', board.name);
      e.dataTransfer.setDragImage(sec, 24, 24);
      setTimeout(() => sec.classList.add('dragging'));
    });
    head.addEventListener('dragend', () => { drag = null; sec.classList.remove('dragging'); clearMarks(); });
  }

  const list = h('div', { class: 'list' }, links.map((l) => linkItem(board, l, !searching && !board.locked)));
  sec.append(head, list);
  if (!searching) {
    if (!board.links.length) list.append(h('div', { class: 'empty-hint' }, board.locked ? 'Board vuota e bloccata.' : 'Trascina qui un link oppure aggiungilo.'));
    wireSection(sec, list, board);
    if (!board.locked) sec.append(h('button', { class: 'add-link', type: 'button', onclick: () => addLink(board) }, icon('plus', 18), 'Aggiungi link'));
  }
  return sec;
}

function boardToPageMenu(anchor, board) {
  const from = state.pages.find((p) => p.boards.includes(board));
  const multi = state.workspaces.length > 1;
  const items = [];
  for (const w of state.workspaces) {
    const targets = state.pages.filter((p) => p.ws === w.id && p !== from);
    if (!targets.length) continue;
    if (multi) items.push({ sep: `${w.emoji} ${w.name}` });
    targets.forEach((p) => items.push({ label: p.name, run: () => moveBoardToPage(board.id, p.id) }));
  }
  if (!items.length) { toast('Crea prima un’altra pagina.'); return; }
  openMenu(anchor, items);
}

function scrollActiveTab() {
  el.tabs.querySelector('.tab[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderTabs() {
  el.tabs.replaceChildren(...wsPages().map((p) => {
    const b = h('button', {
      class: 'tab', type: 'button', 'aria-pressed': String(p.id === state.activePage), title: p.name, dataset: { page: p.id },
      onclick: () => setActivePage(p.id),
      ondblclick: () => renamePage(p)
    }, p.name);
    // Rilascio su una pagina: sposta lì il link (o la board) trascinato
    b.addEventListener('dragover', (e) => {
      if (!drag || p.id === state.activePage) return;
      e.preventDefault();
      b.classList.add('drop-target');
    });
    b.addEventListener('dragleave', () => b.classList.remove('drop-target'));
    b.addEventListener('drop', async (e) => {
      if (!drag || p.id === state.activePage) return;
      e.preventDefault();
      const d = drag;
      drag = null;
      clearMarks();
      if (d.type === 'board') { await moveBoardToPage(d.boardId, p.id); return; }
      let target = p.boards[0];
      if (!target) { target = { id: uid(), name: 'Principale', color: palette()[0], links: [] }; p.boards.push(target); }
      await moveLinkTo(d.linkId, target.id, null);
      toast(`Link spostato in «${p.name}».`);
    });
    return b;
  }));
}

function matches(link, q) {
  return link.title.toLowerCase().includes(q) || link.url.toLowerCase().includes(q);
}

function renderGrid() {
  const q = el.search.value.trim().toLowerCase();
  const nodes = [];
  if (q) {
    for (const page of state.pages) {
      for (const board of page.boards) {
        const links = board.links.filter((l) => matches(l, q));
        if (links.length) nodes.push(boardEl(page, board, links, true));
      }
    }
    if (!nodes.length) nodes.push(h('div', { class: 'empty' }, h('div', {}, h('strong', {}, 'Nessun risultato'), `Nessun link corrisponde a «${el.search.value.trim()}».`)));
    el.grid.replaceChildren(...nodes);
    return;
  }
  const page = curPage();
  if (!page.boards.length) {
    nodes.push(h('div', { class: 'empty' },
      h('div', {}, h('strong', {}, 'Questa pagina è vuota'), 'Crea una board per iniziare a raccogliere i tuoi link.'),
      h('button', { class: 'btn-primary', type: 'button', onclick: addBoard }, icon('plus', 18), 'Nuova board')));
  } else {
    page.boards.forEach((b) => nodes.push(boardEl(page, b, b.links, false)));
    nodes.push(h('button', { class: 'new-board', type: 'button', onclick: addBoard }, icon('plus', 20), 'Nuova board'));
  }
  el.grid.replaceChildren(...nodes);
}

function render() {
  renderWs();
  renderTabs();
  scrollActiveTab();
  renderGrid();
  document.body.classList.toggle('privacy', !!state.privacy);
  document.body.classList.toggle('pb', !!state.settings.privacyBoards);
  el.privacy.setAttribute('aria-pressed', String(!!state.privacy));
  tickClock(true);
}

/* ——— Sfondo ——— */
let bgKey = '';
let tabPick = null;
let customUrl = null;

function pickImage(bg) {
  let i = IMAGES.findIndex((x) => x.id === bg.image);
  if (i < 0) i = 0;
  if (bg.rotate === 'daily') {
    const d = new Date();
    i = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % IMAGES.length;
  } else if (bg.rotate === 'tab') {
    if (tabPick == null) tabPick = Math.floor(Math.random() * IMAGES.length);
    i = tabPick;
  }
  return IMAGES[i];
}

function showLayer(css) {
  el.bgImg.style.backgroundImage = css;
  requestAnimationFrame(() => el.bgImg.classList.add('ready'));
}

async function applyBackground() {
  const bg = state.settings.bg;
  document.body.classList.toggle('plain', bg.type === 'color');
  el.credit.hidden = true;
  el.bg.style.background = '';

  let key = bg.type;
  if (bg.type === 'color') key += bg.color;
  if (bg.type === 'gradient') key += bg.gradient;
  if (bg.type === 'image') key += pickImage(bg).id + bg.quality;
  if (bg.type === 'custom') key += Date.now();
  if (key === bgKey) { if (bg.type === 'image') showCredit(pickImage(bg)); return; }
  bgKey = key;

  if (bg.type === 'color') {
    el.bg.style.background = bg.color;
    el.bgImg.classList.remove('ready');
    el.bgImg.style.backgroundImage = 'none';
    return;
  }
  if (bg.type === 'gradient') {
    el.bgImg.classList.remove('ready');
    showLayer((GRADIENTS.find((g) => g.id === bg.gradient) || GRADIENTS[0]).css);
    return;
  }
  if (bg.type === 'custom') {
    const blob = await getFile('bg-custom').catch(() => null);
    if (!blob) { fallbackGradient(); return; }
    if (customUrl) URL.revokeObjectURL(customUrl);
    customUrl = URL.createObjectURL(blob);
    el.bgImg.classList.remove('ready');
    showLayer(`url("${customUrl}")`);
    return;
  }
  const im = pickImage(bg);
  el.bg.style.background = im.tone;
  el.bgImg.classList.remove('ready');
  const url = imageUrl(im, bg.quality === '4k' ? 3840 : 1920);
  const probe = new Image();
  probe.decoding = 'async';
  probe.onload = () => { if (bgKey === key) { showLayer(`url("${url}")`); showCredit(im); } };
  probe.onerror = () => { if (bgKey === key) { fallbackGradient(); toast('Non riesco a caricare la foto: uso una sfumatura.'); } };
  probe.src = url;
}

function fallbackGradient() {
  el.bgImg.classList.remove('ready');
  showLayer(GRADIENTS[0].css);
}

function showCredit(im) {
  el.credit.textContent = `Foto: ${im.author} · ${im.license} · Wikimedia Commons`;
  el.credit.href = imagePage(im);
  el.credit.hidden = false;
}

async function pickPhoto() { el.photo.click(); }
el.photo.addEventListener('change', async () => {
  const f = el.photo.files[0];
  el.photo.value = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) { toast('Scegli un file immagine.'); return; }
  await putFile('bg-custom', f);
  state.settings.bg.type = 'custom';
  bgKey = '';
  applyAll();
  persistSoon();
  settings.refresh();
  toast('Foto impostata come sfondo.');
});
async function removePhoto() {
  await delFile('bg-custom').catch(() => {});
  if (state.settings.bg.type === 'custom') state.settings.bg.type = 'image';
  bgKey = '';
  applyAll();
  persistSoon();
  toast('Foto rimossa.');
}

function applyAll() {
  applyTheme(state.settings);
  applyBackground();
}

/* ——— Orologio e saluto ——— */
let shown = '';
function tickClock(force) {
  if (!state) return;
  const c = state.settings.clock;
  const d = new Date();
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: c.seconds ? '2-digit' : undefined, hour12: !c.h24 });
  const hr = d.getHours();
  const hello = hr < 5 ? 'Buonanotte' : hr < 12 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : hr < 22 ? 'Buonasera' : 'Buonanotte';
  const name = state.settings.name;
  const text = `${time}|${hello}|${name}|${c.greeting}`;
  if (!force && text === shown) return;
  shown = text;
  el.clock.textContent = time;
  el.greeting.textContent = c.greeting ? (name ? `${hello}, ${name}.` : `${hello}.`) : '';
  el.date.textContent = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ——— Impostazioni ——— */
const settings = mountSettings($('settings'), {
  getState: () => state,
  onSettings: (kind) => {
    if (kind === 'theme') applyTheme(state.settings);
    if (kind === 'bg') applyAll();
    if (kind === 'clock') tickClock(true);
    if (kind === 'links') render();
  },
  onToggle: (open) => $('settings-btn').setAttribute('aria-expanded', String(open)),
  persist: persistSoon,
  recolor,
  pickPhoto,
  removePhoto,
  actions: { importChrome: importFromChrome, importHtml: () => el.bookmarks.click(), exportBackup, restoreFile: () => el.file.click(), restoreSnapshot, resetSettings }
});

function dueSignature() {
  return allBoards().flatMap((b) => b.links.filter(isDue).map((l) => l.id)).join(',');
}

/* ——— Promemoria backup ——— */
function maybeNudgeBackup() {
  const day = 86400000;
  if (countLinks(state) < 10) return;
  if (Date.now() - (state.lastBackup || 0) < 30 * day) return;
  if (Date.now() - (state.nudgedAt || 0) < 7 * day) return;
  state.nudgedAt = Date.now();
  persistSoon();
  toast('Non esporti un backup da un po’.', { label: 'Esporta', run: exportBackup });
}

/* ——— Avvio ——— */
async function init() {
  state = await load();
  lastJson = JSON.stringify(state);

  $('ic-search').append(icon('search', 18));
  $('ic-plus').append(icon('plus', 18));
  $('add-page').append(icon('plus', 20));
  $('page-menu').append(icon('more', 20));
  el.privacy.append(icon('eyeOff', 20));
  $('settings-btn').append(icon('sliders', 20));
  if (/Mac/i.test(navigator.platform)) $('key-mod').textContent = '⌘';

  $('add-page').addEventListener('click', addPage);
  $('page-menu').addEventListener('click', (e) => openMenu(e.currentTarget, [
    { label: 'Rinomina pagina', run: () => renamePage(curPage()) },
    ...(state.workspaces.length > 1 ? [{ label: 'Sposta in un altro workspace…', run: () => pageToWsMenu($('page-menu'), curPage()) }] : []),
    { label: 'Elimina pagina', danger: true, run: () => deletePage(curPage()) }
  ]));
  el.tabs.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.tabs.scrollWidth > el.tabs.clientWidth) { el.tabs.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  $('new-board').addEventListener('click', addBoard);
  $('ws-btn').addEventListener('click', () => openWorkspaces({ getState: () => state, switchTo: switchWorkspace, add: addWorkspace, remove: removeWorkspace, rename: renameWorkspace }));
  $('settings-btn').addEventListener('click', () => settings.toggle());
  el.privacy.addEventListener('click', () => { state.privacy = !state.privacy; render(); persistSoon(); });
  el.greeting.addEventListener('click', renameGreeting);
  el.bookmarks.addEventListener('change', () => {
    const f = el.bookmarks.files[0];
    el.bookmarks.value = '';
    if (f) importBookmarkFile(f);
  });
  el.file.addEventListener('change', () => {
    const f = el.file.files[0];
    el.file.value = '';
    if (f) restoreBackup(f);
  });

  let searchTimer;
  el.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderGrid, 120); });
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(searchTimer); renderGrid(); el.grid.querySelector('.row')?.click(); }
    if (e.key === 'Escape') { el.search.value = ''; renderGrid(); el.search.blur(); }
  });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === '/' && tag !== 'input' && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      el.search.focus();
    }
  });

  onChange((next) => {
    if (JSON.stringify(next) === lastJson || drag) return;
    state = sanitizeState(next);
    lastJson = JSON.stringify(state);
    applyAll();
    render();
    settings.refresh();
  });

  applyAll();
  render();
  let dueSig = dueSignature();
  setInterval(() => {
    tickClock(false);
    const now = dueSignature();
    if (now !== dueSig) { dueSig = now; if (!drag && !document.querySelector('dialog[open]')) renderGrid(); }
  }, 1000);
  snapshotIfDue(state).catch(() => {});
  setTimeout(maybeNudgeBackup, 2500);
}

init();
