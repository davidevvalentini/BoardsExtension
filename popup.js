import { load, save, uid, hostOf, faviconUrl, boardPalette, urlKey, safeUrl } from './store.js';
import { applyTheme } from './theme.js';

const $ = (id) => document.getElementById(id);
const NEW = '__new__';

let state;
let tab;
let pageId;
let boardId;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

const page = () => state.pages.find((p) => p.id === pageId);
const open = () => page().boards.filter((b) => !b.locked); // le board bloccate non accettano link

function renderChips() {
  const p = page();
  const chips = open().map((b) => h('button', {
    class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(b.id === boardId),
    style: `--c:${b.color}`, onclick: () => { boardId = b.id; renderChips(); }
  }, h('span', { class: 'd' }), h('span', { class: 'n' }, b.name)));
  chips.push(h('button', {
    class: 'chip add', type: 'button', role: 'radio', 'aria-checked': String(boardId === NEW),
    onclick: () => { boardId = NEW; renderChips(); $('new-board').focus(); }
  }, 'Nuova board'));
  $('chips').replaceChildren(...chips);
  $('new-board').hidden = boardId !== NEW;
}

function renderPages() {
  const sel = $('page');
  const multi = state.workspaces.length > 1;
  sel.replaceChildren(...state.pages.map((p) => h('option', { value: p.id }, multi ? `${state.workspaces.find((w) => w.id === p.ws)?.emoji || ''} ${p.name}` : p.name)));
  sel.value = pageId;
  $('page-field').hidden = state.pages.length < 2;
}

function showNote(text, isError = false) {
  const note = $('note');
  note.textContent = text;
  note.classList.toggle('err', isError);
  note.hidden = false;
}

function checkDuplicate() {
  const key = urlKey(tab.url);
  for (const p of state.pages) {
    for (const b of p.boards) {
      if (b.links.some((l) => urlKey(l.url) === key)) { showNote(`Già salvato in «${b.name}» (${p.name}).`); return; }
    }
  }
}

// Salva tutte le schede della finestra in una nuova board (salta quelle già salvate). Serve il permesso opzionale «schede».
async function saveAll() {
  const btn = $('all');
  btn.disabled = true;
  let granted = false;
  try { granted = await chrome.permissions.request({ permissions: ['tabs'] }); } catch { /* resta false */ }
  if (!granted) { showNote('Serve il permesso di leggere le schede aperte. Se il popup si è chiuso, riaprilo e riprova.', true); btn.disabled = false; return; }
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((t) => /^https?:/i.test(t.url || ''));
  const fresh = await load();
  const known = new Set(fresh.pages.flatMap((p) => p.boards.flatMap((b) => b.links.map((l) => urlKey(l.url)))));
  const items = [];
  for (const t of tabs) {
    const url = safeUrl(t.url);
    const key = url && urlKey(url);
    if (!url || known.has(key)) continue;
    known.add(key);
    items.push({ id: uid(), url, title: (t.title || '').trim().slice(0, 200) || hostOf(url) });
  }
  if (!items.length) { showNote('Le schede aperte sono già tutte salvate.'); btn.disabled = false; return; }
  const p = fresh.pages.find((x) => x.id === pageId) || fresh.pages[0];
  const typed = boardId === NEW ? $('new-board').value.trim() : '';
  const name = (typed || `Sessione ${new Date().toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`).slice(0, 60);
  const pal = boardPalette(fresh);
  const board = { id: uid(), name, color: pal[p.boards.length % pal.length], links: items };
  p.boards.push(board);
  fresh.lastBoard = board.id;
  await save(fresh);
  showNote(`Salvate ${items.length} ${items.length === 1 ? 'scheda' : 'schede'} in «${name}».`);
  setTimeout(() => window.close(), 1100);
}

async function doSave() {
  $('save').disabled = true;
  // Rilegge i dati più recenti: la nuova scheda potrebbe averli modificati mentre il popup era aperto.
  const fresh = await load();
  const p = fresh.pages.find((x) => x.id === pageId) || fresh.pages[0];
  let board;
  if (boardId === NEW) {
    const name = $('new-board').value.trim();
    if (!name) { $('save').disabled = false; $('new-board').focus(); return; }
    const pal = boardPalette(fresh);
    board = { id: uid(), name, color: pal[p.boards.length % pal.length], links: [] };
    p.boards.push(board);
  } else {
    board = p.boards.find((b) => b.id === boardId && !b.locked) || p.boards.find((b) => !b.locked);
    if (!board) {
      const pal = boardPalette(fresh);
      board = { id: uid(), name: 'Principale', color: pal[0], links: [] };
      p.boards.push(board);
    }
  }
  board.links.push({ id: uid(), title: $('title').value.trim() || hostOf(tab.url), url: tab.url });
  fresh.lastBoard = board.id;
  await save(fresh);
  window.close();
}

async function init() {
  if (/Mac/i.test(navigator.platform)) $('key-mod').textContent = '⌘';
  state = await load();
  applyTheme(state.settings, { opaque: true });

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
    $('save').disabled = true;
    $('all').disabled = true;
    $('title').disabled = true;
    $('pv-title').textContent = 'Questa pagina non si può salvare';
    $('pv-url').textContent = 'Le pagine interne di Chrome non sono supportate.';
    showNote('Apri un sito web e riprova.', true);
    $('cancel').addEventListener('click', () => window.close());
    return;
  }

  const letter = (tab.title || hostOf(tab.url) || '?').charAt(0).toUpperCase();
  const tile = $('tile');
  tile.textContent = letter;
  const img = h('img', { src: faviconUrl(tab.url), alt: '' });
  img.addEventListener('load', () => { img.classList.add('on'); tile.classList.add('has-icon'); });
  tile.append(img);
  $('pv-title').textContent = tab.title || hostOf(tab.url);
  $('pv-url').textContent = tab.url.replace(/^https?:\/\//, '');
  $('title').value = tab.title || hostOf(tab.url);
  checkDuplicate();

  const lastHome = state.lastBoard && state.pages.find((p) => p.boards.some((b) => b.id === state.lastBoard));
  pageId = (lastHome || state.pages.find((p) => p.id === state.activePage) || state.pages[0]).id;
  boardId = state.lastBoard && open().some((b) => b.id === state.lastBoard) ? state.lastBoard : (open()[0]?.id ?? NEW);
  renderPages();
  renderChips();

  $('page').addEventListener('change', () => {
    pageId = $('page').value;
    boardId = open()[0]?.id ?? NEW;
    renderChips();
  });
  $('cancel').addEventListener('click', () => window.close());
  $('save').addEventListener('click', doSave);
  $('all').addEventListener('click', saveAll);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'BUTTON') { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') window.close();
  });
  $('title').focus();
  $('title').select();
}

init();
