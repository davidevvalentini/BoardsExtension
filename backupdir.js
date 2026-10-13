// Backup automatico in una cartella scelta da te (es. Google Drive, Dropbox, un disco esterno).
// Usa l'API di accesso ai file di Chrome: l'estensione scrive solo dentro quella cartella.
import { putFile, getFile, delFile } from './store.js';

const HANDLE = 'backup-dir';
const META = 'backupDirMeta';
const KEEP = 10;
const NAME = /^boards-backup-\d{4}-\d{2}-\d{2}\.json$/;

export const supported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export async function readMeta() {
  const res = await chrome.storage.local.get(META);
  return res[META] && typeof res[META] === 'object' ? res[META] : { name: '', t: 0, err: '' };
}
const writeMeta = (m) => chrome.storage.local.set({ [META]: m });

async function handle() {
  try { return (await getFile(HANDLE)) || null; } catch { return null; }
}

// 'none' = nessuna cartella · 'granted' = pronta · 'prompt' = serve riautorizzare (un clic)
export async function status() {
  const dir = await handle();
  if (!dir) return { state: 'none', meta: await readMeta() };
  let perm = 'prompt';
  try { perm = await dir.queryPermission({ mode: 'readwrite' }); } catch { /* resta prompt */ }
  return { state: perm === 'granted' ? 'granted' : 'prompt', name: dir.name, meta: await readMeta() };
}

export async function choose(picker = window.showDirectoryPicker.bind(window)) {
  const dir = await picker({ id: 'boards-backup', mode: 'readwrite', startIn: 'documents' });
  await putFile(HANDLE, dir);
  await writeMeta({ name: dir.name, t: 0, err: '' });
  return dir;
}

export async function unlink() {
  await delFile(HANDLE).catch(() => {});
  await writeMeta({ name: '', t: 0, err: '' });
}

export async function reauthorize() {
  const dir = await handle();
  if (!dir) return false;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

const dayStamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Scrive il file del giorno (sovrascrivendo quello di oggi) e tiene solo le ultime KEEP copie.
export async function writeNow(state) {
  const dir = await handle();
  if (!dir) return { ok: false, err: 'Nessuna cartella scelta.' };
  try {
    if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Serve riautorizzare la cartella.');
    const file = await dir.getFileHandle(`boards-backup-${dayStamp()}.json`, { create: true });
    const w = await file.createWritable();
    await w.write(JSON.stringify(state, null, 2));
    await w.close();
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && NAME.test(name)) names.push(name);
    names.sort();
    for (const old of names.slice(0, Math.max(0, names.length - KEEP))) await dir.removeEntry(old).catch(() => {});
    const meta = { name: dir.name, t: Date.now(), err: '' };
    await writeMeta(meta);
    return { ok: true, meta };
  } catch (e) {
    const err = e?.message || 'Impossibile scrivere nella cartella.';
    await writeMeta({ ...(await readMeta()), err });
    return { ok: false, err };
  }
}

// Chiamata all'avvio e dopo le modifiche: scrive solo se è passato abbastanza tempo.
export async function maybeWrite(state, minGapMs) {
  const st = await status();
  if (st.state !== 'granted') return st.state;
  if (Date.now() - (st.meta.t || 0) < minGapMs) return 'recent';
  return (await writeNow(state)).ok ? 'written' : 'error';
}
