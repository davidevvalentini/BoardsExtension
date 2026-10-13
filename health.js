// Controllo dei link rotti. Condiviso da nuova scheda (controllo manuale) e service worker (controllo periodico).
// Serve il permesso opzionale «accesso a tutti i siti»: viene chiesto solo quando lo attivi tu.
// I risultati stanno in una chiave separata (linkHealth), così non si scontrano con i dati principali.

const KEY = 'linkHealth';
const ORIGINS = { origins: ['<all_urls>'] };
const WEEK = 7 * 86400e3;

export const hasAccess = () => chrome.permissions.contains(ORIGINS);
export const requestAccess = () => chrome.permissions.request(ORIGINS);
export const dropAccess = () => chrome.permissions.remove(ORIGINS);

export async function loadHealth() {
  const res = await chrome.storage.local.get(KEY);
  const v = res[KEY];
  return v && typeof v === 'object' && v.items && typeof v.items === 'object' ? v : { t: 0, items: {} };
}
export const saveHealth = (h) => chrome.storage.local.set({ [KEY]: h });

// Indirizzi che non ha senso controllare da qui (rete locale, pagine di Chrome).
export function skippable(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return true;
    const h = u.hostname;
    return h === 'localhost' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || !h.includes('.');
  } catch {
    return true;
  }
}

async function request(url, method, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { method, redirect: 'follow', cache: 'no-store', credentials: 'omit', signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 401, 403, 429 e simili: il sito risponde ma non ci lascia entrare → il link va considerato vivo.
const ALIVE_ANYWAY = new Set([401, 403, 405, 406, 429, 451, 999]);

// Restituisce { ok, s } dove s è il codice HTTP (0 = nessuna risposta) e e il tipo di errore.
export async function probe(url, ms = 12000) {
  let last = { ok: false, s: 0, e: 'rete' };
  for (const attempt of [0, 1]) {
    try {
      let res = await request(url, 'HEAD', ms);
      // Alcuni server rifiutano HEAD: si riprova con GET.
      if (res.status >= 400 && res.status !== 404 && res.status !== 410) res = await request(url, 'GET', ms);
      if (res.status < 400 || ALIVE_ANYWAY.has(res.status)) return { ok: true, s: res.status };
      last = { ok: false, s: res.status };
      if (res.status === 404 || res.status === 410) return last;
    } catch (err) {
      last = { ok: false, s: 0, e: err?.name === 'AbortError' ? 'timeout' : 'rete' };
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
  }
  return last;
}

// Controlla i link dati (con poche richieste in parallelo). `onResult(link, record, done, total)`.
export async function checkLinks(links, { onResult, shouldStop, deadline = Infinity, concurrency = 6 } = {}) {
  const queue = links.filter((l) => !skippable(l.url));
  const total = queue.length;
  let done = 0;
  const out = {};
  const worker = async () => {
    while (queue.length) {
      if (shouldStop?.() || Date.now() > deadline) return;
      const l = queue.shift();
      const r = await probe(l.url);
      const rec = { t: Date.now(), ok: r.ok, s: r.s, ...(r.e ? { e: r.e } : {}) };
      out[l.id] = rec;
      done++;
      onResult?.(l, rec, done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return out;
}

// Unisce nuovi risultati, tenendo traccia degli ignorati e scartando i link che non esistono più.
export function mergeHealth(old, results, liveIds) {
  const items = {};
  for (const id of liveIds) {
    const prev = old.items[id];
    const next = results[id];
    if (next) items[id] = { ...next, ...(prev?.ignore && !next.ok ? { ignore: true } : {}) };
    else if (prev) items[id] = prev;
  }
  return { t: Date.now(), items, notified: old.notified || 0 };
}

// Se quasi tutto fallisce senza risposta, il problema è la connessione, non i link: meglio non segnalare nulla.
export function looksOffline(results) {
  const recs = Object.values(results);
  if (recs.length < 8) return false;
  return recs.filter((r) => !r.ok && r.s === 0).length / recs.length >= 0.7;
}

export const brokenOf = (h) => Object.entries(h.items).filter(([, r]) => !r.ok && !r.ignore).map(([id, r]) => ({ id, ...r }));
export const dueForCheck = (rec) => !rec || Date.now() - rec.t > WEEK;

export function describe(rec) {
  if (rec.s === 404 || rec.s === 410) return 'Pagina non trovata (404)';
  if (rec.s >= 500) return `Errore del server (${rec.s})`;
  if (rec.s) return `Errore ${rec.s}`;
  return rec.e === 'timeout' ? 'Non risponde (tempo scaduto)' : 'Sito non raggiungibile';
}
