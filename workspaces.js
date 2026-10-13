// Finestra "Workspace": elenco, cambio, creazione, rinomina ed eliminazione.
import { WS_EMOJI } from './store.js';
import { h, icon, askText, askConfirm } from './ui.js';

export function openWorkspaces(ctx) {
  let emoji = WS_EMOJI[0];
  const dlg = h('dialog', { class: 'dlg ws-dlg', 'aria-label': 'Workspace' });
  const body = h('div', { class: 'ws-body' });
  const close = () => dlg.close();

  function counts(w) {
    const pages = ctx.getState().pages.filter((p) => p.ws === w.id);
    const links = pages.reduce((a, p) => a + p.boards.reduce((b, x) => b + x.links.length, 0), 0);
    return `${pages.length} ${pages.length === 1 ? 'pagina' : 'pagine'} · ${links} link`;
  }

  // Trascinando una riga si cambia l'ordine dei workspace.
  let dragId = null;
  function wireDrag(row, id) {
    row.addEventListener('dragstart', (e) => {
      dragId = id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      setTimeout(() => row.classList.add('dragging'));
    });
    row.addEventListener('dragend', () => { dragId = null; clearMarks(); row.classList.remove('dragging'); });
    row.addEventListener('dragover', (e) => {
      if (!dragId || dragId === id) return;
      e.preventDefault();
      clearMarks();
      const r = row.getBoundingClientRect();
      row.dataset.drop = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    });
    row.addEventListener('dragleave', () => row.removeAttribute('data-drop'));
    row.addEventListener('drop', async (e) => {
      if (!dragId || dragId === id) return;
      e.preventDefault();
      const before = row.dataset.drop === 'before';
      const from = dragId;
      dragId = null;
      clearMarks();
      await ctx.reorder(from, id, before);
      render();
    });
  }
  const clearMarks = () => body.querySelectorAll('[data-drop]').forEach((n) => n.removeAttribute('data-drop'));

  function render() {
    const st = ctx.getState();
    const only = st.workspaces.length === 1;
    const rows = st.workspaces.map((w) => {
      const active = w.id === st.activeWorkspace;
      const rowEl = h('div', { class: 'ws-row' + (active ? ' active' : ''), draggable: only ? null : 'true', dataset: { id: w.id } },
        only ? null : h('span', { class: 'ws-grip', 'aria-hidden': 'true', title: 'Trascina per cambiare l’ordine' }, '⋮⋮'),
        h('button', {
          type: 'button', class: 'ws-pick', 'aria-label': active ? `${w.name}, attivo` : `Passa a ${w.name}`,
          onclick: () => { if (!active) { ctx.switchTo(w.id); } close(); }
        },
        h('span', { class: 'ws-emoji', 'aria-hidden': 'true' }, w.emoji),
        h('span', { class: 'ws-name' }, h('strong', {}, w.name), h('small', {}, counts(w))),
        active ? h('span', { class: 'ws-state' }, icon('check', 18), 'Attivo') : null),
        h('button', { type: 'button', class: 'icon-btn bare', title: 'Rinomina', 'aria-label': `Rinomina ${w.name}`, onclick: async () => { await ctx.rename(w.id); render(); } }, icon('pencil', 18)),
        h('button', { type: 'button', class: 'icon-btn bare', title: only ? 'Serve almeno un workspace' : 'Elimina', 'aria-label': `Elimina ${w.name}`, disabled: only ? true : null, onclick: async () => { if (await ctx.remove(w.id)) render(); } }, icon('trash', 18)));
      if (!only) wireDrag(rowEl, w.id);
      return rowEl;
    });

    const name = h('input', { type: 'text', class: 'ws-input', placeholder: 'Nome del workspace', maxlength: 30, 'aria-label': 'Nome del nuovo workspace' });
    const add = async () => {
      const v = name.value.trim();
      if (!v) { name.focus(); return; }
      await ctx.add({ name: v, emoji });
      name.value = '';
      emoji = WS_EMOJI[0];
      render();
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    const picker = h('div', { class: 'ws-emojis', role: 'radiogroup', 'aria-label': 'Icona' },
      WS_EMOJI.map((e) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(e === emoji),
        onclick: (ev) => { emoji = e; picker.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === ev.currentTarget))); }
      }, e)));

    body.replaceChildren(
      h('div', { class: 'ws-list' }, rows),
      h('div', { class: 'ws-new' },
        h('h3', {}, 'Nuovo workspace'),
        picker,
        h('div', { class: 'ws-add' }, name,
          h('button', { type: 'button', class: 'btn-solid', onclick: add }, icon('plus', 18), 'Aggiungi'))));
  }

  dlg.append(
    h('div', { class: 'ws-head' }, h('h2', {}, 'Workspace'),
      h('button', { type: 'button', class: 'icon-btn bare', 'aria-label': 'Chiudi', onclick: close }, icon('x', 20))),
    body);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  render();
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('.ws-row.active .ws-pick')?.focus();
}
