import type { ReactNode } from 'react';
import { aiVar } from '../theme';

/**
 * Asking an assistant for something, once, because a person asked for it.
 *
 * ⚠ IT OWNS THE DECISIONS, NOT THE LAYOUT, and the difference is why it is this small.
 * Four surfaces across two products do this job today (finance's month-end brief and its
 * place-held proposal, MployNow's person-ask and its day brief), and measuring all four for
 * P14d showed that what they have in common is NOT a shape - it is a set of rules that two
 * of them got right and two of them did not. So this component exists to make those rules
 * hard to get wrong, and deliberately carries no colour, no copy and no trigger.
 *
 * ⚠ A REFUSAL IS NOT AN ERROR, AND THIS IS THE ONE RULE THAT EARNS THE COMPONENT.
 * "The spend cap is reached", "no provider is cleared to read the ledger", "Mira is not
 * configured on this environment" all arrive as SUCCESSFUL responses, and all of them leave
 * the screen around them working perfectly. Rendered as an alarm they read as a broken
 * product - which is exactly what MployNow's person-ask did until 2026-10-23, in red, beside
 * a form that still worked. So `refusal` and `error` are separate props with separate
 * treatments, and only `error` carries `role="alert"`. Reeve's own acceptance test asserts
 * `role="alert"` count ZERO on a refusal; this makes that the default rather than a thing
 * each adopter has to remember.
 *
 * ⚠ IT NEVER ASKS BY ITSELF. There is no effect in here and no `url`: the product calls
 * `onAsk` from a real click. That is the on-demand rule made structural - a component that
 * could fire on mount is a component that will eventually be mounted somewhere nobody is
 * reading, which is how 96% of one month's AI bill went on work nobody asked for.
 *
 * ⚠ THE TRIGGER IS DELIBERATELY NOT A MODE. MployNow's day brief generates on OPEN (cached
 * per viewer, so the first open of each window pays) rather than on a click, and it is right
 * to: a reader who opened the calendar is a reader. Giving this component a `trigger="open"`
 * would have made it responsible for the one decision that genuinely differs per surface,
 * and that is how a shared component acquires a mode nobody can remove. A surface that asks
 * on open renders its own control and uses the slots below.
 *
 * ```tsx
 * <OnDemandAsk
 *   askLabel="Ask Reeve to write the brief"
 *   busyLabel="Writing…"
 *   busy={busy}
 *   onAsk={() => void ask()}
 *   costNote="Optional, and it costs a model call. Everything it would describe is already on this page."
 *   refusal={refusal}
 *   attribution={provider ? `Written by ${provider}.` : null}
 * >
 *   {brief}
 * </OnDemandAsk>
 * ```
 */
export interface OnDemandAskProps {
  /** The verb on the control. A real verb, never "Generate". */
  askLabel: string;
  /** What the control says while a call is in flight. */
  busyLabel: string;
  busy?: boolean;
  /** Called on a real click. The component never calls it itself. */
  onAsk: () => void;
  /**
   * Said BEFORE the click, where it can still change the decision.
   *
   * ⚠ NO DEFAULT ON PURPOSE. The honest sentence differs per surface - what the call costs,
   * and what is already on the page without it - and a generic default would be the kind of
   * copy everybody stops reading. Omitting it is allowed, and visible in review.
   */
  costNote?: ReactNode;
  /** A successful response that declined. Rendered as guidance. */
  refusal?: string | null;
  /** A genuine failure. Rendered as an alarm, because it is one. */
  error?: string | null;
  /** Who wrote it, and what the prose is not. */
  attribution?: ReactNode;
  /** The answer. Prose, a `GroundedAnswer`, or a form the person confirms. */
  children?: ReactNode;
  /** True while the surface itself is not ready - a missing scope, a read-only viewer. */
  disabled?: boolean;
  className?: string;
  /** The product's own button styling. The component ships none. */
  buttonClassName?: string;
}

export function OnDemandAsk({
  askLabel,
  busyLabel,
  busy = false,
  onAsk,
  costNote,
  refusal,
  error,
  attribution,
  children,
  disabled = false,
  className,
  buttonClassName,
}: OnDemandAskProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onAsk}
          disabled={busy || disabled}
          className={buttonClassName ?? 'whitespace-nowrap px-3 py-2 text-sm outline-none disabled:opacity-50'}
          style={buttonClassName ? undefined : { border: `1px solid ${aiVar('--ai-border')}` }}
        >
          {busy ? busyLabel : askLabel}
        </button>

        {costNote ? (
          <span className="text-sm" style={{ color: aiVar('--ai-muted') }}>
            {costNote}
          </span>
        ) : null}
      </div>

      {/*
        ⚠ `aria-busy` ON THE REGION, AND A LIVE ANNOUNCEMENT, so a screen-reader user is told
        the answer arrived. Without it the only signal is a button label changing, which a
        reader who has moved focus away never hears.
      */}
      <div aria-busy={busy} aria-live="polite">
        {children ? <div className="mt-4 max-w-prose text-sm">{children}</div> : null}

        {attribution && children ? (
          <p className="mt-3 text-xs" style={{ color: aiVar('--ai-muted') }}>
            {attribution}
          </p>
        ) : null}

        {/*
          A REFUSAL. No `role="alert"`, because nothing is broken: the facts this would have
          described are on the page already and every control around it still works.
        */}
        {refusal && !children ? (
          <p
            className="mt-4 max-w-prose pl-3 text-sm"
            style={{ borderLeft: `4px solid ${aiVar('--ai-border')}` }}
          >
            {refusal}
          </p>
        ) : null}

        {/* A FAILURE. This one is an alarm. */}
        {error && !children ? (
          <p className="mt-4 max-w-prose text-sm" role="alert" style={{ color: aiVar('--ai-danger') }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
