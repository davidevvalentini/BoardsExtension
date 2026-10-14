// Importazione guidata: struttura → anteprima → smistamento. Non scrive nulla: restituisce un piano confermato.
import { h, icon } from './ui.js';
import { hostOf } from './store.js';
import { buildPlan, MAX_BOARD } from './importer.js';
import { classify, CATEGORIES, INBOX } from './classify.js';
import { loadRules, learn } from './learned.js';

const STRUCTURES = [
  ['folders', 'Segui le mie cartelle', 'Ogni cartella principale diventa una pagina, le sottocartelle diventano board. I link sciolti vengono assegnati in automatico.'],
  ['template', 'Modello di pagine', 'Lavoro, Finanza, Casa, Viaggi, Svago, Risorse: i link vengono distribuiti per argomento, ignorando le cartelle.'],
  ['inbox', 'Tutto in «Da smistare»', 'Un’unica pagina: poi li smisti uno alla volta o li riordini a mano.']
];

const alive = (plan) => plan.pages.filter((p) => !p.off).flatMap((p) => p.boards.filter((b) => !b.off).flatMap((b) => b.links.filter((l) => !l.off)));
const inboxLinks = (plan) => plan.pages.filter((p) => p.name === INBOX).flatMap((p) => p.boards.flatMap((b) => b.links.filter((l) => !l.off)));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const baseName = (n) => n.replace(/ \(\d+\)$/, '');

// Le board non superano MAX_BOARD link anche dopo lo smistamento: l'eccedenza va in «Nome (2)», «Nome (3)»…
function spill(boards) {
  const used = new Set(boards.map((b) => b.name));
  const out = [];
  for (const b of boards) {
    out.push(b);
    let rest = b.links.slice(MAX_BOARD);
    b.links = b.links.slice(0, MAX_BOARD);
    for (let k = 2; rest.length; k++) {
      let name = `${baseName(b.name).slice(0, 54)} (${k})`;
      while (used.has(name)) name = `${baseName(b.name).slice(0, 54)} (${++k})`;
      used.add(name);
      out.push({ name, links: rest.slice(0, MAX_BOARD) });
      rest = rest.slice(MAX_BOARD);
    }
  }
  return out;
}

function finalPlan(plan) {
  const pages = plan.pages.filter((p) => !p.off).map((p) => ({
    name: p.name.trim().slice(0, 40) || 'Senza nome',
    boards: spill(p.boards.filter((b) => !b.off).map((b) => ({
      name: b.name.trim().slice(0, 60) || 'Senza nome',
      links: b.links.filter((l) => !l.off).map(({ url, title }) => ({ url, title }))
    })).filter((b) => b.links.length))
  })).filter((p) => p.boards.length);
  return { pages, dropped: plan.dropped };
}

function destPage(plan, name) {
  let page = plan.pages.find((p) => p.name === name);
  if (!page) { page = { name, boards: [] }; plan.pages.push(page); }
  return page;
}
function destBoard(page, name) {
  let board = page.boards.find((b) => b.name === name);
  if (!board) { board = { name, links: [] }; page.boards.push(board); }
  return board;
}
function removeLink(plan, link) {
  for (const p of plan.pages) for (const b of p.boards) { const i = b.links.indexOf(link); if (i >= 0) b.links.splice(i, 1); }
}

// Elenco delle destinazioni scelte nello smistamento: prima il suggerimento, poi board esistenti, poi le categorie.
function destinations(plan, suggestion) {
  const list = [];
  const add = (page, board) => { if (page !== INBOX && !list.some((d) => d.page === page && d.board === board)) list.push({ page, board }); };
  if (suggestion && suggestion.score > 0) add(suggestion.page, suggestion.board);
  for (const p of plan.pages) for (const b of p.boards) if (p.name !== INBOX) add(p.name, b.name);
  for (const c of CATEGORIES) add(c, c);
  return list;
}

export async function runWizard(items, ctx = {}) {
  let rules = await loadRules();
  let structure = 'folders';
  let target = 'current';
  let plan = null;
  let done = false;
  const probe = buildPlan(items, { structure: 'inbox' });
  const valid = probe.pages.reduce((a, p) => a + p.boards.reduce((b, x) => b + x.links.length, 0), 0);

  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dlg tool-dlg wide wiz', 'aria-label': 'Importazione guidata' });
    const head = h('div', { class: 'tool-head' }, h('h2', {}), h('button', { type: 'button', class: 'icon-btn bare', 'aria-label': 'Chiudi', onclick: () => dlg.close() }, icon('x', 20)));
    const body = h('div', { class: 'tool-body' });
    dlg.append(head, body);
    const title = (t) => { head.querySelector('h2').textContent = t; };
    const finish = (value) => { done = true; resolve(value); dlg.close(); };

    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); if (!done) resolve(null); });

    /* ——— 1. Struttura ——— */
    function stepStructure() {
      title(`Importare ${valid} link?`);
      const opts = h('div', { class: 'imp-opts', role: 'radiogroup', 'aria-label': 'Struttura' },
        STRUCTURES.map(([v, t, hint]) => h('label', { class: 'imp-opt' },
          h('input', { type: 'radio', name: 'wiz-structure', value: v, checked: v === structure, onchange: () => { structure = v; } }),
          h('span', {}, h('strong', {}, t), h('small', {}, hint)))));
      const where = h('div', { class: 'imp-opts', role: 'radiogroup', 'aria-label': 'Dove importare' },
        [['current', `Nel workspace «${ctx.workspaceName || 'attuale'}»`, 'Le pagine si aggiungono a quelle che hai già.'],
          ['new', 'In un nuovo workspace «Importati»', 'Il tuo ordine attuale non viene toccato: poi sposti le pagine dove vuoi.']]
          .map(([v, t, hint]) => h('label', { class: 'imp-opt' },
            h('input', { type: 'radio', name: 'wiz-where', value: v, checked: v === target, onchange: () => { target = v; } }),
            h('span', {}, h('strong', {}, t), h('small', {}, hint)))));
      body.replaceChildren(
        probe.dropped ? h('p', { class: 'dlg-text tool-lead' }, `${plural(probe.dropped, 'segnalibro scartato', 'segnalibri scartati')} (doppioni o indirizzi non web).`) : null,
        h('p', { class: 'wiz-q' }, 'Come vuoi organizzarli?'), opts,
        h('p', { class: 'wiz-q' }, 'Dove?'), where,
        h('div', { class: 'dlg-actions' },
          h('button', { type: 'button', class: 'btn-ghost', onclick: () => dlg.close() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn-solid', id: 'wiz-next', onclick: () => { plan = buildPlan(items, { structure, rules }); stepPreview(); } }, 'Avanti')));
      body.querySelector('input[name="wiz-structure"]:checked')?.focus();
    }

    /* ——— 2. Anteprima ——— */
    const open = new Set();
    function stepPreview() {
      const scroll = body.scrollTop;
      const links = alive(plan);
      const sortCount = inboxLinks(plan).length;
      title('Anteprima');
      const otherPages = (p) => plan.pages.filter((x) => x !== p);

      const tree = h('div', { class: 'wiz-tree' }, plan.pages.map((p) => h('section', { class: 'wiz-page' + (p.off ? ' off' : '') },
        h('div', { class: 'wiz-row' },
          h('input', { type: 'checkbox', checked: !p.off, 'aria-label': `Importa la pagina ${p.name}`, onchange: (e) => { p.off = !e.target.checked; stepPreview(); } }),
          h('input', { type: 'text', class: 'wiz-name', value: p.name, maxlength: 40, 'aria-label': 'Nome della pagina', onchange: (e) => { p.name = e.target.value; stepPreview(); } }),
          h('span', { class: 'wiz-count' }, plural(p.boards.reduce((a, b) => a + b.links.filter((l) => !l.off).length, 0), 'link', 'link'))),
        p.boards.map((b) => {
          const key = `${p.name}\u0000${b.name}`;
          return h('div', { class: 'wiz-board' + (b.off ? ' off' : '') },
            h('div', { class: 'wiz-row' },
              h('input', { type: 'checkbox', checked: !b.off, 'aria-label': `Importa la board ${b.name}`, onchange: (e) => { b.off = !e.target.checked; stepPreview(); } }),
              h('input', { type: 'text', class: 'wiz-name', value: b.name, maxlength: 60, 'aria-label': 'Nome della board', onchange: (e) => { b.name = e.target.value; stepPreview(); } }),
              otherPages(p).length ? h('select', {
                class: 'wiz-move', 'aria-label': 'Sposta la board in un’altra pagina',
                onchange: (e) => {
                  const to = plan.pages.find((x) => x.name === e.target.value);
                  if (!to) return;
                  p.boards.splice(p.boards.indexOf(b), 1);
                  to.boards.push(b);
                  stepPreview();
                }
              }, h('option', { value: '' }, 'Sposta…'), otherPages(p).map((x) => h('option', { value: x.name }, x.name))) : null,
              h('button', {
                type: 'button', class: 'wiz-toggle', 'aria-expanded': String(open.has(key)), 'aria-label': 'Mostra i link',
                onclick: () => { open.has(key) ? open.delete(key) : open.add(key); stepPreview(); }
              }, plural(b.links.filter((l) => !l.off).length, 'link', 'link'), icon('chevron', 14))),
            open.has(key) ? h('ul', { class: 'wiz-links' }, b.links.map((l) => h('li', {},
              h('label', {}, h('input', { type: 'checkbox', checked: !l.off, onchange: (e) => { l.off = !e.target.checked; stepPreview(); } }),
                h('span', { class: 'wiz-lt' }, l.title), h('small', {}, hostOf(l.url) + (p.name === INBOX ? ` · ${l.why}` : ''))))))
              : null);
        }))));

      body.replaceChildren(
        h('p', { class: 'dlg-text tool-lead' }, `${plural(links.length, 'link', 'link')} in ${plural(plan.pages.filter((p) => !p.off).length, 'pagina', 'pagine')}. Rinomina, sposta o togli la spunta a ciò che non vuoi.`),
        tree,
        h('div', { class: 'dlg-actions' },
          h('button', { type: 'button', class: 'btn-ghost', onclick: () => stepStructure() }, 'Indietro'),
          sortCount ? h('button', { type: 'button', class: 'btn-soft', id: 'wiz-sort', onclick: () => stepSort() }, `Smista i link da smistare (${sortCount})`) : null,
          h('button', { type: 'button', class: 'btn-solid', id: 'wiz-go', disabled: links.length ? null : true, onclick: () => finish({ plan: finalPlan(plan), target, learnedRules: rules }) }, `Importa (${links.length})`)));
      body.scrollTop = scroll;
    }

    /* ——— 3. Smistamento ——— */
    function stepSort() {
      const queue = [...inboxLinks(plan)];
      const total = queue.length;
      let i = 0;
      title('Smistamento');
      const keys = (e) => {
        if (!dlg.open) return;
        const k = e.key.toLowerCase();
        const sel = body.querySelector('.sort-dest');
        if (!sel) return;
        if (e.key === 'Enter') { e.preventDefault(); accept(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const n = sel.options.length;
          sel.selectedIndex = (sel.selectedIndex + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
        } else if (k === 's' && e.target.tagName !== 'INPUT') { e.preventDefault(); skip(); }
        else if (k === 'e' && e.target.tagName !== 'INPUT') { e.preventDefault(); drop(); }
      };
      dlg.addEventListener('keydown', keys);
      const leave = () => { dlg.removeEventListener('keydown', keys); stepPreview(); };

      function draw() {
        if (i >= queue.length) { leave(); return; }
        const link = queue[i];
        const sug = classify({ url: link.url, title: link.title }, rules);
        const dests = destinations(plan, sug);
        const sel = h('select', { class: 'sort-dest', 'aria-label': 'Destinazione' },
          dests.map((d, n) => h('option', { value: String(n) }, `${d.page} › ${d.board}`)));
        body.replaceChildren(
          h('p', { class: 'wiz-q' }, `${i + 1} di ${total}`),
          h('div', { class: 'sort-card' },
            h('strong', { class: 'sort-title' }, link.title),
            h('small', { class: 'sort-host' }, link.url),
            h('label', { class: 'sort-label' }, sug.score > 0 ? `Suggerito (${sug.why}):` : 'Nessun suggerimento, scegli tu:', sel)),
          h('p', { class: 'sort-keys' }, h('kbd', {}, 'Invio'), ' accetta · ', h('kbd', {}, '←'), h('kbd', {}, '→'), ' cambia · ', h('kbd', {}, 'S'), ' salta · ', h('kbd', {}, 'E'), ' elimina'),
          h('div', { class: 'dlg-actions' },
            h('button', { type: 'button', class: 'btn-ghost', onclick: leave }, 'Fine'),
            h('button', { type: 'button', class: 'btn-soft', id: 'sort-del', onclick: drop }, 'Elimina'),
            h('button', { type: 'button', class: 'btn-soft', id: 'sort-skip', onclick: skip }, 'Salta'),
            h('button', { type: 'button', class: 'btn-solid', id: 'sort-ok', onclick: accept }, 'Accetta')));
        body.querySelector('#sort-ok').focus();
        body._dests = dests;
      }
      function accept() {
        const sel = body.querySelector('.sort-dest');
        const dest = body._dests?.[Number(sel?.value)];
        const link = queue[i];
        if (!dest || !link) return;
        removeLink(plan, link);
        destBoard(destPage(plan, dest.page), dest.board).links.push(link);
        link.why = 'smistato da te';
        rules = learn(rules, link, { page: dest.page, board: baseName(dest.board) });
        i++;
        draw();
      }
      function skip() { i++; draw(); }
      function drop() { removeLink(plan, queue[i]); i++; draw(); }
      draw();
    }

    document.body.append(dlg);
    dlg.showModal();
    stepStructure();
  });
}
