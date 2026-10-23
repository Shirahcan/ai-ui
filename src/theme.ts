/**
 * How a product brands the shared panel: CSS custom properties, set on any
 * ancestor, read here with plain fallbacks.
 *
 * ⚠ THE PACKAGE IMPORTS NO PALETTE, AND THIS IS THE REASON IT CAN AFFORD TO
 * OWN LAYOUT AT ALL. The fear that justified shipping `ai-ui` 1.0 with no
 * components was that a shared panel would be forked within a month, and the
 * thing that gets a shared component forked is almost always colour: a product
 * needs its own accent, the component hard-codes one, and the fastest way to
 * the accent is to copy the file. Custom properties invert that - the cascade
 * does the theming, so there is nothing to fork and nothing to configure in
 * JavaScript. It is also why these are properties rather than a `theme` prop:
 * a prop would have to be threaded through every slot a product overrides.
 *
 * ⚠ THE FALLBACKS ARE DELIBERATELY PLAIN, exactly as the Markdown map's are.
 * A product that sets nothing gets something readable but unbranded, so an
 * unfinished adoption LOOKS unfinished - rather than looking like a different
 * product in this one, which is far harder to notice and much worse.
 *
 * ```css
 * .porter-panel {
 *   --ai-accent: #4361ee;
 *   --ai-bubble-user-bg: #4361ee;
 *   --ai-bubble-user-fg: #ffffff;
 *   --ai-radius: 1.25rem;
 * }
 * ```
 */
export const AI_UI_CSS_VARIABLES = [
  '--ai-surface',
  '--ai-fg',
  '--ai-muted',
  '--ai-border',
  '--ai-accent',
  '--ai-accent-fg',
  '--ai-accent-soft',
  '--ai-danger',
  '--ai-radius',
  '--ai-bubble-user-bg',
  '--ai-bubble-user-fg',
  '--ai-bubble-assistant-bg',
  '--ai-bubble-assistant-fg',
] as const;

export type AiUiCssVariable = (typeof AI_UI_CSS_VARIABLES)[number];

/** One place the fallback for each property lives, so nothing re-states it. */
const FALLBACK: Record<AiUiCssVariable, string> = {
  '--ai-surface': '#ffffff',
  '--ai-fg': '#0f172a',
  '--ai-muted': '#64748b',
  '--ai-border': '#e2e8f0',
  '--ai-accent': '#334155',
  '--ai-accent-fg': '#ffffff',
  '--ai-accent-soft': '#f1f5f9',
  '--ai-danger': '#b91c1c',
  '--ai-radius': '0.75rem',
  '--ai-bubble-user-bg': '#f1f5f9',
  '--ai-bubble-user-fg': '#0f172a',
  '--ai-bubble-assistant-bg': 'transparent',
  '--ai-bubble-assistant-fg': '#0f172a',
};

/**
 * `var(--ai-x, <fallback>)`, for use in a `style` object.
 *
 * ⚠ THE FALLBACK GOES INSIDE `var()`, not into a separate declaration. A
 * product that sets the property on a parent would otherwise be overridden by
 * whichever declaration came later in the stylesheet, which is the sort of bug
 * that shows up only in one product's build order.
 */
export function aiVar(name: AiUiCssVariable): string {
  return `var(${name}, ${FALLBACK[name]})`;
}

/**
 * A product's palette, as values rather than class names.
 *
 * ⚠ THIS EXISTS BECAUSE CLASS SLOTS WERE THE DRIFT. P18a-e shared every PART of
 * the panel and left each product to compose its own classes onto them - 25
 * `*ClassName` props across three panels. Every one was a licensed place to
 * diverge, and they did: Porter's assistant answers are unbubbled prose and
 * Mira's were grey bubbles, because `bubbleClassName` is a free string and
 * nothing in the type system, the tests or the lint had an opinion about it.
 * A hex value cannot change the shape of anything. That is the point.
 *
 * ⚠ ONLY `card` TAKES CLASSES, and only for POSITION, shadow and blur - the
 * three things that are genuinely the product's (Porter floats above a stack of
 * two buttons and carries a glass treatment; Mira floats above one and is a flat
 * white card). The size, radius, padding and type scale are not reachable from
 * here at all.
 */
export interface AssistantTheme {
  /** The card's own background and its default text colour. */
  surface: string;
  fg: string;
  /** Secondary text: the subtitle, the caveat, timestamps, the prompts label. */
  muted: string;
  /** Hairlines: the header rule, the composer rule, input and prompt borders. */
  border: string;

  /** The brand colour: the send button, the user's bubble, the active thread. */
  accent: string;
  /** Text ON the accent. */
  accentFg: string;
  /** A wash of the accent: header pills, history icons, prompt hover. */
  accentSoft?: string;

  /** Error text. Falls back to a readable red. */
  danger?: string;

  /** The user's bubble, when it is not simply the accent. */
  userBubbleBg?: string;
  userBubbleFg?: string;

  /**
   * How an assistant's answer is drawn.
   *
   * ⚠ `plain` IS THE ESTATE DEFAULT, AND IT IS PORTER'S. An answer is prose a
   * person reads, often several paragraphs with a list in it; a tinted box with a
   * 85% width cap turns it into a quoted fragment and halves the reading width of
   * a 34rem panel. The user's own line is short and belongs in a pill, which is
   * what makes the two speakers tell apart by shape. A product that genuinely
   * wants filled bubbles says so by name here - it cannot arrive by a stray class.
   */
  assistantBubble?: 'plain' | 'filled';
  /** Only read when `assistantBubble` is `filled`. */
  assistantBubbleBg?: string;
  assistantBubbleFg?: string;

  /** Position, shadow, blur. NOT size, radius, padding or type. */
  card?: string;
}

/**
 * A theme as the custom properties every part of the panel already reads.
 *
 * ⚠ IT RETURNS A STYLE OBJECT FOR THE CARD, so the whole subtree inherits by
 * the cascade and nothing has to be threaded through a slot. This is the
 * mechanism `theme.ts` has described since 1.0 and that no product ever used,
 * because class slots were available and easier. Removing the slots is what
 * makes it the only path.
 */
export function themeToVars(theme: AssistantTheme): Record<string, string> {
  const accentSoft = theme.accentSoft ?? theme.accentFg;

  return {
    '--ai-surface': theme.surface,
    '--ai-fg': theme.fg,
    '--ai-muted': theme.muted,
    '--ai-border': theme.border,
    '--ai-accent': theme.accent,
    '--ai-accent-fg': theme.accentFg,
    '--ai-accent-soft': accentSoft,
    '--ai-danger': theme.danger ?? '#b91c1c',
    '--ai-bubble-user-bg': theme.userBubbleBg ?? theme.accent,
    '--ai-bubble-user-fg': theme.userBubbleFg ?? theme.accentFg,
    /*
     * ⚠ TRANSPARENT UNLESS THE PRODUCT ASKED FOR A FILLED BUBBLE. A background
     * set here while the geometry says `plain` would paint a box around prose
     * that has no padding to hold it.
     */
    '--ai-bubble-assistant-bg':
      theme.assistantBubble === 'filled'
        ? (theme.assistantBubbleBg ?? theme.accentSoft ?? '#f1f5f9')
        : 'transparent',
    '--ai-bubble-assistant-fg': theme.assistantBubbleFg ?? theme.fg,
  };
}
