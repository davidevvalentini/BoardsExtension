// Applica tema, vetro e sfondo come variabili CSS. Usato da nuova scheda e popup.
import { THEMES } from './catalog.js';

export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function resolveColors(settings) {
  const t = settings.theme === 'custom' ? { ...settings.custom } : THEMES.find((x) => x.id === settings.theme) || THEMES[0];
  const accent = settings.accent || t.accent;
  const scheme = t.scheme || (luminance(t.ground) > 0.4 ? 'light' : 'dark');
  return { ground: t.ground, surface: t.surface, text: t.text, accent, scheme };
}

export function applyTheme(settings, { opaque = false } = {}) {
  const root = document.documentElement;
  const c = resolveColors(settings);
  const s = root.style;
  s.setProperty('--ground', c.ground);
  s.setProperty('--surface', c.surface);
  s.setProperty('--text', c.text);
  s.setProperty('--accent', c.accent);
  s.setProperty('--on-accent', luminance(c.accent) > 0.42 ? '#0B0D14' : '#FFFFFF');
  root.dataset.scheme = c.scheme;
  const glassOn = !opaque && settings.bg.type !== 'color';
  s.setProperty('--glass', (glassOn ? settings.glass.opacity : 100) + '%');
  s.setProperty('--glass-blur', (glassOn ? settings.glass.blur : 0) + 'px');
  s.setProperty('--dim', settings.bg.dim + '%');
  s.setProperty('--bg-blur', settings.bg.blur + 'px');
  s.setProperty('--col-min', settings.layout.colMin + 'px');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', c.scheme);
  return c;
}
