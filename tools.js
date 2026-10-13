// Strumenti di manutenzione: ricerca dei doppioni e controllo dei link rotti.
import { findDuplicates, hostOf } from './store.js';
import { h, icon } from './ui.js';
import {
  hasAccess, requestAccess, loadHealth, saveHealth, checkLinks, mergeHealth, brokenOf, describe, skippable, looksOffline
} from './health.js';

function shell(title, wide = true) {
  const dlg = h('dialog', { class: 'dlg tool-dlg' + (wide ? ' wide' : ''), 'aria-label': title });
  const body = h('div', { class: 'tool-body' });
  dlg.append(
    h('div', { class: 'tool-head' }, h('h2', {}, title),
      h('button', { type: 'button', class: 'icon-btn bare', 'aria-label': 'Chiudi', onclick: () => dlg.close() }, icon('x', 20))),
    body);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, body };
}

const placeOf = (st, page, board) => {
  const w = st.workspaces.length > 1 ? st.workspaces.find((x) => x.id === page.ws) : null;
  return `${w ? w.emoji + ' ' : ''}${page.name} › ${board.name}`;
};
const pluralLink = (n) => `${n} ${n === 1 ? 'link' : 'link'}`;

/* ——— Doppioni ——— */
// Tra i doppioni si tiene quello "più curato" (fissato, colorato, con promemoria), altrimenti il primo.
const worth = (l) => (l.pinned ? 4 : 0) + (l.color ? 2 : 0) + (l.remind ? 1 : 0);

export function openDuplicates(ctx) {
  const { dlg, body } = shell('Link doppi');

  function plan() {
    return findDuplicates(ctx.getState()).map((g) => {
      const keep = g.items.reduce((best, it) => (worth(it.link) > worth(best.link) ? it : best), g.items[0]);
      const extra = g.items.filter((it) => it !== keep && !it.board.locked);
      return { ...g, keep, extra };
    }).filter((g) => g.extra.length);
  }

  async function remove(groups) {
    const ids = groups.flatMap((g) => g.extra.map((it) => it.link.id));
    if (!ids.length) return;
    await ctx.removeLinks(ids, ids.length === 1 ? 'Doppione eliminato.' : `${ids.length} doppioni eliminati.`);
    draw();
  }

  function draw() {
    const st = ctx.getState();
    const groups = plan();
    const total = groups.reduce((a, g) => a + g.extra.length, 0);
    if (!groups.length) {
      body.replaceChildren(
        h('p', { class: 'tool-empty' }, icon('check', 22), 'Nessun link doppio.'),
        h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn-solid', onclick: () => dlg.close() }, 'Chiudi')));
      return;
    }
    body.replaceChildren(
      h('p', { class: 'dlg-text tool-lead' }, `${groups.length} ${groups.length === 1 ? 'indirizzo compare' : 'indirizzi compaiono'} più volte (${total} ${total === 1 ? 'copia' : 'copie'} in più). Di ognuno si tiene la copia con colore, pin o promemoria, altrimenti la prima.`),
      h('div', { class: 'tool-list' }, groups.map((g) => h('div', { class: 'tool-item' },
        h('div', { class: 'tool-main' },
          h('strong', {}, g.keep.link.title),
          h('small', {}, hostOf(g.keep.link.url)),
          h('ul', { class: 'tool-places' },
            h('li', { class: 'keep' }, icon('check', 14), `Resta: ${placeOf(st, g.keep.page, g.keep.board)}`),
            g.extra.map((it) => h('li', {}, icon('trash', 14), `Via: ${placeOf(st, it.page, it.board)}`)))),
        h('button', { type: 'button', class: 'btn-soft', onclick: () => remove([g]) }, 'Elimina')))),
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => dlg.close() }, 'Chiudi'),
        h('button', { type: 'button', class: 'btn-solid danger', onclick: () => remove(groups) }, `Elimina tutte le copie in più (${total})`)));
  }
  draw();
}

/* ——— Link rotti ——— */
export async function openBroken(ctx) {
  const { dlg, body } = shell('Link rotti');
  let stop = false;
  dlg.addEventListener('close', () => { stop = true; });

  const allLinks = () => {
    const out = [];
    for (const page of ctx.getState().pages) for (const board of page.boards) for (const link of board.links) out.push({ link, board, page });
    return out;
  };

  async function intro() {
    const granted = await hasAccess();
    const n = allLinks().filter((x) => !skippable(x.link.url)).length;
    body.replaceChildren(
      h('p', { class: 'dlg-text' }, `Per sapere se un indirizzo risponde, Chrome deve poterlo contattare. Controllo ${n} link, pochi alla volta; non viene mandato nulla se non una richiesta all’indirizzo stesso, e i risultati restano su questo computer.`),
      !granted ? h('p', { class: 'dlg-text' }, 'Ti verrà chiesto il permesso di accedere ai siti, solo per questo controllo.') : null,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => dlg.close() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn-solid', onclick: async () => { if (granted || await requestAccess()) scan(); } }, granted ? 'Controlla ora' : 'Consenti e controlla')));
  }

  async function scan() {
    stop = false;
    const items = allLinks();
    const bar = h('div', { class: 'tool-bar' }, h('span'));
    const label = h('p', { class: 'dlg-text' }, 'Controllo in corso…');
    body.replaceChildren(label, bar,
      h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn-ghost', onclick: () => { stop = true; } }, 'Interrompi')));
    const old = await loadHealth();
    const results = await checkLinks(items.map((x) => x.link), {
      shouldStop: () => stop,
      onResult: (l, rec, done, total) => {
        bar.firstChild.style.width = `${Math.round((done / total) * 100)}%`;
        label.textContent = `Controllati ${done} su ${total}…`;
      }
    });
    if (looksOffline(results)) {
      body.replaceChildren(
        h('p', { class: 'dlg-text' }, 'Quasi nessun sito ha risposto: probabilmente la connessione non funziona. Non salvo nessun risultato, così non segnalo link che in realtà vanno bene.'),
        h('div', { class: 'dlg-actions' },
          h('button', { type: 'button', class: 'btn-ghost', onclick: () => dlg.close() }, 'Chiudi'),
          h('button', { type: 'button', class: 'btn-solid', onclick: () => intro() }, 'Riprova')));
      return;
    }
    const next = mergeHealth(old, results, items.map((x) => x.link.id));
    // Un link riuscito ora non deve restare segnato come rotto.
    for (const [id, r] of Object.entries(results)) if (r.ok) next.items[id] = r;
    next.notified = next.t; // l'hai appena visto tu: niente avviso alla prossima apertura
    await saveHealth(next);
    ctx.refresh();
    if (!dlg.open) return;
    showResults(next, stop);
  }

  async function showResults(health, interrupted = false) {
    health ||= await loadHealth();
    const st = ctx.getState();
    const byId = new Map(allLinks().map((x) => [x.link.id, x]));
    const broken = brokenOf(health).filter((b) => byId.has(b.id));
    const checked = Object.keys(health.items).filter((id) => byId.has(id)).length;
    const when = health.t ? new Date(health.t).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';

    const head = broken.length
      ? `${broken.length} ${broken.length === 1 ? 'link non risponde' : 'link non rispondono'} (su ${checked} controllati${interrupted ? ', controllo interrotto' : ''}). Un sito può essere solo momentaneamente fuori uso: controlla prima di eliminare.`
      : `Tutti i link controllati rispondono (${checked}${interrupted ? ', controllo interrotto' : ''}).`;
    const actions = h('div', { class: 'dlg-actions' },
      when ? h('span', { class: 'tool-when' }, `Ultimo controllo: ${when}`) : null,
      h('button', { type: 'button', class: 'btn-ghost', onclick: () => dlg.close() }, 'Chiudi'),
      h('button', { type: 'button', class: 'btn-soft', onclick: () => intro() }, 'Ricontrolla'),
      broken.length ? h('button', {
        type: 'button', class: 'btn-solid danger',
        onclick: async () => {
          const ids = broken.filter((b) => !byId.get(b.id).board.locked).map((b) => b.id);
          if (!ids.length) return;
          await ctx.removeLinks(ids, `${ids.length} link eliminati.`);
          showResults();
        }
      }, `Elimina tutti (${broken.filter((b) => !byId.get(b.id).board.locked).length})`) : null);

    body.replaceChildren(
      h('p', { class: 'dlg-text tool-lead' }, head),
      broken.length ? h('div', { class: 'tool-list' }, broken.map((b) => {
        const x = byId.get(b.id);
        return h('div', { class: 'tool-item' },
          h('div', { class: 'tool-main' },
            h('strong', {}, x.link.title),
            h('small', {}, `${hostOf(x.link.url)} · ${describe(b)}`),
            h('small', {}, placeOf(st, x.page, x.board))),
          h('div', { class: 'tool-btns' },
            h('button', { type: 'button', class: 'icon-btn bare', title: 'Apri per verificare', 'aria-label': 'Apri', onclick: () => ctx.openUrl(x.link.url) }, icon('external', 18)),
            h('button', { type: 'button', class: 'btn-soft', title: 'Il link è a posto: non segnalarlo più', onclick: async () => {
              const hh = await loadHealth();
              if (hh.items[b.id]) hh.items[b.id].ignore = true;
              await saveHealth(hh);
              ctx.refresh();
              showResults();
            } }, 'Ignora'),
            x.board.locked ? null : h('button', { type: 'button', class: 'icon-btn bare', title: 'Elimina', 'aria-label': 'Elimina', onclick: async () => {
              await ctx.removeLinks([b.id], 'Link eliminato.');
              showResults();
            } }, icon('trash', 18))));
      })) : null,
      actions);
  }

  const known = await loadHealth();
  if (Object.keys(known.items).length && await hasAccess()) showResults(known);
  else intro();
}
