// To-do dal Second Brain: configurazione, lettura dall'API della tua app e normalizzazione.
// Indirizzo e token stanno in una chiave a parte (todoConfig): NON fanno parte dei backup esportati.

const CFG = 'todoConfig';
const CACHE = 'todoCache';

export const defaultConfig = () => ({ mode: 'mcp', url: '', auth: 'bearer', token: '', appUrl: '' });

export function sanitizeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const url = (s) => {
    try { const u = new URL(String(s || '').trim()); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
  };
  return {
    mode: r.mode === 'http' ? 'http' : 'mcp',
    url: url(r.url),
    auth: ['none', 'bearer', 'query'].includes(r.auth) ? r.auth : 'none',
    token: typeof r.token === 'string' ? r.token.trim().slice(0, 500) : '',
    appUrl: url(r.appUrl)
  };
}

export async function loadConfig() {
  const res = await chrome.storage.local.get(CFG);
  return sanitizeConfig(res[CFG]);
}
export const saveConfig = (c) => chrome.storage.local.set({ [CFG]: sanitizeConfig(c) });

export async function loadCache() {
  const res = await chrome.storage.local.get(CACHE);
  const c = res[CACHE];
  return c && Array.isArray(c.items) ? { t: Number(c.t) || 0, items: c.items } : { t: 0, items: [] };
}
export const saveCache = (items) => chrome.storage.local.set({ [CACHE]: { t: Date.now(), items } });

/* ——— Permesso sul sito (chiesto solo quando salvi l'indirizzo) ——— */
// I permessi per i siti ignorano la porta: basta schema e nome dell'host.
export const originPattern = (url) => { const u = new URL(url); return `${u.protocol}//${u.hostname}/*`; };
export const hasPermission = (url) => chrome.permissions.contains({ origins: [originPattern(url)] });
export const requestPermission = (url) => chrome.permissions.request({ origins: [originPattern(url)] });

/* ——— Lettura ——— */
export async function fetchRaw(cfg, ms = 8000) {
  if (!cfg.url) throw new Error('Indirizzo dei to-do non impostato.');
  const u = new URL(cfg.url);
  const headers = { Accept: 'application/json' };
  if (cfg.auth === 'bearer' && cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  if (cfg.auth === 'query' && cfg.token) u.searchParams.set('token', cfg.token);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  let res;
  try {
    res = await fetch(u.href, { headers, credentials: 'omit', cache: 'no-store', signal: ctl.signal });
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'Nessuna risposta dalla tua app (tempo scaduto).' : 'Non riesco a raggiungere la tua app: è accesa e raggiungibile da questo computer?');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new Error('Accesso negato: controlla il token.');
  if (res.status === 404) throw new Error('Indirizzo non trovato (404): controlla il percorso.');
  if (!res.ok) throw new Error(`La tua app ha risposto con errore ${res.status}.`);
  try { return await res.json(); } catch { throw new Error('La risposta non è un elenco in formato JSON.'); }
}

/* ——— Server MCP (Streamable HTTP): initialize → tools/call read_collection("todos") ——— */
const MCP_VERSION = '2025-06-18';

function mcpHeaders(cfg, session) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': MCP_VERSION };
  if (cfg.auth === 'bearer' && cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  if (session) headers['Mcp-Session-Id'] = session;
  return headers;
}
function mcpUrl(cfg) {
  const u = new URL(cfg.url);
  if (cfg.auth === 'query' && cfg.token) u.searchParams.set('token', cfg.token);
  return u.href;
}

// La risposta può essere JSON semplice oppure un flusso SSE: si cerca il messaggio con l'id richiesto.
async function readRpc(res, id) {
  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!text.trim()) return null;
  if (type.includes('text/event-stream')) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      try { const m = JSON.parse(data); if (m.id === id) return m; } catch { /* evento non JSON */ }
    }
    return null;
  }
  try { return JSON.parse(text); } catch { throw new Error('Il server MCP ha risposto in un formato inatteso.'); }
}

function httpError(res) {
  if (res.status === 401 || res.status === 403) return new Error('Accesso negato: controlla il token.');
  if (res.status === 404 || res.status === 405) return new Error('Indirizzo MCP non valido: controlla il percorso (di solito termina con /mcp).');
  return new Error(`Il server MCP ha risposto con errore ${res.status}.`);
}

async function post(cfg, body, session, signal) {
  let res;
  try {
    res = await fetch(mcpUrl(cfg), { method: 'POST', headers: mcpHeaders(cfg, session), body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal });
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'Nessuna risposta dal server MCP (tempo scaduto).' : 'Non riesco a raggiungere il server MCP: è acceso e raggiungibile da questo computer?');
  }
  if (!res.ok) throw httpError(res);
  return res;
}

// Esegue una sola chiamata a uno strumento MCP e ne restituisce il testo.
export async function mcpCall(cfg, tool, args, ms = 12000) {
  if (!cfg.url) throw new Error('Indirizzo del server MCP non impostato.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  let session = '';
  try {
    const init = await post(cfg, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'boards-newtab', version: '1' } } }, '', ctl.signal);
    session = init.headers.get('mcp-session-id') || '';
    const hello = await readRpc(init, 1);
    if (hello?.error) throw new Error(hello.error.message || 'Il server MCP ha rifiutato la connessione.');
    await post(cfg, { jsonrpc: '2.0', method: 'notifications/initialized' }, session, ctl.signal).then((r) => r.text()).catch(() => {});
    const res = await post(cfg, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }, session, ctl.signal);
    const msg = await readRpc(res, 2);
    if (!msg) throw new Error('Il server MCP non ha risposto alla richiesta.');
    if (msg.error) throw new Error(msg.error.message || 'Errore del server MCP.');
    const text = (msg.result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    if (msg.result?.isError) throw new Error(text || 'Lo strumento MCP ha restituito un errore.');
    return text;
  } finally {
    clearTimeout(timer);
    if (session) fetch(mcpUrl(cfg), { method: 'DELETE', headers: mcpHeaders(cfg, session), credentials: 'omit' }).catch(() => {}); // chiude la sessione, se il server la usa
  }
}

// Legge la collezione «todos» (a pagine da 200), con l'intestazione «[3 di 58, offset 0]» davanti a ogni pagina.
export async function mcpTodos(cfg) {
  const all = [];
  let offset = 0;
  for (let guard = 0; guard < 10; guard++) {
    const text = await mcpCall(cfg, 'read_collection', { name: 'todos', limit: 200, offset });
    const head = text.match(/^\s*\[(\d+) di (\d+), offset (\d+)\]\s*/);
    let list;
    try { list = JSON.parse(head ? text.slice(head[0].length) : text); } catch { throw new Error('Non riesco a leggere i to-do restituiti dal server MCP.'); }
    list = extractList(list);
    if (!list) throw new Error('Non trovo un elenco di to-do nella risposta.');
    all.push(...list);
    const total = head ? Number(head[2]) : all.length;
    if (!list.length || all.length >= total) break;
    offset = all.length;
  }
  return all;
}

export function extractList(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const k of ['todos', 'items', 'data', 'results', 'tasks']) if (Array.isArray(json[k])) return json[k];
  }
  return null;
}

const PRIORITY = { high: 'high', alta: 'high', urgent: 'high', 3: 'high', medium: 'medium', media: 'medium', normal: 'medium', 2: 'medium', low: 'low', bassa: 'low', 1: 'low' };
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

// Porta un elemento della tua app a una forma semplice; accetta qualche variante dei nomi dei campi.
export function normalize(raw, i = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? raw.text ?? raw.name ?? raw.content ?? '').trim();
  if (!title) return null;
  const status = String(raw.status ?? '').toLowerCase();
  const done = raw.done === true || raw.completed === true || !!raw.completedAt || !!raw.doneAt || ['done', 'completed', 'complete', 'fatto', 'archived'].includes(status);
  return {
    id: String(raw.id ?? `i${i}`),
    title: title.slice(0, 400),
    priority: PRIORITY[String(raw.priority ?? '').toLowerCase()] || 'medium',
    activation: day(raw.activationDate ?? raw.dueDate ?? raw.due ?? raw.date),
    forMonth: typeof raw.forMonth === 'string' && /^\d{4}-\d{2}/.test(raw.forMonth) ? raw.forMonth.slice(0, 7) : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    done
  };
}

const pad = (n) => String(n).padStart(2, '0');
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// «Attivo»: la data di attivazione è arrivata (o non c'è) e il mese previsto non è nel futuro.
export function isActive(t, now = new Date()) {
  if (t.activation && t.activation > todayKey(now)) return false;
  if (t.forMonth && t.forMonth > todayKey(now).slice(0, 7)) return false;
  return true;
}

const RANK = { high: 0, medium: 1, low: 2 };
export function sortTodos(list) {
  return [...list].sort((a, b) => RANK[a.priority] - RANK[b.priority]
    || (a.activation || '9999').localeCompare(b.activation || '9999')
    || a.createdAt.localeCompare(b.createdAt));
}

// Legge, normalizza e tiene solo i to-do aperti. Restituisce { items, total }.
export async function fetchOpen(cfg) {
  const list = cfg.mode === 'mcp' ? await mcpTodos(cfg) : extractList(await fetchRaw(cfg));
  if (!list) throw new Error('Non trovo un elenco di to-do nella risposta.');
  const items = list.map(normalize).filter((t) => t && !t.done);
  return { items, total: list.length };
}
