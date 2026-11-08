import type { CSSProperties, ReactNode } from 'react';
import { Composer, type ComposerProps } from './Composer';
import { aiVar, themeToVars, type AssistantTheme } from '../theme';

/**
 * The assistant docked INSIDE a screen (a site builder, a component studio, an editor): the one shell
 * every product embeds (1.42.0, owner 2026-11-08: "the packages (kit, UI) should expose infra that will
 * allow any surface easily embed/integrate the base/standard Porter, with easy/standardized
 * config/extension options").
 *
 * The SAME composer as the chat panel, the product's theme as values, and four slots a surface fills
 * with what it adds: `working` (progress while it runs), `notices` (its answer, a warning, a result
 * card; use {@see AssistantNotice}), `footer` (a hint above the composer) and the composer's own
 * `tools`. The assistant's name and greeting are data ({@see useAssistantIdentity}); a surface never
 * restyles the shell (the "sharing parts is not sharing a panel" lesson), only positions it.
 */
export interface AssistantBoxProps {
  theme: AssistantTheme;
  /** The composer, exactly as the chat panel takes it. */
  composer: ComposerProps;
  working?: ReactNode;
  notices?: ReactNode;
  footer?: ReactNode;
  /** POSITION only (sticky, margins, width): the look is the shell's and the theme's. */
  className?: string;
  style?: CSSProperties;
  /** A marker attribute the product's own code reads (e.g. `data-creator-porter`). */
  marker?: string;
  /** The landmark's accessible name ("Porter, the site builder"). */
  label?: string;
}

export function AssistantBox({ theme, composer, working, notices, footer, className = '', style, marker, label }: AssistantBoxProps) {
  const markerProps = marker ? { [`data-${marker}`]: '' } : {};

  return (
    <section
      aria-label={label}
      data-assistant-box=""
      {...markerProps}
      className={`space-y-2 ${className}`.trim()}
      style={{ ...themeToVars(theme), ...style }}
    >
      {working}
      {notices}
      {footer}
      <div className="rounded-2xl" style={{ boxShadow: '0 12px 40px rgb(15 23 42 / 0.14)' }}>
        <Composer {...composer} />
      </div>
    </section>
  );
}

/**
 * One line from the assistant on a docked surface: its answer, a warning, a result with an action.
 * `tone` is meaning, not decoration: `info` (the assistant speaking), `warning` (something to know
 * before going on). A dismiss hides the notice; it never changes the work.
 */
export function AssistantNotice({
  tone = 'info',
  children,
  onDismiss,
  dismissLabel = 'Dismiss',
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const warning = tone === 'warning';

  return (
    <div
      role="status"
      data-assistant-notice={tone}
      className="flex items-start gap-2 rounded-2xl border py-2 pl-4 pr-2 text-sm shadow-sm backdrop-blur-xl"
      style={
        warning
          ? { background: '#fffbeb', borderColor: '#fde68a', color: '#78350f' }
          : { background: aiVar('--ai-surface'), borderColor: aiVar('--ai-border'), color: aiVar('--ai-fg') }
      }
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          title={dismissLabel}
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 outline-none"
          style={{ color: warning ? '#b45309' : aiVar('--ai-muted') }}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
