// Archivio locale condiviso tra nuova scheda e popup (chrome.storage.local, chiave "boards").
import { DEFAULT_BOARD_COLORS, GRADIENTS, IMAGES, THEMES, SOLIDS } from './catalog.js';

const KEY = 'boards';
const SNAP_KEY = 'boards_snaps';
const VERSION = 2;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ——— Impostazioni ——— */
export function defaultSettings() {
  return {
    theme: 'night',
    custom: { ground: '#0F1117', surface: '#171A23', text: '#E8EAF2', accent: '#7CC4FF' },
    accent: null,
    boardColors: [...DEFAULT_BOARD_COLORS],
    bg: { type: 'image', color: '#0F1117', gradient: 'aurora', image: 'aurora-tasmania', rotate: 'off', quality: '4k', dim: 38, blur: 0 },
    glass: { opacity: 58, blur: 22 },
    clock: { h24: true, seconds: false, greeting: true },
    name: 'Davide',
    openNew: false,
    icons: 'favicon',
    privacyBoards: true,
    layout: { colMin: 290 }
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, d, max = 80) => (typeof v === 'string' ? v.slice(0, max) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

export function sanitizeSettings(raw) {
  const d = defaultSettings();
  const r = raw && typeof raw === 'object' ? raw : {};
  const c = r.custom && typeof r.custom === 'object' ? r.custom : {};
  const b = r.bg && typeof r.bg === 'object' ? r.bg : {};
  const g = r.glass && typeof r.glass === 'object' ? r.glass : {};
  const k = r.clock && typeof r.clock === 'object' ? r.clock : {};
  const l = r.layout && typeof r.layout === 'object' ? r.layout : {};
  const colors = Array.isArray(r.boardColors) ? r.boardColors : [];
  return {
    theme: oneOf(r.theme, [...THEMES.map((t) => t.id), 'custom'], d.theme),
    custom: {
      ground: hex(c.ground, d.custom.ground), surface: hex(c.surface, d.custom.surface),
      text: hex(c.text, d.custom.text), accent: hex(c.accent, d.custom.accent)
    },
    accent: r.accent ? hex(r.accent, null) : null,
    boardColors: d.boardColors.map((def, i) => hex(colors[i], def)),
    bg: {
      type: oneOf(b.type, ['color', 'gradient', 'image', 'custom'], d.bg.type),
      color: hex(b.color, d.bg.color),
      gradient: oneOf(b.gradient, GRADIENTS.map((x) => x.id), d.bg.gradient),
      image: oneOf(b.image, IMAGES.map((x) => x.id), d.bg.image),
      rotate: oneOf(b.rotate, ['off', 'daily', 'tab'], d.bg.rotate),
      quality: oneOf(b.quality, ['4k', 'hd'], d.bg.quality),
      dim: num(b.dim, d.bg.dim, 0, 85),
      blur: num(b.blur, d.bg.blur, 0, 24)
    },
    glass: { opacity: num(g.opacity, d.glass.opacity, 30, 100), blur: num(g.blur, d.glass.blur, 0, 40) },
    clock: { h24: bool(k.h24, d.clock.h24), seconds: bool(k.seconds, d.clock.seconds), greeting: bool(k.greeting, d.clock.greeting) },
    name: str(r.name, d.name, 40),
    openNew: bool(r.openNew, d.openNew),
    icons: oneOf(r.icons, ['favicon', 'letter'], d.icons),
    privacyBoards: bool(r.privacyBoards, d.privacyBoards),
    layout: { colMin: num(l.colMin, d.layout.colMin, 240, 420) }
  };
}

/* ——— URL ——— */
const ALLOWED = ['http:', 'https:', 'chrome:'];

export function normalizeUrl(raw) {
  const t = (raw || '').trim();
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(mailto|tel):/i.test(t)) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^/:]+:\d+(\/|$)/.test(t)) return t; // altro schema (verrà rifiutato da safeUrl)
  return 'https://' + t;
}

// Restituisce l'URL se ha uno schema ammesso (http, https, chrome), altrimenti ''.
export function safeUrl(raw) {
  try {
    const u = new URL(normalizeUrl(raw));
    return ALLOWED.includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

export function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'chrome:' ? 'chrome://' + u.host : u.host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function faviconUrl(pageUrl, size = 32) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}

/* ——— Stato ——— */
export const WS_EMOJI = ['🌤️', '💼', '🔬', '🤝', '🛒', '📚', '🎯', '🎨', '🧠', '🚀', '🏠', '⚡'];

export function defaultState() {
  const s = defaultSettings();
  const ws = { id: uid(), name: 'Personale', emoji: WS_EMOJI[0] };
  return {
    v: VERSION, activeWorkspace: ws.id, activePage: null, privacy: false, lastBoard: null, lastBackup: 0, nudgedAt: 0,
    settings: s,
    workspaces: [ws],
    pages: [{ id: uid(), ws: ws.id, name: 'Principale', boards: [{ id: uid(), name: 'Per iniziare', color: s.boardColors[0], links: [] }] }]
  };
}

// Rende valido qualsiasi dato letto da archivio o da un backup: niente può bloccare la nuova scheda.
export function sanitizeState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const settings = sanitizeSettings(raw.settings ? raw.settings : { name: raw.name });
  const used = new Set();
  const id = (v) => {
    let x = typeof v === 'string' && v && v.length < 40 ? v : uid();
    while (used.has(x)) x = uid();
    used.add(x);
    return x;
  };
  // Workspace: i dati vecchi (senza workspace) finiscono tutti in "Personale".
  let workspaces = (Array.isArray(raw.workspaces) ? raw.workspaces : [])
    .filter((w) => w && typeof w === 'object')
    .slice(0, 24)
    .map((w) => ({ id: id(w.id), name: str(w.name, 'Workspace', 30).trim() || 'Workspace', emoji: str(w.emoji, WS_EMOJI[0], 12) || WS_EMOJI[0], ...(typeof w.lastPage === 'string' ? { lastPage: w.lastPage } : {}) }));
  if (!workspaces.length) workspaces = [{ id: id(), name: 'Personale', emoji: WS_EMOJI[0] }];
  const wsIds = new Set(workspaces.map((w) => w.id));
  const pages = (Array.isArray(raw.pages) ? raw.pages : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: id(p.id),
      ws: wsIds.has(p.ws) ? p.ws : workspaces[0].id,
      name: str(p.name, 'Pagina', 40) || 'Pagina',
      boards: (Array.isArray(p.boards) ? p.boards : [])
        .filter((b) => b && typeof b === 'object')
        .map((b, bi) => ({
          id: id(b.id),
          name: str(b.name, 'Board', 60) || 'Board',
          color: hex(b.color, settings.boardColors[bi % settings.boardColors.length]),
          ...(b.collapsed === true ? { collapsed: true } : {}),
          ...(b.locked === true ? { locked: true } : {}),
          links: (Array.isArray(b.links) ? b.links : [])
            .filter((l) => l && typeof l === 'object')
            .map((l) => ({
              id: id(l.id), url: safeUrl(l.url), title: str(l.title, '', 200),
              ...(l.pinned === true ? { pinned: true } : {}),
              ...(HEX.test(l.color) ? { color: l.color } : {}),
              ...(typeof l.remind === 'number' && l.remind > 0 && l.remind < 4e12 ? { remind: l.remind } : {}),
              ...(l.notified === true && typeof l.remind === 'number' ? { notified: true } : {})
            }))
            .filter((l) => l.url)
            .map((l) => ({ ...l, title: l.title || hostOf(l.url) }))
        }))
    }));
  if (!pages.length) return { ...d, settings };
  // Ogni workspace ha almeno una pagina.
  for (const w of workspaces) {
    if (!pages.some((p) => p.ws === w.id)) pages.push({ id: id(), ws: w.id, name: 'Principale', boards: [] });
    if (w.lastPage && !pages.some((p) => p.id === w.lastPage && p.ws === w.id)) delete w.lastPage;
  }
  const activeWorkspace = wsIds.has(raw.activeWorkspace) ? raw.activeWorkspace : workspaces[0].id;
  const inWs = pages.filter((p) => p.ws === activeWorkspace);
  const activePage = inWs.some((p) => p.id === raw.activePage) ? raw.activePage : (inWs.find((p) => p.id === workspaces.find((w) => w.id === activeWorkspace)?.lastPage) || inWs[0]).id;
  return {
    v: VERSION,
    activeWorkspace,
    activePage,
    privacy: bool(raw.privacy, false),
    lastBoard: typeof raw.lastBoard === 'string' ? raw.lastBoard : null,
    lastBackup: num(raw.lastBackup, 0, 0, 4e12),
    nudgedAt: num(raw.nudgedAt, 0, 0, 4e12),
    settings,
    workspaces,
    pages
  };
}

export async function load() {
  const res = await chrome.storage.local.get(KEY);
  const s = sanitizeState(res[KEY]);
  if (!res[KEY] || JSON.stringify(res[KEY]) !== JSON.stringify(s)) await save(s);
  return s;
}

export function save(state) {
  return chrome.storage.local.set({ [KEY]: state });
}

export function onChange(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) cb(changes[KEY].newValue);
  });
}

export function boardPalette(state) {
  return state.settings.boardColors;
}

export function countLinks(state) {
  return state.pages.reduce((a, p) => a + p.boards.reduce((b, x) => b + x.links.length, 0), 0);
}

/* ——— Copie automatiche (una al giorno, ultime 5) ——— */
export async function listSnapshots() {
  const res = await chrome.storage.local.get(SNAP_KEY);
  return Array.isArray(res[SNAP_KEY]) ? res[SNAP_KEY] : [];
}

export async function snapshotIfDue(state) {
  if (countLinks(state) === 0) return;
  const snaps = await listSnapshots();
  const last = snaps[snaps.length - 1];
  if (last && Date.now() - last.t < 20 * 3600 * 1000) return;
  snaps.push({ t: Date.now(), n: countLinks(state), data: JSON.parse(JSON.stringify(state)) });
  await chrome.storage.local.set({ [SNAP_KEY]: snaps.slice(-5) });
}

/* ——— Foto personale (IndexedDB) ——— */
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('boards-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
export const putFile = (key, blob) => idbOp('readwrite', (s) => s.put(blob, key));
export const getFile = (key) => idbOp('readonly', (s) => s.get(key));
export const delFile = (key) => idbOp('readwrite', (s) => s.delete(key));

export { SOLIDS };
