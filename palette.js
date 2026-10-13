// Salta-a-tutto (Ctrl/⌘+K): workspace, pagine, board e link in un'unica ricerca.
import { hostOf } from './store.js';
import { h, icon } from './ui.js';

export function openPalette(ctx) {
  if (document.getElementById('palette')) return;
  const st = ctx.getState();
  const multi = st.workspaces.length > 1;
  const wsOf = (id) => st.workspaces.find((w) => w.id === id);

  // Elenco piatto di tutto ciò che si può raggiungere.
  const entries = [];
  for (const page of st.pages) {
    const w = wsOf(page.ws);
    const where = multi && w ? `${w.emoji} ${w.name}` : '';
    entries.push({ kind: 'page', text: page.name, sub: where || 'Pagina', page, run: () => ctx.goPage(page.id) });
    for (const board of page.boards) {
      entries.push({ kind: 'board', text: board.name, sub: `${where ? where + ' › ' : ''}${page.name}`, color: board.color, run: () => ctx.goBoard(page.id, board.id) });
      for (const link of board.links) {
        entries.push({
          kind: 'link', text: link.title, sub: hostOf(link.url), url: link.url, opens: link.opens || 0, last: link.last || 0,
          where: `${where ? where + ' › ' : ''}${page.name} › ${board.name}`, link,
          run: (e) => ctx.openLink(link, { newTab: !!(e && (e.ctrlKey || e.metaKey || e.shiftKey)) })
        });
      }
    }
  }

  const score = (en, q) => {
    const t = en.text.toLowerCase();
    const s = (en.sub + ' ' + (en.url || '')).toLowerCase();
    let sc = 0;
    for (const word of q) {
      if (t.startsWith(word)) sc += 6;
      else if (t.includes(` ${word}`)) sc += 4;
      else if (t.includes(word)) sc += 3;
      else if (s.includes(word)) sc += 1;
      else return 0;
    }
    if (en.kind !== 'link') sc += 1.5; // pagine e board prima dei link a parità
    return sc + Math.min(2, Math.log10(1 + (en.opens || 0)));
  };

  let results = [];
  let sel = 0;
  const input = h('input', { type: 'text', class: 'pal-input', placeholder: 'Vai a una pagina, una board o un link…', 'aria-label': 'Cerca e salta', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'pal-list', role: 'listbox' });
  const dlg = h('dialog', { class: 'dlg pal', id: 'palette', 'aria-label': 'Salta a' },
    h('div', { class: 'pal-top' }, icon('search', 20), input, h('kbd', {}, 'Esc')),
    list,
    h('div', { class: 'pal-foot' },
      h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' muovi'),
      h('span', {}, h('kbd', {}, 'Invio'), ' apri'),
      h('span', {}, h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Invio'), ' nuova scheda')));

  function compute() {
    const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!q.length) {
      const used = entries.filter((e) => e.kind === 'link' && e.opens).sort((a, b) => b.opens - a.opens || b.last - a.last).slice(0, 8);
      const pages = entries.filter((e) => e.kind === 'page').slice(0, 12);
      results = [...used.map((e) => ({ ...e, group: 'Più usati' })), ...pages.map((e) => ({ ...e, group: 'Pagine' }))];
    } else {
      results = entries.map((e) => ({ e, s: score(e, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40)
        .map((x) => ({ ...x.e, group: x.e.kind === 'link' ? 'Link' : x.e.kind === 'page' ? 'Pagine' : 'Board' }));
    }
    sel = 0;
    draw();
  }

  function draw() {
    if (!results.length) { list.replaceChildren(h('div', { class: 'pal-empty' }, 'Nessun risultato.')); return; }
    const nodes = [];
    let group = '';
    results.forEach((r, i) => {
      if (r.group !== group) { group = r.group; nodes.push(h('div', { class: 'pal-group' }, group)); }
      const mark = r.kind === 'board'
        ? h('span', { class: 'pal-dot', style: `--c:${r.color}` })
        : r.kind === 'page' ? h('span', { class: 'pal-ic' }, icon('move', 16)) : h('span', { class: 'pal-ic' }, icon('link', 16));
      nodes.push(h('button', {
        type: 'button', class: 'pal-item', role: 'option', 'aria-selected': String(i === sel), dataset: { i },
        onclick: (e) => choose(i, e), onmousemove: () => { if (sel !== i) { sel = i; mark_(); } }
      }, mark,
      h('span', { class: 'pal-text' }, h('strong', {}, r.text), h('small', {}, r.kind === 'link' ? `${r.sub} · ${r.where}` : r.sub)),
      h('span', { class: 'pal-kind' }, r.kind === 'link' ? (r.opens ? `${r.opens}×` : '') : r.kind === 'page' ? 'pagina' : 'board')));
    });
    list.replaceChildren(...nodes);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function mark_() {
    list.querySelectorAll('.pal-item').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.i) === sel)));
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function choose(i, e) {
    const r = results[i];
    if (!r) return;
    dlg.close();
    r.run(e);
  }

  input.addEventListener('input', compute);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); mark_(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark_(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel, e); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  compute();
  input.focus();
}
