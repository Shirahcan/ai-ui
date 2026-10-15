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
