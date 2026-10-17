import { IMAGES, GRADIENTS, HIGHLIGHTS, imageUrl, imagePage } from './catalog.js';
import {
  uid, safeUrl, load, save, onChange, hostOf, faviconUrl, sanitizeState, sanitizeSettings, defaultSettings,
  countLinks, snapshotIfDue, listSnapshots, putFile, getFile, delFile, urlKey
} from './store.js';
import { applyTheme } from './theme.js';
import { h, icon, toast, openMenu, askText, askLink, askBoard, askConfirm, askReminder, openModal } from './ui.js';
import { mountSettings } from './settings.js';
import { openWorkspaces } from './workspaces.js';
import { openPalette } from './palette.js';
import { openDuplicates, openBroken } from './tools.js';
import { loadHealth, saveHealth, brokenOf, describe as describeHealth, hasAccess, requestAccess, dropAccess } from './health.js';
import * as folder from './backupdir.js';
import * as todos from './todo.js';
import { treeToItems, htmlToItems } from './importer.js';
import { runWizard } from './wizard.js';
import { INBOX } from './classify.js';
import { saveRules, clearRules } from './learned.js';

const $ = (id) => document.getElementById(id);
const el = {
  tabs: $('tabs'), grid: $('grid'), search: $('search'), privacy: $('privacy'), clock: $('clock'),
  greeting: $('greeting'), date: $('date'), file: $('file'), photo: $('photo'), bookmarks: $('bm-file'), bg: $('bg'), bgImg: $('bg-img'), credit: $('credit')
};

let state;
let lastJson = '';
let drag = null; // { type: 'link'|'board', ... }
let saveTimer;
let health = { t: 0, items: {} };
const iconOK = new Set(); // favicon già caricate: niente sfarfallio ai ridisegni

const curPage = () => state.pages.find((p) => p.id === state.activePage) || state.pages[0];
const allBoards = () => state.pages.flatMap((p) => p.boards);
const wsPages = () => state.pages.filter((p) => p.ws === state.activeWorkspace);
const curWs = () => state.workspaces.find((w) => w.id === state.activeWorkspace) || state.workspaces[0];
const palette = () => state.settings.boardColors;

/* ——— Salvataggio ——— */
// Cronologia per «Annulla» (Ctrl+Z): una copia della struttura (workspace, pagine, board, link) prima di ogni modifica.
// Le impostazioni (tema, sfondo…) non fanno parte della cronologia.
let lastStruct = '';
const undoStack = [];
const redoStack = [];
// JSON con le chiavi in ordine alfabetico, per confrontare lo stesso contenuto scritto in ordini diversi.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const structOf = (s) => JSON.stringify({ ...s, settings: null });
function mark() { lastJson = JSON.stringify(state); lastStruct = structOf(state); }

async function commit() {
  const now = structOf(state);
  if (lastStruct && now !== lastStruct) {
    undoStack.push(lastStruct);
    if (undoStack.length > 40) undoStack.shift();
    redoStack.length = 0;
  }
  mark();
  await save(state);
  render();
  scheduleFolderBackup();
}
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { mark(); save(state); }, 250);
}
async function applyStruct(json) {
  state = sanitizeState({ ...JSON.parse(json), settings: state.settings });
  mark();
  await save(state);
  render();
  settings.refresh();
}
async function undo() {
  const prev = undoStack.pop();
  if (!prev) { toast('Non c’è niente da annullare.'); return; }
  redoStack.push(structOf(state));
  await applyStruct(prev);
  toast('Annullato.', redoStack.length ? { label: 'Ripeti', run: redo } : undefined);
}
async function redo() {
  const next = redoStack.pop();
  if (!next) { toast('Non c’è niente da ripetere.'); return; }
  undoStack.push(structOf(state));
  await applyStruct(next);
  toast('Ripetuto.');
}
const withUndo = (msg) => toast(msg, { label: 'Annulla', run: undo });

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
  withUndo(`Pagina «${page.name}» eliminata.`);
}
// Cambio pagina senza ridisegnare le schede: il doppio clic per rinominare resta affidabile.
function setActivePage(id) {
  if (state.activePage === id) return;
  state.activePage = id;
  curWs().lastPage = id;
  el.tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.page === id)));
  scrollActiveTab();
  requestAnimationFrame(updateTabsOverflow);
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
// Salto da palette: pagina (anche in un altro workspace) o board (con breve evidenza).
function goPage(pageId) {
  const p = state.pages.find((x) => x.id === pageId);
  if (!p) return;
  state.activeWorkspace = p.ws;
  state.activePage = p.id;
  curWs().lastPage = p.id;
  el.search.value = '';
  render();
  persistSoon();
}
async function goBoard(pageId, boardId) {
  goPage(pageId);
  const b = allBoards().find((x) => x.id === boardId);
  if (b?.collapsed) { delete b.collapsed; await commit(); }
  const node = el.grid.querySelector(`.board[data-id="${boardId}"]`);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 1600);
}
function openLinkFromPalette(link, { newTab }) {
  const f = findLink(link.id);
  if (f) countOpen(f.link);
  openUrl(link.url, { newTab });
}
const openPaletteNow = () => openPalette({ getState: () => state, goPage, goBoard, openLink: openLinkFromPalette });

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
  withUndo(`Workspace «${w.name}» eliminato.`);
  return true;
}
async function reorderWorkspace(id, targetId, before) {
  const moving = state.workspaces.find((w) => w.id === id);
  if (!moving || id === targetId) return;
  state.workspaces = state.workspaces.filter((w) => w !== moving);
  const at = state.workspaces.findIndex((w) => w.id === targetId);
  state.workspaces.splice(at < 0 ? state.workspaces.length : before ? at : at + 1, 0, moving);
  await commit();
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
  withUndo(`Board «${board.name}» eliminata.`);
}
async function sortBoard(board) {
  if (isLocked(board)) return;
  board.links.sort((a, b) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' }));
  await commit();
  withUndo('Board ordinata dalla A alla Z.');
}
// Più aperti per primi (i link fissati restano in cima).
async function sortByUse(board) {
  if (isLocked(board)) return;
  board.links.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.opens || 0) - (a.opens || 0) || (b.last || 0) - (a.last || 0));
  await commit();
  withUndo('Board ordinata per uso.');
}
async function openAll(board) {
  if (!board.links.length) return;
  if (board.links.length > 10) {
    const ok = await askConfirm({ title: `Aprire ${board.links.length} schede?`, text: `Verranno aperte tutte le pagine di «${board.name}».`, ok: 'Apri tutte', danger: false });
    if (!ok) return;
  }
  board.links.forEach((l) => { chrome.tabs.create({ url: l.url, active: false }); countOpen(l); });
}

/* ——— Link ——— */
function isLocked(board) {
  if (board?.locked) { toast(`«${board.name}» è bloccata: sbloccala per modificarla.`); return true; }
  return false;
}
function findByUrl(url) {
  const key = urlKey(url);
  for (const page of state.pages) for (const board of page.boards) for (const link of board.links) if (urlKey(link.url) === key) return { page, board, link };
  return null;
}
async function addLink(board) {
  if (isLocked(board)) return;
  const r = await askLink({ title: 'Aggiungi link', ok: 'Aggiungi' });
  if (!r) return;
  const dup = findByUrl(r.url);
  if (dup) {
    const ok = await askConfirm({ title: 'Link già salvato', text: `Questo indirizzo è già in «${dup.board.name}» (${dup.page.name}). Aggiungerlo comunque?`, ok: 'Aggiungi comunque', danger: false });
    if (!ok) return;
  }
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
  board.links.splice(board.links.indexOf(link), 1);
  await commit();
  withUndo('Link eliminato.');
}
// Elimina più link in una volta (doppioni, link rotti). Le board bloccate non si toccano.
async function removeLinks(ids, msg) {
  const set = new Set(ids);
  let n = 0;
  for (const b of allBoards()) {
    if (b.locked) continue;
    const before = b.links.length;
    b.links = b.links.filter((l) => !set.has(l.id));
    n += before - b.links.length;
  }
  if (!n) return;
  await commit();
  withUndo(msg);
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
  if (isLocked(found.board) || isLocked(to) || to.kind === 'todo') return;
  found.board.links = found.board.links.filter((l) => l !== found.link);
  const at = index == null ? to.links.length : Math.min(index, to.links.length);
  to.links.splice(at, 0, found.link);
  await commit();
}
function moveMenu(anchor, board, link) {
  const items = [];
  const multi = state.workspaces.length > 1;
  for (const p of state.pages) {
    const targets = p.boards.filter((b) => b.id !== board.id && b.kind !== 'todo');
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
  withUndo(`Board spostata in «${to.name}».`);
}

async function renameGreeting() {
  const name = await askText({ title: 'Il tuo nome', label: 'Nome nel saluto', value: state.settings.name || '', allowEmpty: true });
  if (name == null) return;
  state.settings.name = name;
  state.settings.nameAsked = true;
  await commit();
  tickClock(true);
}

// Al primo avvio chiede il nome (una sola volta, anche se lo salti).
async function askNameFirstTime() {
  if (state.settings.nameAsked || countLinks(state) > 0) return; // solo al primo avvio, a schede vuote
  const name = await askText({ title: 'Come ti chiami?', label: 'Nome nel saluto (puoi lasciarlo vuoto)', value: '', ok: 'Continua', allowEmpty: true });
  state.settings.nameAsked = true;
  if (name) state.settings.name = name;
  await commit();
  tickClock(true);
  if (countLinks(state) === 0) { await askLayout(); await askStart(); }
}

// Come disporre le board: righe allineate o compatta (colonne senza buchi).
async function askLayout() {
  let value = 'compact';
  const prev = (mode) => mode === 'rows'
    ? h('span', { class: 'lay-prev rows', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map(() => h('i')))
    : h('span', { class: 'lay-prev compact', 'aria-hidden': 'true' }, [[14, 8], [8, 14], [12, 10]].map((hs) => h('b', {}, hs.map((x) => h('i', { style: `height:${x}px` })))));
  const opts = [
    ['compact', 'Compatta', 'Le board si dispongono in colonne, una sotto l’altra, senza spazi vuoti: più link in vista.'],
    ['rows', 'Righe allineate', 'Le board stanno su righe ordinate; sotto le più corte resta dello spazio.']
  ];
  const list = h('div', { class: 'imp-opts', role: 'radiogroup', 'aria-label': 'Disposizione delle board' },
    opts.map(([v, t, hint]) => h('label', { class: 'imp-opt' },
      h('input', { type: 'radio', name: 'layout', value: v, checked: v === value, onchange: () => { value = v; } }),
      prev(v), h('span', {}, h('strong', {}, t), h('small', {}, hint)))));
  const choice = await openModal({ title: 'Come vuoi disporre le board?', text: 'Lo puoi cambiare quando vuoi in Impostazioni → Link e icone.', ok: 'Continua', content: list, collect: () => value });
  if (!choice) return;
  state.settings.layout.mode = choice;
  await commit();
  render();
}

// Subito dopo il nome: da dove vuoi cominciare? (così chi arriva qui per la prima volta sa dove andare)
async function askStart() {
  let value = 'chrome';
  const opts = [
    ['chrome', 'Importa i segnalibri di Chrome', 'Ti chiederà il permesso di leggerli e poi ti guiderà a organizzarli.'],
    ['html', 'Importa un file di segnalibri (HTML)', 'Quello esportato da Chrome, Edge, Firefox o Safari.'],
    ['backup', 'Ripristina un backup di Boards', 'Un file .json esportato da questa estensione.'],
    ['zero', 'Parto da zero', 'Aggiungerai i link a mano o dal pulsante della barra degli strumenti.']
  ];
  const list = h('div', { class: 'imp-opts', role: 'radiogroup', 'aria-label': 'Da dove cominci' },
    opts.map(([v, t, hint]) => h('label', { class: 'imp-opt' },
      h('input', { type: 'radio', name: 'start', value: v, checked: v === value, onchange: () => { value = v; } }),
      h('span', {}, h('strong', {}, t), h('small', {}, hint)))));
  const choice = await openModal({ title: 'Da dove vuoi cominciare?', ok: 'Continua', content: list, collect: () => value });
  if (choice === 'chrome') await importFromChrome();
  else if (choice === 'html') el.bookmarks.click();
  else if (choice === 'backup') el.file.click();
}

/* ——— Importa, esporta, ripristina ——— */
/* Importazione guidata: i segnalibri diventano un piano (wizard.js), che si scrive solo alla conferma. */
async function importFromChrome() {
  const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) { toast('Serve il permesso di leggere i segnalibri.'); return; }
  await importItems(treeToItems(await chrome.bookmarks.getTree()));
}

async function importBookmarkFile(file) {
  let text;
  try { text = await file.text(); } catch { toast('Non riesco a leggere il file.'); return; }
  const items = htmlToItems(text);
  if (!items) { toast('Il file non sembra un export di segnalibri (HTML).'); return; }
  await importItems(items);
}

async function importItems(items) {
  if (!items.length) { toast('Nessun segnalibro da importare.'); return; }
  const res = await runWizard(items, { workspaceName: curWs().name });
  if (!res) return;
  await saveRules(res.learnedRules).catch(() => {});
  await applyPlan(res.plan, res.target);
}

async function applyPlan(plan, target) {
  let ws = state.workspaces.find((w) => w.id === state.activeWorkspace);
  if (target === 'new') {
    ws = state.workspaces.find((w) => w.name === 'Importati');
    if (!ws) { ws = { id: uid(), name: 'Importati', emoji: '📥' }; state.workspaces.push(ws); }
  }
  const pageList = () => state.pages.filter((p) => p.ws === ws.id);
  const known = new Set(pageList().flatMap((p) => p.boards.flatMap((b) => b.links.map((l) => urlKey(l.url)))));
  let added = 0;
  const touched = new Set();
  for (const g of plan.pages) {
    const pageName = g.name.slice(0, 40);
    let page = pageList().find((p) => p.name === pageName);
    if (!page) { page = { id: uid(), ws: ws.id, name: pageName, boards: [] }; state.pages.push(page); }
    for (const gb of g.boards) {
      const boardName = gb.name.slice(0, 60);
      let board = page.boards.find((b) => b.name === boardName);
      if (!board) {
        board = { id: uid(), name: boardName, color: palette()[page.boards.length % palette().length], links: [] };
        page.boards.push(board);
      }
      for (const l of gb.links) {
        const k = urlKey(l.url);
        if (known.has(k)) continue;
        known.add(k);
        board.links.push({ id: uid(), title: (l.title || hostOf(l.url)).slice(0, 200), url: l.url });
        added++;
      }
    }
    touched.add(page);
  }
  for (const page of touched) page.boards = page.boards.filter((b) => b.links.length);
  // Pagine rimaste vuote (tutto già importato): niente schede vuote in più.
  state.pages = state.pages.filter((p) => !touched.has(p) || p.boards.length || state.pages.filter((x) => x.ws === p.ws).length === 1);
  if (!pageList().length) state.pages.push({ id: uid(), ws: ws.id, name: 'Principale', boards: [] });
  state.activeWorkspace = ws.id;
  const target_ = pageList().find((p) => touched.has(p) && state.pages.includes(p)) || pageList()[0];
  state.activePage = target_.id;
  ws.lastPage = target_.id;
  await commit();
  const inbox = pageList().find((p) => p.name === INBOX);
  const waiting = inbox ? inbox.boards.reduce((a, b) => a + b.links.length, 0) : 0;
  if (added) withUndo(`Importati ${added} link nuovi${waiting ? ` (${waiting} in «${INBOX}»)` : ''}.`); else toast('Era già tutto importato.');
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
  withUndo(message);
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
async function forgetRules() {
  const ok = await askConfirm({ title: 'Dimenticare le regole apprese?', text: 'Sono le scelte fatte durante lo smistamento dei segnalibri (sito → pagina). I tuoi link non cambiano.', ok: 'Dimentica', danger: false });
  if (!ok) return;
  await clearRules();
  toast('Regole dimenticate.');
}
async function resetSettings() {
  const ok = await askConfirm({ title: 'Ripristinare le impostazioni?', text: 'Tema, sfondo e preferenze tornano come all’inizio. Link e board non cambiano.', ok: 'Ripristina', danger: false });
  if (!ok) return;
  state.settings = { ...defaultSettings(), name: state.settings.name, nameAsked: true };
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
    if (!drag || drag.type !== 'link' || board.locked || board.collapsed || board.kind === 'todo') return;
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
    // Disposizione a righe: «prima/dopo» si decide da sinistra a destra; compatta: dall'alto in basso.
    const before = state.settings.layout.mode === 'compact' ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
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
// Contatore locale delle aperture (per «più usati»). Si salva subito: la pagina potrebbe chiudersi aprendo il link.
function countOpen(link) {
  link.opens = (link.opens || 0) + 1;
  link.last = Date.now();
  mark();
  save(state);
}
function recordOpen(a) {
  const f = a?.dataset.id && findLink(a.dataset.id);
  if (f) countOpen(f.link);
}
el.grid.addEventListener('click', (e) => {
  const a = e.target.closest('a.row');
  if (!a) return;
  recordOpen(a);
  if (a.hasAttribute('href')) return;
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
  if (e.button !== 1 || !a) return;
  recordOpen(a);
  if (a.hasAttribute('href')) return;
  e.preventDefault();
  openUrl(a.dataset.href, { newTab: true, background: true });
  doneReminder(a);
});
el.grid.addEventListener('keydown', (e) => {
  const a = e.target.closest?.('a.row');
  if (e.key === 'Enter' && a && !a.hasAttribute('href')) { e.preventDefault(); recordOpen(a); openUrl(a.dataset.href); doneReminder(a); }
});

/* ——— Disegno dell'interfaccia ——— */
function brokenFlag(link) {
  const r = health.items[link.id];
  if (!r || r.ok || r.ignore) return null;
  return h('span', { class: 'flag warn', title: `${describeHealth(r)} · controllato il ${new Date(r.t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}` }, icon('alert', 16));
}
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
      link.pinned ? h('span', { class: 'flag', title: 'Fissato in alto' }, icon('pin', 16)) : null,
      brokenFlag(link)));
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
    !searching && board.links.length ? h('button', {
      class: 'open-all', type: 'button', title: `Apri tutte le pagine (${board.links.length})`, 'aria-label': `Apri tutte le pagine di ${board.name}`,
      onclick: (e) => { e.stopPropagation(); openAll(board); }
    }, icon('external', 15)) : null,
    h('span', { class: 'grow', 'aria-hidden': 'true' }),
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
        ...(board.locked || !board.links.some((l) => l.opens) ? [] : [{ icon: 'tray', label: 'Ordina per più usati', run: () => sortByUse(board) }]),
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

// Porta la pagina attiva in vista, lasciando un po' di margine per la sfumatura ai lati.
// `followActive` resta vero finché non scorri tu a mano: se la barra cambia larghezza, la pagina attiva resta in vista.
let followActive = true;
function scrollActiveTab() {
  followActive = true;
  const t = el.tabs.querySelector('.tab[aria-pressed="true"]');
  if (!t) return;
  const a = t.getBoundingClientRect();
  const l = el.tabs.getBoundingClientRect();
  const pad = 48;
  const toLeft = a.left - l.left - pad;
  const toRight = a.right - l.right + pad;
  if (toLeft < 0) el.tabs.scrollBy({ left: toLeft });
  else if (toRight > 0) el.tabs.scrollBy({ left: toRight });
}

async function movePageTo(pageId, targetId, before) {
  const moving = state.pages.find((p) => p.id === pageId);
  if (!moving || pageId === targetId) return;
  state.pages = state.pages.filter((p) => p !== moving);
  const at = state.pages.findIndex((p) => p.id === targetId);
  if (at < 0) { state.pages.push(moving); } else state.pages.splice(before ? at : at + 1, 0, moving);
  await commit();
}

// Sulla pagina «Da smistare» compare il numero dei link ancora da sistemare.
function inboxBadge(p) {
  if (p.name !== INBOX) return null;
  const n = p.boards.reduce((a, b) => a + b.links.length, 0);
  return n ? h('span', { class: 'tab-badge', 'aria-label': `${n} da smistare` }, String(n)) : null;
}

// Frecce e sfumature ai lati della barra quando le pagine non entrano tutte.
function updateTabsOverflow() {
  const l = el.tabs;
  const canL = l.scrollLeft > 2;
  const canR = l.scrollLeft + l.clientWidth < l.scrollWidth - 2;
  l.classList.toggle('can-left', canL);
  l.classList.toggle('can-right', canR);
  // Le frecce restano al loro posto finché le pagine non entrano tutte (così la barra non «salta»).
  const over = l.scrollWidth > l.clientWidth + 2;
  $('tabs-prev').hidden = !over;
  $('tabs-next').hidden = !over;
  $('tabs-all').hidden = !over;
  $('tabs-prev').disabled = !canL;
  $('tabs-next').disabled = !canR;
}

function pagesMenu(anchor) {
  const pages = wsPages();
  openMenu(anchor, pages.map((p) => {
    const n = p.boards.reduce((a, b) => a + b.links.length, 0);
    return { label: `${p.id === state.activePage ? '✓ ' : ''}${p.name} · ${n}`, run: () => setActivePage(p.id) };
  }));
}

function renderTabs() {
  el.tabs.replaceChildren(...wsPages().map((p) => {
    const b = h('button', {
      class: 'tab', type: 'button', 'aria-pressed': String(p.id === state.activePage), title: p.name, dataset: { page: p.id },
      onclick: () => setActivePage(p.id),
      ondblclick: () => renamePage(p)
    }, p.name, inboxBadge(p));
    // Trascinare una scheda ne cambia l'ordine
    b.draggable = true;
    b.addEventListener('dragstart', (e) => {
      drag = { type: 'page', pageId: p.id, target: null };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', p.name);
      setTimeout(() => b.classList.add('dragging'));
    });
    b.addEventListener('dragend', () => { drag = null; b.classList.remove('dragging'); clearMarks(); });
    // Rilascio su una pagina: sposta lì il link (o la board) trascinato
    b.addEventListener('dragover', (e) => {
      if (!drag) return;
      if (drag.type === 'page') {
        if (drag.pageId === p.id) return;
        e.preventDefault();
        document.querySelectorAll('.tab[data-drop]').forEach((n) => n.removeAttribute('data-drop'));
        const r = b.getBoundingClientRect();
        const before = e.clientX < r.left + r.width / 2;
        b.dataset.drop = before ? 'before' : 'after';
        drag.target = { pageId: p.id, before };
        return;
      }
      if (p.id === state.activePage) return;
      e.preventDefault();
      b.classList.add('drop-target');
    });
    b.addEventListener('dragleave', () => { b.classList.remove('drop-target'); b.removeAttribute('data-drop'); });
    b.addEventListener('drop', async (e) => {
      if (!drag) return;
      if (drag.type === 'page') {
        e.preventDefault();
        const { pageId, target } = drag;
        drag = null;
        clearMarks();
        if (target) await movePageTo(pageId, target.pageId, target.before);
        return;
      }
      if (p.id === state.activePage) return;
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
  el.grid.classList.toggle('compact', state.settings.layout.mode === 'compact');
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
    page.boards.forEach((b) => nodes.push(b.kind === 'todo' ? todoBoardEl(page, b) : boardEl(page, b, b.links, false)));
    nodes.push(h('button', { class: 'new-board', type: 'button', onclick: addBoard }, icon('plus', 20), 'Nuova board'));
  }
  el.grid.replaceChildren(...nodes);
}

function render() {
  renderWs();
  renderTabs();
  scrollActiveTab();
  requestAnimationFrame(updateTabsOverflow);
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
  // Prima 4K (se scelto); se Wikimedia non la fornisce si riprova in Full HD, e solo dopo si ripiega su una sfumatura.
  const widths = bg.quality === '4k' ? [3840, 1920] : [1920];
  const load = (i) => {
    const url = imageUrl(im, widths[i]);
    const probe = new Image();
    probe.decoding = 'async';
    probe.onload = () => { if (bgKey === key) { showLayer(`url("${url}")`); showCredit(im); } };
    probe.onerror = () => {
      if (bgKey !== key) return;
      if (i + 1 < widths.length) load(i + 1);
      else { fallbackGradient(); toast('Non riesco a caricare la foto: uso una sfumatura.'); }
    };
    probe.src = url;
  };
  load(0);
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

/* ——— To-do dal Second Brain ——— */
// status: 'idle' | 'noconfig' | 'noperm' | 'loading' | 'ok' | 'error'
const todo = { cfg: todos.defaultConfig(), items: [], t: 0, status: 'idle', error: '' };
const hasTodoBoard = () => allBoards().some((b) => b.kind === 'todo');
let todoTimer;

async function refreshTodos({ force = false } = {}) {
  if (!hasTodoBoard()) return;
  if (!force && todo.status === 'loading') return;
  todo.cfg = await todos.loadConfig();
  if (!todo.cfg.url) { todo.status = 'noconfig'; renderGrid(); return; }
  if (!(await todos.hasPermission(todo.cfg.url).catch(() => false))) { todo.status = 'noperm'; renderGrid(); return; }
  todo.status = 'loading';
  renderGrid();
  try {
    const { items } = await todos.fetchOpen(todo.cfg);
    todo.items = items;
    todo.t = Date.now();
    todo.status = 'ok';
    todo.error = '';
    todos.saveCache(items);
  } catch (e) {
    todo.status = 'error';
    todo.error = e?.message || 'Errore sconosciuto.';
  }
  if (!drag && !document.querySelector('dialog[open]')) renderGrid();
}
async function initTodos() {
  const [cache, cfg] = await Promise.all([todos.loadCache(), todos.loadConfig()]);
  todo.items = cache.items;
  todo.t = cache.t;
  todo.cfg = cfg;
  if (!hasTodoBoard()) return;
  renderGrid();
  refreshTodos();
}
async function addTodoBoard() {
  const page = curPage();
  const used = page.boards.length;
  page.boards.push({ id: uid(), name: 'To-do', color: palette()[used % palette().length], links: [], kind: 'todo' });
  await commit();
  const cfg = await todos.loadConfig();
  if (!cfg.url) toast('Collega il tuo Second Brain per vedere i to-do.', { label: 'Imposta', run: () => settings.open('todo') });
  refreshTodos({ force: true });
}
const PRI_LABEL = { high: 'Priorità alta', medium: 'Priorità media', low: 'Priorità bassa' };
const dateLabel = (key) => new Date(key + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

function todoBoardEl(page, board) {
  const sec = h('section', { class: 'board todo-board', style: `--c:${board.color}`, 'aria-label': board.name, dataset: { id: board.id } });
  const active = todos.sortTodos(todo.items.filter((t) => todos.isActive(t)));
  const later = todos.sortTodos(todo.items.filter((t) => !todos.isActive(t)));
  const shown = board.future ? [...active, ...later] : active;
  const appUrl = todo.cfg.appUrl || (todo.cfg.url ? new URL(todo.cfg.url).origin : '');

  const head = h('div', { class: 'board-head', draggable: 'true' },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    h('h2', { title: board.name }, board.name),
    todo.status === 'loading' ? h('span', { class: 'count' }, 'aggiorno…') : h('span', { class: 'count', title: `${active.length} to-do aperti` }, `${active.length} aperti`),
    h('button', {
      class: 'icon-btn bare', type: 'button', 'aria-label': `Opzioni ${board.name}`, title: 'Opzioni', 'aria-haspopup': 'menu',
      onclick: (e) => openMenu(e.currentTarget, [
        { icon: 'tray', label: 'Aggiorna ora', run: () => refreshTodos({ force: true }) },
        { icon: 'pencil', label: 'Modifica nome e colore', run: () => editBoard(board) },
        ...(appUrl ? [{ icon: 'external', label: 'Apri il Second Brain', run: () => chrome.tabs.create({ url: appUrl }) }] : []),
        { icon: 'sliders', label: 'Impostazioni dei to-do…', run: () => settings.open('todo') },
        { icon: 'move', label: 'Sposta in un’altra pagina…', run: () => boardToPageMenu(e.currentTarget, board) },
        { rule: true },
        { icon: 'trash', label: 'Elimina board', danger: true, run: () => deleteBoard(page, board) }
      ])
    }, icon('more', 18)));
  head.addEventListener('dragstart', (e) => {
    if (drag) return;
    drag = { type: 'board', boardId: board.id, target: null };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', board.name);
    e.dataTransfer.setDragImage(sec, 24, 24);
    setTimeout(() => sec.classList.add('dragging'));
  });
  head.addEventListener('dragend', () => { drag = null; sec.classList.remove('dragging'); clearMarks(); });

  const body = [];
  const notice = (text, label, run) => body.push(h('div', { class: 'todo-note' }, h('span', {}, text), label ? h('button', { type: 'button', onclick: run }, label) : null));
  if (todo.status === 'noconfig') notice('Collega il tuo Second Brain per vedere qui i to-do aperti.', 'Imposta', () => settings.open('todo'));
  else if (todo.status === 'noperm') notice('Serve il permesso di contattare la tua app.', 'Imposta', () => settings.open('todo'));
  else if (todo.status === 'error') notice(`${todo.error}${todo.t ? ' Mostro i dati salvati.' : ''}`, 'Riprova', () => refreshTodos({ force: true }));

  const today = todos.todayKey();
  const rows = shown.map((t) => {
    const future = !todos.isActive(t);
    return h('div', { class: 'todo-row' + (future ? ' future' : ''), dataset: { p: t.priority } },
      h('span', { class: 'todo-ring', title: PRI_LABEL[t.priority], 'aria-label': PRI_LABEL[t.priority] }),
      h('span', { class: 'todo-text' },
        h('span', { class: 'todo-title', title: t.title }, t.title),
        future ? h('small', {}, `dal ${dateLabel(t.activation || t.forMonth + '-01')}`) : t.activation === today ? h('small', {}, 'da oggi') : null));
  });
  if (!rows.length && (todo.status === 'ok' || (todo.status === 'error' && todo.t))) body.push(h('div', { class: 'empty-hint' }, 'Nessun to-do aperto. 🎉'));
  if (rows.length) body.push(h('div', { class: 'todo-list' }, rows));
  if (later.length) {
    body.push(h('button', {
      class: 'add-link', type: 'button',
      onclick: async () => { if (board.future) delete board.future; else board.future = true; await commit(); }
    }, board.future ? 'Nascondi i prossimi' : `Mostra anche i prossimi (${later.length})`));
  }
  sec.append(head, ...body);
  return sec;
}

/* ——— Strumenti: doppioni e link rotti ——— */
const toolCtx = {
  getState: () => state,
  removeLinks,
  refresh: async () => { health = await loadHealth(); renderGrid(); },
  openUrl: (url) => chrome.tabs.create({ url })
};
async function resetUsage() {
  const ok = await askConfirm({ title: 'Azzerare i contatori?', text: 'Si cancella il conteggio di quante volte hai aperto ogni link (serve per «più usati»).', ok: 'Azzera', danger: false });
  if (!ok) return;
  for (const b of allBoards()) for (const l of b.links) { delete l.opens; delete l.last; }
  await commit();
  toast('Contatori azzerati.');
}
async function setAutoHealth(on) {
  if (on && !(await hasAccess()) && !(await requestAccess())) return false;
  if (!on) await dropAccess().catch(() => {});
  state.settings.healthCheck = on;
  persistSoon();
  return true;
}

/* ——— Backup automatico in una cartella ——— */
let folderTimer;
function scheduleFolderBackup() {
  clearTimeout(folderTimer);
  folderTimer = setTimeout(async () => { if ((await folder.maybeWrite(state, 2 * 3600e3)) === 'written') settings.refresh(); }, 20000);
}
const folderActions = {
  supported: folder.supported,
  status: folder.status,
  async choose() {
    try { await folder.choose(); } catch (e) { if (e?.name !== 'AbortError') toast('Non riesco ad aprire quella cartella.'); return; }
    const r = await folder.writeNow(state);
    toast(r.ok ? 'Cartella collegata: prima copia salvata.' : r.err);
    settings.refresh();
  },
  async writeNow() {
    const r = await folder.writeNow(state);
    toast(r.ok ? 'Copia salvata nella cartella.' : r.err);
    settings.refresh();
  },
  async reauthorize() {
    if (await folder.reauthorize()) { await folder.writeNow(state); toast('Cartella riautorizzata.'); } else toast('Permesso non concesso.');
    settings.refresh();
  },
  async unlink() { await folder.unlink(); toast('Cartella scollegata.'); settings.refresh(); }
};
async function folderOnStart() {
  const r = await folder.maybeWrite(state, 12 * 3600e3);
  if (r !== 'prompt') return;
  try {
    if (Date.now() - Number(localStorage.getItem('folderNudge') || 0) < 86400e3) return;
    localStorage.setItem('folderNudge', String(Date.now()));
  } catch { /* senza localStorage si mostra comunque */ }
  toast('Il backup nella cartella aspetta il tuo consenso.', { label: 'Riautorizza', run: folderActions.reauthorize });
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
  actions: {
    importChrome: importFromChrome, importHtml: () => el.bookmarks.click(), exportBackup, restoreFile: () => el.file.click(), restoreSnapshot, resetSettings, forgetRules,
    findDuplicates: () => { settings.close(); openDuplicates(toolCtx); },
    checkLinks: () => { settings.close(); openBroken(toolCtx); },
    resetUsage, setAutoHealth, folder: folderActions,
    todo: {
      load: todos.loadConfig,
      // Il permesso va chiesto per primo, mentre il clic dell'utente è ancora «fresco».
      async save(cfg) {
        const clean = todos.sanitizeConfig(cfg);
        if (clean.url && !(await todos.requestPermission(clean.url).catch(() => false))) return { ok: false, message: 'Senza il permesso non posso contattare la tua app.' };
        await todos.saveConfig(clean);
        todo.cfg = clean;
        if (!clean.url) { todo.status = 'noconfig'; todo.items = []; renderGrid(); return { ok: true, message: 'Collegamento rimosso.' }; }
        try {
          const { items, total } = await todos.fetchOpen(clean);
          todo.items = items; todo.t = Date.now(); todo.status = 'ok'; todo.error = '';
          todos.saveCache(items);
          renderGrid();
          return { ok: true, message: `Collegato: ${items.length} to-do aperti su ${total}.` };
        } catch (e) {
          todo.status = 'error'; todo.error = e.message; renderGrid();
          return { ok: false, message: e.message };
        }
      }
    }
  }
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
  mark();

  $('ic-search').append(icon('search', 18));
  $('ic-plus').append(icon('plus', 18));
  $('add-page').append(icon('plus', 20));
  $('page-menu').append(icon('more', 20));
  el.privacy.append(icon('eyeOff', 20));
  $('settings-btn').append(icon('sliders', 20));
  if (/Mac/i.test(navigator.platform)) $('key-mod').textContent = '⌘';

  $('add-page').addEventListener('click', addPage);
  $('page-menu').addEventListener('click', (e) => openMenu(e.currentTarget, [
    ...(wsPages().length > 1 ? [{ label: 'Tutte le pagine…', run: () => pagesMenu($('page-menu')) }] : []),
    { label: 'Aggiungi una board To-do', run: addTodoBoard },
    { label: 'Rinomina pagina', run: () => renamePage(curPage()) },
    ...(state.workspaces.length > 1 ? [{ label: 'Sposta in un altro workspace…', run: () => pageToWsMenu($('page-menu'), curPage()) }] : []),
    { label: 'Elimina pagina', danger: true, run: () => deletePage(curPage()) }
  ]));
  $('tabs-prev').append(icon('chevron', 18));
  $('tabs-next').append(icon('chevron', 18));
  $('tabs-all').append(icon('chevron', 20));
  $('tabs-prev').addEventListener('click', () => el.tabs.scrollBy({ left: -Math.max(160, el.tabs.clientWidth * 0.7) }));
  $('tabs-next').addEventListener('click', () => el.tabs.scrollBy({ left: Math.max(160, el.tabs.clientWidth * 0.7) }));
  $('tabs-all').addEventListener('click', (e) => pagesMenu(e.currentTarget));
  el.tabs.addEventListener('scroll', updateTabsOverflow, { passive: true });
  new ResizeObserver(() => { updateTabsOverflow(); if (followActive) scrollActiveTab(); }).observe(el.tabs);
  const manual = () => { followActive = false; };
  el.tabs.addEventListener('pointerdown', manual);
  el.tabs.addEventListener('wheel', manual, { passive: true });
  $('tabs-prev').addEventListener('click', manual);
  $('tabs-next').addEventListener('click', manual);
  window.addEventListener('resize', updateTabsOverflow);
  el.tabs.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.tabs.scrollWidth > el.tabs.clientWidth) { el.tabs.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  $('new-board').addEventListener('click', addBoard);
  $('ws-btn').addEventListener('click', () => openWorkspaces({ getState: () => state, switchTo: switchWorkspace, add: addWorkspace, remove: removeWorkspace, rename: renameWorkspace, reorder: reorderWorkspace }));
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
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    const modal = !!document.querySelector('dialog[open]');
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === '/' && !typing && !modal) {
      e.preventDefault();
      el.search.focus();
    } else if (mod && !e.altKey && e.key.toLowerCase() === 'k' && !modal) {
      e.preventDefault();
      openPaletteNow();
    } else if (mod && !e.altKey && !typing && !modal && !settings.isOpen() && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) redo(); else undo();
    }
  });

  onChange((next) => {
    if (drag || canon(next) === canon(state)) return; // chrome.storage riordina le chiavi: si confronta in forma canonica
    state = sanitizeState(next);
    mark();
    undoStack.length = 0;
    redoStack.length = 0;
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
  askNameFirstTime().catch(() => {});
  setTimeout(maybeNudgeBackup, 2500);
  folderOnStart().catch(() => {});
  initTodos().catch(() => {});
  todoTimer = setInterval(() => { if (!document.hidden) refreshTodos(); }, 5 * 60e3);
  loadHealth().then(async (hl) => {
    health = hl;
    renderGrid();
    const bad = brokenOf(hl);
    if (bad.length && hl.t > (hl.notified || 0)) {
      hl.notified = hl.t;
      await saveHealth(hl);
      toast(`${bad.length} ${bad.length === 1 ? 'link non risponde più' : 'link non rispondono più'}.`, { label: 'Vedi', run: () => openBroken(toolCtx) });
    }
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.linkHealth?.newValue) {
      health = changes.linkHealth.newValue;
      if (!drag && !document.querySelector('dialog[open]')) renderGrid();
    }
  });
}

init();
