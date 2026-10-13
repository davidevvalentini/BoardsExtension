// Promemoria dei link: controlla ogni minuto (e subito a ogni modifica) cosa è scaduto.
import { load, save, hostOf } from './store.js';
import { hasAccess, loadHealth, saveHealth, checkLinks, mergeHealth, dueForCheck, looksOffline } from './health.js';

const TICK = 'tick';
const SNOOZE = 3600e3;

async function ensureTick() {
  if (!(await chrome.alarms.get(TICK))) chrome.alarms.create(TICK, { periodInMinutes: 1 });
  if (!(await chrome.alarms.get('health'))) chrome.alarms.create('health', { delayInMinutes: 2, periodInMinutes: 360 });
}

function* links(state) {
  for (const p of state.pages) for (const b of p.boards) for (const l of b.links) yield l;
}

async function check() {
  let state;
  try { state = await load(); } catch { return; }
  const now = Date.now();
  let due = 0;
  let changed = false;
  for (const l of links(state)) {
    if (!l.remind || l.remind > now) continue;
    due++;
    if (l.notified) continue;
    l.notified = true;
    changed = true;
    chrome.notifications.create(`rem:${l.id}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: l.title,
      message: `Promemoria · ${hostOf(l.url)}`,
      requireInteraction: true,
      buttons: [{ title: 'Apri' }, { title: 'Rimanda di 1 ora' }]
    });
  }
  if (changed) await save(state);
  chrome.action.setBadgeBackgroundColor({ color: '#7CC4FF' });
  chrome.action.setBadgeText({ text: due ? String(due) : '' });
}

async function update(id, fn) {
  const state = await load();
  for (const l of links(state)) {
    if (l.id === id) { fn(l); await save(state); return l; }
  }
  return null;
}

async function open(id) {
  const l = await update(id, (x) => { delete x.remind; delete x.notified; });
  if (l) chrome.tabs.create({ url: l.url });
  chrome.notifications.clear(`rem:${id}`);
  check();
}

chrome.notifications.onClicked.addListener((nid) => { if (nid.startsWith('rem:')) open(nid.slice(4)); });
chrome.notifications.onButtonClicked.addListener(async (nid, btn) => {
  if (!nid.startsWith('rem:')) return;
  const id = nid.slice(4);
  if (btn === 0) { open(id); return; }
  await update(id, (x) => { x.remind = Date.now() + SNOOZE; delete x.notified; });
  chrome.notifications.clear(nid);
  check();
});

// Controllo dei link rotti (solo se l'hai attivato e hai dato il permesso): ogni link al massimo una volta a settimana.
async function healthRun() {
  try {
    const state = await load();
    if (!state.settings.healthCheck || !(await hasAccess()) || !self.navigator.onLine) return;
    const old = await loadHealth();
    const all = [...links(state)];
    const todo = all.filter((l) => dueForCheck(old.items[l.id])).sort((a, b) => (old.items[a.id]?.t || 0) - (old.items[b.id]?.t || 0));
    if (!todo.length) return;
    const results = await checkLinks(todo, { deadline: Date.now() + 4 * 60e3 });
    if (looksOffline(results)) return;
    const fresh = await loadHealth();
    await saveHealth(mergeHealth(fresh, results, all.map((l) => l.id)));
  } catch { /* riproverà alla prossima occasione */ }
}

chrome.alarms.onAlarm.addListener((a) => (a.name === 'health' ? healthRun() : check()));
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.boards) check(); });
chrome.runtime.onInstalled.addListener(() => { ensureTick(); check(); });
chrome.runtime.onStartup.addListener(() => { ensureTick(); check(); });
ensureTick();
