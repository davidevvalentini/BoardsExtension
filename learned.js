// Regole apprese durante lo smistamento: «questo sito va in quella pagina/board».
// Stanno in una chiave a parte (importRules), fuori dai backup condivisi.
import { hostKey } from './classify.js';

const KEY = 'importRules';
const MAX = 500;

const clean = (raw) => (Array.isArray(raw) ? raw : [])
  .filter((r) => r && typeof r.host === 'string' && typeof r.page === 'string' && typeof r.board === 'string' && r.host && r.page && r.board)
  .map((r) => ({ host: r.host.slice(0, 120), page: r.page.slice(0, 40), board: r.board.slice(0, 60) }))
  .slice(-MAX);

export async function loadRules() {
  const res = await chrome.storage.local.get(KEY);
  return clean(res[KEY]);
}
export const saveRules = (rules) => chrome.storage.local.set({ [KEY]: clean(rules) });
export const clearRules = () => chrome.storage.local.remove(KEY);

// Aggiunge (o sostituisce) la regola per il sito del link. Restituisce un nuovo elenco.
export function learn(rules, link, dest) {
  const host = hostKey(link.url);
  if (!host) return rules;
  return clean([...rules.filter((r) => r.host !== host), { host, page: dest.page, board: dest.board }]);
}
