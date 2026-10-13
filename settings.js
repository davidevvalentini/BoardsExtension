// Finestra impostazioni al centro: temi, colori, sfondo, orologio, link e dati.
import { THEMES, ACCENTS, BOARD_COLOR_NAMES, DEFAULT_BOARD_COLORS, SOLIDS, GRADIENTS, IMAGES, imageUrl, imagePage } from './catalog.js';
import { h, icon } from './ui.js';
import { listSnapshots, getFile } from './store.js';

export function mountSettings(root, ctx) {
  let isOpen = false;
  let hideTimer;

  const S = () => ctx.getState().settings;
  const change = (kind) => { ctx.onSettings(kind); ctx.persist(); };

  /* ——— Componenti ——— */
  const section = (title, ...kids) => h('section', { class: 'set-sec' }, h('h3', {}, title), ...kids);
  const row = (label, control, hint) => h('div', { class: 'set-row' },
    h('div', { class: 'set-label' }, h('span', {}, label), hint && h('small', {}, hint)), control);

  function segmented(options, value, onPick, label) {
    return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
      options.map(([val, text]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(val === value),
        onclick: () => onPick(val)
      }, text)));
  }

  function toggle(label, checked, onChange, hint) {
    const input = h('input', { type: 'checkbox', role: 'switch', checked: checked ? true : null, id: 'sw-' + label.replace(/\W+/g, '') });
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'set-row switch', for: input.id },
      h('div', { class: 'set-label' }, h('span', {}, label), hint && h('small', {}, hint)),
      input, h('span', { class: 'knob', 'aria-hidden': 'true' }));
  }

  function slider(label, value, min, max, unit, onInput) {
    const out = h('output', {}, value + unit);
    const input = h('input', { type: 'range', min, max, value, 'aria-label': label });
    input.addEventListener('input', () => { out.textContent = input.value + unit; onInput(Number(input.value)); });
    return h('div', { class: 'set-slider' }, h('div', { class: 'set-label' }, h('span', {}, label), out), input);
  }

  function colorInput(label, value, onInput) {
    const input = h('input', { type: 'color', value, 'aria-label': label });
    input.addEventListener('input', () => onInput(input.value.toUpperCase()));
    return input;
  }

  /* ——— Sezioni ——— */
  function themeSection() {
    const s = S();
    const cards = THEMES.map((t) => h('button', {
      type: 'button', class: 'theme-card', 'aria-pressed': String(s.theme === t.id), title: t.name,
      onclick: () => { s.theme = t.id; s.accent = null; change('theme'); render(); }
    },
    h('span', { class: 'theme-prev', style: `background:${t.ground}` },
      h('span', { style: `background:${t.surface}` }),
      h('i', { style: `background:${t.accent}` })),
    h('span', { class: 'theme-name' }, t.name)));
    cards.push(h('button', {
      type: 'button', class: 'theme-card', 'aria-pressed': String(s.theme === 'custom'),
      onclick: () => { s.theme = 'custom'; change('theme'); render(); }
    },
    h('span', { class: 'theme-prev custom', style: `background:${s.custom.ground}` },
      h('span', { style: `background:${s.custom.surface}` }),
      h('i', { style: `background:${s.custom.accent}` })),
    h('span', { class: 'theme-name' }, 'Personale')));

    const kids = [h('div', { class: 'theme-grid' }, cards)];

    if (s.theme === 'custom') {
      const mk = (key, label) => row(label, colorInput(label, s.custom[key], (v) => { s.custom[key] = v; change('theme'); }));
      kids.push(h('div', { class: 'set-group' }, mk('ground', 'Sfondo'), mk('surface', 'Pannelli'), mk('text', 'Testo'), mk('accent', 'Accento')));
    }

    const swatches = ACCENTS.map((c) => h('button', {
      type: 'button', class: 'accent-dot', style: `--c:${c}`, 'aria-label': `Accento ${c}`, 'aria-pressed': String(s.accent === c),
      onclick: () => { s.accent = c; change('theme'); render(); }
    }));
    const own = colorInput('Accento personalizzato', s.accent || '#7CC4FF', (v) => { s.accent = v; change('theme'); });
    kids.push(h('div', { class: 'set-block' },
      h('div', { class: 'set-label' }, h('span', {}, 'Colore di accento'),
        s.accent ? h('button', { type: 'button', class: 'link-btn', onclick: () => { s.accent = null; change('theme'); render(); } }, 'Ripristina') : null),
      h('div', { class: 'accent-row' }, swatches, own)));
    return section('Tema', ...kids);
  }

  function boardColorsSection() {
    const s = S();
    const rows = s.boardColors.map((c, i) => row(BOARD_COLOR_NAMES[i], colorInput(BOARD_COLOR_NAMES[i], c, (v) => ctx.recolor(i, v))));
    return section('Colori delle board',
      h('p', { class: 'set-note' }, 'Cambiando un colore, tutte le board che lo usano si aggiornano.'),
      h('div', { class: 'set-group' }, rows),
      h('button', { type: 'button', class: 'link-btn', onclick: () => { DEFAULT_BOARD_COLORS.forEach((c, i) => ctx.recolor(i, c)); render(); } }, 'Ripristina i colori originali'));
  }

  function backgroundSection() {
    const s = S();
    const bg = s.bg;
    const setBg = (patch, kind = 'bg') => { Object.assign(bg, patch); change(kind); render(); };
    const kids = [
      segmented([['color', 'Tinta'], ['gradient', 'Sfumatura'], ['image', 'Foto'], ['custom', 'La tua']], bg.type, (v) => setBg({ type: v }), 'Tipo di sfondo')
    ];

    if (bg.type === 'color') {
      const dots = SOLIDS.map((c) => h('button', {
        type: 'button', class: 'solid-dot', style: `background:${c}`, 'aria-label': `Colore ${c}`, 'aria-pressed': String(bg.color.toLowerCase() === c.toLowerCase()),
        onclick: () => setBg({ color: c })
      }));
      kids.push(h('div', { class: 'accent-row' }, dots, colorInput('Colore dello sfondo', bg.color, (v) => { bg.color = v; change('bg'); })));
    }

    if (bg.type === 'gradient') {
      kids.push(h('div', { class: 'grad-grid' }, GRADIENTS.map((g) => h('button', {
        type: 'button', class: 'grad', 'aria-pressed': String(bg.gradient === g.id), title: g.name,
        onclick: () => setBg({ gradient: g.id })
      }, h('span', { style: `background:${g.css}` }), h('em', {}, g.name)))));
    }

    if (bg.type === 'image') {
      kids.push(row('Cambia foto', segmented([['off', 'Fissa'], ['daily', 'Ogni giorno'], ['tab', 'Ogni scheda']], bg.rotate, (v) => setBg({ rotate: v }), 'Rotazione')));
      kids.push(row('Qualità', segmented([['4k', '4K'], ['hd', 'Full HD']], bg.quality, (v) => setBg({ quality: v }), 'Qualità'), '4K usa più dati, solo la prima volta'));
      const grid = h('div', { class: 'photo-grid' + (bg.rotate !== 'off' ? ' dim' : '') }, IMAGES.map((im) => h('button', {
        type: 'button', class: 'photo', 'aria-pressed': String(bg.image === im.id), title: `${im.title} — ${im.author}`,
        onclick: () => setBg({ image: im.id, rotate: 'off' })
      }, h('img', { src: imageUrl(im, 500), alt: '', loading: 'lazy', style: `background:${im.tone}` }), h('em', {}, im.title))));
      kids.push(grid);
      const cur = IMAGES.find((x) => x.id === bg.image) || IMAGES[0];
      kids.push(h('p', { class: 'set-note' }, 'Foto di ', cur.author, ' · ',
        h('a', { href: cur.licenseUrl, target: '_blank', rel: 'noopener' }, cur.license), ' · ',
        h('a', { href: imagePage(cur), target: '_blank', rel: 'noopener' }, 'Wikimedia Commons')));
    }

    if (bg.type === 'custom') {
      const info = h('p', { class: 'set-note' }, 'Carica una tua foto: resta sul tuo computer e non viene mai inviata altrove.');
      kids.push(info);
      kids.push(h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn-soft', onclick: () => ctx.pickPhoto() }, 'Scegli una foto…'),
        h('button', { type: 'button', class: 'btn-soft', onclick: async () => { await ctx.removePhoto(); render(); } }, 'Rimuovi')));
      getFile('bg-custom').then((f) => { if (f) info.textContent = `Foto attuale: ${(f.size / 1048576).toFixed(1)} MB. Scegline un’altra per sostituirla.`; }).catch(() => {});
    }

    if (bg.type !== 'color') {
      kids.push(slider('Oscura lo sfondo', bg.dim, 0, 85, '%', (v) => { bg.dim = v; change('theme'); }));
      kids.push(slider('Sfoca lo sfondo', bg.blur, 0, 24, ' px', (v) => { bg.blur = v; change('theme'); }));
      kids.push(slider('Trasparenza dei pannelli', 100 - s.glass.opacity, 0, 70, '%', (v) => { s.glass.opacity = 100 - v; change('theme'); }));
      kids.push(slider('Sfocatura dei pannelli', s.glass.blur, 0, 40, ' px', (v) => { s.glass.blur = v; change('theme'); }));
    }
    return section('Sfondo', ...kids);
  }

  function clockSection() {
    const s = S();
    return section('Orologio e saluto',
      row('Formato', segmented([[true, '24 ore'], [false, '12 ore']], s.clock.h24, (v) => { s.clock.h24 = v; change('clock'); render(); }, 'Formato orario')),
      toggle('Mostra i secondi', s.clock.seconds, (v) => { s.clock.seconds = v; change('clock'); }),
      toggle('Mostra il saluto', s.clock.greeting, (v) => { s.clock.greeting = v; change('clock'); }),
      (() => {
        const input = h('input', { type: 'text', class: 'set-text', value: s.name, maxlength: 40, 'aria-label': 'Nome nel saluto', placeholder: 'Il tuo nome' });
        input.addEventListener('input', () => { s.name = input.value.trim(); change('clock'); });
        return row('Nome', input);
      })());
  }

  function linksSection() {
    const s = S();
    return section('Link e icone',
      toggle('Apri i link in una nuova scheda', s.openNew, (v) => { s.openNew = v; change('links'); }),
      row('Icone dei siti', segmented([['favicon', 'Favicon'], ['letter', 'Iniziali']], s.icons, (v) => { s.icons = v; change('links'); render(); }, 'Icone')),
      slider('Larghezza delle colonne', s.layout.colMin, 240, 420, ' px', (v) => { s.layout.colMin = v; change('theme'); }),
      toggle('Privacy: sfoca anche i nomi delle board', s.privacyBoards, (v) => { s.privacyBoards = v; change('links'); }));
  }

  function dataSection() {
    const st = ctx.getState();
    const last = st.lastBackup ? new Date(st.lastBackup).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : 'mai';
    const snapBox = h('div', { class: 'snap-list' });
    listSnapshots().then((snaps) => {
      if (!snaps.length) { snapBox.append(h('p', { class: 'set-note' }, 'Le copie automatiche compaiono dopo il primo giorno d’uso.')); return; }
      [...snaps].reverse().forEach((sn) => snapBox.append(h('button', { type: 'button', class: 'btn-soft', onclick: () => ctx.actions.restoreSnapshot(sn) },
        `${new Date(sn.t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} · ${sn.n} link`)));
    }).catch(() => {});
    return section('Dati',
      h('p', { class: 'set-note' }, 'Il file HTML è quello esportato da Chrome, Edge, Firefox o Safari: le cartelle diventano board nella pagina «Importati».'),
      h('p', { class: 'set-note' }, `Ultimo backup esportato: ${last}. I dati sono solo su questo computer: esporta un backup ogni tanto.`),
      h('div', { class: 'btn-row wrap' },
        h('button', { type: 'button', class: 'btn-soft', onclick: () => ctx.actions.importChrome() }, 'Importa i segnalibri di Chrome'),
        h('button', { type: 'button', class: 'btn-soft', onclick: () => ctx.actions.importHtml() }, 'Importa da file HTML…'),
        h('button', { type: 'button', class: 'btn-soft', onclick: () => ctx.actions.exportBackup() }, 'Esporta backup'),
        h('button', { type: 'button', class: 'btn-soft', onclick: () => ctx.actions.restoreFile() }, 'Ripristina da file…')),
      h('div', { class: 'set-label' }, h('span', {}, 'Copie automatiche (una al giorno)')),
      snapBox,
      h('button', { type: 'button', class: 'link-btn danger', onclick: () => ctx.actions.resetSettings() }, 'Ripristina le impostazioni predefinite'));
  }

  /* ——— Disegno della finestra ——— */
  const TABS = [
    ['theme', 'Tema', 'sun', themeSection],
    ['bg', 'Sfondo', 'image', backgroundSection],
    ['colors', 'Colori delle board', 'palette', boardColorsSection],
    ['clock', 'Orologio e saluto', 'clock', clockSection],
    ['links', 'Link e icone', 'link', linksSection],
    ['data', 'Dati e backup', 'tray', dataSection]
  ];
  let tab = 'theme';

  function render(keepScroll = true) {
    const scroll = keepScroll ? (root.querySelector('.set-body')?.scrollTop || 0) : 0;
    const current = TABS.find((t) => t[0] === tab) || TABS[0];
    const nav = h('nav', { class: 'set-nav', 'aria-label': 'Sezioni delle impostazioni' },
      TABS.map(([id, label, ic]) => h('button', {
        type: 'button', class: 'set-tab', 'aria-current': id === tab ? 'page' : null,
        onclick: () => { tab = id; render(false); }
      }, icon(ic, 18), h('span', {}, label))));
    root.replaceChildren(
      h('div', { class: 'set-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Impostazioni' },
        h('div', { class: 'set-head' },
          h('h2', {}, 'Impostazioni'),
          h('button', { type: 'button', class: 'icon-btn bare', 'aria-label': 'Chiudi le impostazioni', onclick: close }, icon('x', 20))),
        h('div', { class: 'set-main' },
          nav,
          h('div', { class: 'set-body' }, h('h3', { class: 'set-title' }, current[1]), current[3]()))));
    root.querySelector('.set-body').scrollTop = scroll;
  }

  function open() {
    clearTimeout(hideTimer);
    render(false);
    root.hidden = false;
    isOpen = true;
    requestAnimationFrame(() => root.classList.add('open'));
    ctx.onToggle(true);
    root.querySelector('.set-tab[aria-current]')?.focus();
  }
  function close() {
    isOpen = false;
    root.classList.remove('open');
    hideTimer = setTimeout(() => { if (!isOpen) root.hidden = true; }, 220);
    ctx.onToggle(false);
  }
  // Un clic sullo sfondo scuro chiude la finestra.
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen && !document.querySelector('dialog[open]')) close();
  });

  return { open, close, toggle: () => (isOpen ? close() : open()), refresh: () => { if (isOpen) render(); }, isOpen: () => isOpen };
}
