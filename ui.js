// Piccoli strumenti di interfaccia condivisi: elementi DOM, icone, menu, finestre, avvisi.
import { hostOf, safeUrl } from './store.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

const ICONS = {
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10"/>',
  bell: '<path d="M6 16v-5a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 21h4"/>',
  bellPlus: '<path d="M6 16v-5a6 6 0 016-6M18 12v4l1.5 2h-15M10 21h4M18 2.5v6M15 5.5h6"/>',
  pin: '<path d="M12 16.5V22M8.5 3.5h7l-1 6 3.2 3.5H6.3L9.5 9.5l-1-6z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 017.5 4H15"/>',
  ban: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',
  chevron: '<path d="M7 10l5 5 5-5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 017.5-1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<path d="M12 4L3 19.5h18L12 4zM12 10v4.5M12 17v.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.5-2.4 3.8M6.5 6.6C4.4 8 3 10.2 2.5 12c1 2.8 4.5 7 9.5 7 1.5 0 2.9-.4 4.1-1"/>',
  tray: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  move: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  palette: '<path d="M12 4a8 8 0 100 16c1.2 0 1.8-.9 1.4-1.9-.4-1 .2-2.1 1.3-2.1H17a3.5 3.5 0 003.5-3.5C20.5 7.3 16.7 4 12 4z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.8" r="1"/><circle cx="15.5" cy="8.5" r="1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'
};

export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  if (name === 'more') {
    s.setAttribute('fill', 'currentColor');
    s.innerHTML = '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>';
  } else {
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.75');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = ICONS[name];
  }
  return s;
}

/* ——— Avviso in basso, con azione opzionale (es. «Annulla») ——— */
let toastTimer;
export function toast(msg, action) {
  const t = document.getElementById('toast');
  t.replaceChildren(h('span', {}, msg));
  if (action) {
    t.append(h('button', { type: 'button', onclick: () => { t.hidden = true; action.run(); } }, action.label));
    t.firstChild.style.cssText = '';
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 7000 : 3200);
}

/* ——— Menu a comparsa ——— */
let openMenuEl = null;
export function closeMenu() {
  if (openMenuEl) openMenuEl.remove();
  openMenuEl = null;
}
export function openMenu(anchor, items) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' },
    items.map((it) => {
      if (it.sep) return h('div', { class: 'menu-sep', role: 'presentation' }, it.sep);
      if (it.rule) return h('div', { class: 'menu-rule', role: 'separator' });
      if (it.swatches) {
        const sw = it.swatches;
        return h('div', { class: 'menu-hl', role: 'group', 'aria-label': sw.label },
          h('div', { class: 'menu-sep flat' }, sw.label),
          h('div', { class: 'hl-row' },
            h('button', {
              type: 'button', class: 'hl-dot none', title: 'Nessuna', 'aria-label': 'Nessun colore', 'aria-pressed': String(!sw.current),
              onclick: () => { closeMenu(); sw.pick(null); }
            }, icon('ban', 18)),
            sw.colors.map(([c, name]) => h('button', {
              type: 'button', class: 'hl-dot', style: `--c:${c}`, title: name, 'aria-label': name,
              'aria-pressed': String((sw.current || '').toLowerCase() === c.toLowerCase()),
              onclick: () => { closeMenu(); sw.pick(c); }
            }))));
      }
      return h('button', {
        class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', type: 'button',
        onclick: () => { closeMenu(); it.run(); }
      }, it.icon ? icon(it.icon, 20) : null, h('span', {}, it.label));
    }));
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - m.offsetHeight - 8)) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
  openMenuEl = m;
  m.querySelector('button')?.focus();
}
document.addEventListener('pointerdown', (e) => {
  if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openMenuEl) closeMenu();
});

/* ——— Finestre di dialogo ——— */
export function openModal({ title, text, content, ok = 'Salva', danger = false, collect = () => true }) {
  return new Promise((resolve) => {
    let result = null;
    const dlg = h('dialog', { class: 'dlg', 'aria-label': title });
    const form = h('form', { method: 'dialog' },
      h('h2', {}, title),
      text && h('p', { class: 'dlg-text' }, text),
      content,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => dlg.close() }, 'Annulla'),
        h('button', { type: 'submit', class: 'btn-solid' + (danger ? ' danger' : '') }, ok)));
    form.addEventListener('submit', (e) => {
      const v = collect();
      if (v === undefined) { e.preventDefault(); return; }
      result = v;
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.append(form);
    document.body.append(dlg);
    dlg.showModal();
    form.querySelector('input[type="text"]')?.focus();
  });
}

export const field = (label, input, id) => h('div', { class: 'field' }, h('label', { for: id }, label), input);

export function askText({ title, label, value = '', ok, allowEmpty = false }) {
  const input = h('input', { type: 'text', id: 'f-text', value, maxlength: 60 });
  return openModal({
    title, ok, content: field(label, input, 'f-text'),
    collect: () => (allowEmpty ? input.value.trim() : input.value.trim() || undefined)
  });
}

export function askLink({ title, url = '', name = '', ok = 'Salva' }) {
  const u = h('input', { type: 'text', id: 'f-url', value: url, placeholder: 'https://', inputmode: 'url', autocomplete: 'off' });
  const t = h('input', { type: 'text', id: 'f-title', value: name, placeholder: 'Facoltativo' });
  const err = h('div', { class: 'err', role: 'alert' });
  return openModal({
    title, ok,
    content: [field('Indirizzo', u, 'f-url'), err, field('Titolo', t, 'f-title')],
    collect: () => {
      const full = safeUrl(u.value);
      if (!full) { err.textContent = 'Inserisci un indirizzo web valido (http o https).'; u.focus(); return undefined; }
      return { url: full, title: t.value.trim() || hostOf(full) };
    }
  });
}

export function askBoard({ title, palette, name = '', color, ok = 'Salva' }) {
  const n = h('input', { type: 'text', id: 'f-board', value: name, maxlength: 40 });
  const current = color || palette[0];
  const list = palette.includes(current) ? palette : [current, ...palette];
  const group = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colore' },
    list.map((c) => h('label', { class: 'sw', style: `--c:${c}` },
      h('input', { type: 'radio', name: 'color', value: c, checked: c === current }), h('span'))));
  return openModal({
    title, ok,
    content: [field('Nome', n, 'f-board'), h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Colore'), group)],
    collect: () => {
      const v = n.value.trim();
      if (!v) { n.focus(); return undefined; }
      return { name: v, color: group.querySelector('input:checked')?.value || current };
    }
  });
}

export function askConfirm({ title, text, ok = 'Elimina', danger = true }) {
  return openModal({ title, text, ok, danger }).then((r) => r === true);
}

/* ——— Promemoria: scorciatoie + data e ora ——— */
const pad = (n) => String(n).padStart(2, '0');
export const toLocalInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export function askReminder({ current = 0, title = 'Ricordamelo' }) {
  const at = (days, hour) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  const now = Date.now();
  const presets = [['Tra 1 ora', now + 3600e3], ['Tra 3 ore', now + 3 * 3600e3]];
  if (new Date().getHours() < 18) presets.push(['Stasera alle 19', at(0, 19)]);
  presets.push(['Domani alle 9', at(1, 9)], ['Tra una settimana', at(7, 9)]);
  const input = h('input', { type: 'datetime-local', id: 'f-when', value: toLocalInput(current > now ? current : at(1, 9)), min: toLocalInput(now) });
  const err = h('div', { class: 'err', role: 'alert' });
  const chips = h('div', { class: 'when-chips' }, presets.map(([label, ts]) => h('button', {
    type: 'button', class: 'when-chip', onclick: () => { input.value = toLocalInput(ts); err.textContent = ''; }
  }, label)));
  return openModal({
    title, ok: 'Imposta',
    content: [chips, field('Data e ora', input, 'f-when'), err],
    collect: () => {
      const ts = new Date(input.value).getTime();
      if (!isFinite(ts) || ts <= Date.now()) { err.textContent = 'Scegli un momento nel futuro.'; return undefined; }
      return ts;
    }
  });
}
