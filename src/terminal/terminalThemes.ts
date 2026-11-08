/**
 * The console's themes (Porter console, owner 2026-11-08: "Offer different theme options to choose
 * from"). VALUES, never class names: a product adds its own theme as one more object, and the panel
 * reads every colour through `--term-*` variables set from it.
 *
 * ⚠ EVERY TEXT TOKEN PASSES WCAG AA (4.5:1) ON BOTH THE PANEL AND ITS BARS, asserted by the tests for
 * every theme here. A dark terminal's brand blue is the usual casualty: Portify's `#4361EE` measures
 * about 3.9:1 on near-black, so the dark themes lift it.
 */
export interface TerminalTheme {
  key: string;
  label: string;
  /** Light or dark: the host's own scrollbar and the input's caret follow it. */
  scheme: 'dark' | 'light';
  /** The transcript's background. */
  bg: string;
  /** The header, status line and input bar. */
  bar: string;
  border: string;
  text: string;
  /** Steps, timings, folded and rewound lines. */
  dim: string;
  /** The prompt mark, the person's asks, links, the live step. */
  accent: string;
  /** Text on an accent fill (the Send button). */
  onAccent: string;
  ok: string;
  warn: string;
  fail: string;
  /** Selected rows in the panel's own lists. */
  selection: string;
}

export const TERMINAL_THEMES: TerminalTheme[] = [
  {
    key: 'dark',
    label: 'Porter Dark',
    scheme: 'dark',
    bg: '#0b1020',
    bar: '#111831',
    border: '#24304f',
    text: '#e5e9f2',
    dim: '#98a3bb',
    accent: '#8b9bff',
    onAccent: '#0b1020',
    ok: '#5ad08e',
    warn: '#f2c25b',
    fail: '#ff8a8a',
    selection: '#1d2747',
  },
  {
    key: 'midnight',
    label: 'Midnight',
    scheme: 'dark',
    bg: '#0a1838',
    bar: '#0f2149',
    border: '#22386b',
    text: '#e8eeff',
    dim: '#a4b3d8',
    accent: '#9fb1ff',
    onAccent: '#0a1838',
    ok: '#6ee7c8',
    warn: '#fcd36d',
    fail: '#ffa3a3',
    selection: '#1a2f62',
  },
  {
    key: 'light',
    label: 'Light',
    scheme: 'light',
    bg: '#f8fafc',
    bar: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    dim: '#475569',
    accent: '#3851d6',
    onAccent: '#ffffff',
    ok: '#15803d',
    warn: '#a16207',
    fail: '#b91c1c',
    selection: '#e8ecfd',
  },
  {
    key: 'contrast',
    label: 'High contrast',
    scheme: 'dark',
    bg: '#000000',
    bar: '#000000',
    border: '#ffffff',
    text: '#ffffff',
    dim: '#d4d4d4',
    accent: '#ffd60a',
    onAccent: '#000000',
    ok: '#7dffb0',
    warn: '#ffd60a',
    fail: '#ff9b9b',
    selection: '#333333',
  },
];

export const DEFAULT_TERMINAL_THEME = 'dark';

/** The theme for a key, falling back to the default (a stored key from an older release still opens). */
export function terminalTheme(key: string | null | undefined, themes: TerminalTheme[] = TERMINAL_THEMES): TerminalTheme {
  return themes.find((theme) => theme.key === key) ?? themes.find((theme) => theme.key === DEFAULT_TERMINAL_THEME) ?? themes[0] ?? (TERMINAL_THEMES[0] as TerminalTheme);
}

/** The panel's CSS variables for a theme. */
export function themeToTerminalVars(theme: TerminalTheme): Record<string, string> {
  return {
    '--term-bg': theme.bg,
    '--term-bar': theme.bar,
    '--term-border': theme.border,
    '--term-text': theme.text,
    '--term-dim': theme.dim,
    '--term-accent': theme.accent,
    '--term-on-accent': theme.onAccent,
    '--term-ok': theme.ok,
    '--term-warn': theme.warn,
    '--term-fail': theme.fail,
    '--term-selection': theme.selection,
    // The shared Composer reads the assistant palette: point it at the console's, so the input
    // matches whichever theme is on without a second component.
    '--ai-surface': theme.bar,
    '--ai-fg': theme.text,
    '--ai-muted': theme.dim,
    '--ai-border': theme.border,
    '--ai-accent': theme.accent,
    '--ai-accent-fg': theme.onAccent,
    '--ai-accent-soft': theme.selection,
    '--ai-danger': theme.fail,
    colorScheme: theme.scheme,
  };
}

function channel(value: number): number {
  const c = value / 255;

  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const at = (i: number) => parseInt(full.slice(i, i + 2), 16);

  return 0.2126 * channel(at(0)) + 0.7152 * channel(at(2)) + 0.0722 * channel(at(4));
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);

  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
