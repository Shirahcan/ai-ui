import type { CSSProperties } from 'react';
import { ChatIcon } from '../icons';
import { themeToVars, type AssistantTheme } from '../theme';

/**
 * The round button that opens and closes an assistant panel.
 *
 * ⚠ IT EXISTS BECAUSE EVERY PRODUCT DREW ITS OWN, AND THE THIRD ONE DRIFTED. Porter
 * draws a 64px circle with this package's speech bubble and a `×`; Mira draws a 56px
 * circle with lucide's MessageCircle and X; Reeve (2026-10-26) shipped a rectangular
 * text button, and the owner caught it on sight. Same lesson as `AssistantChat`: sharing
 * the panel was not sharing the way IN to it.
 *
 * ⚠ THE SHAPE AND THE GLYPHS ARE PORTER'S, BECAUSE PORTER IS THE BLUEPRINT. The colour
 * is the product's accent through `--ai-accent` / `--ai-accent-fg`, set from the same
 * `theme` the panel takes. POSITION stays the product's (`className`), because where a
 * launcher floats depends on what else floats on that product's screens.
 */
export interface AssistantLauncherProps {
  open: boolean;
  onToggle: () => void;
  theme: AssistantTheme;
  openLabel: string;
  closeLabel: string;
  /** Position only: `fixed bottom-4 right-4 z-50`. */
  className?: string;
  style?: CSSProperties;
  /**
   * An answer arrived while the panel was closed (1.37.0, owner 2026-11-06): a small dot on the
   * button and a label that says so. The PRODUCT decides when, because it owns the open state.
   */
  unread?: boolean;
  /** The label while `unread`. Default: "{openLabel}: a new answer is waiting". */
  unreadLabel?: string;
}

export function AssistantLauncher({
  open,
  onToggle,
  theme,
  openLabel,
  closeLabel,
  className,
  style,
  unread = false,
  unreadLabel,
}: AssistantLauncherProps) {
  const label = open ? closeLabel : unread ? (unreadLabel ?? `${openLabel}: a new answer is waiting`) : openLabel;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      title={label}
      className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ai-accent)] text-[var(--ai-accent-fg)] shadow-[0_8px_30px_rgb(0,0,0,0.18)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] focus-visible:ring-offset-2 ${className ?? ''}`}
      style={{ ...(themeToVars(theme) as CSSProperties), ...style }}
    >
      {open ? <span className="text-2xl leading-none">×</span> : <ChatIcon size={28} />}
      {unread && !open ? (
        <span
          data-ai-unread=""
          aria-hidden="true"
          className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500"
        />
      ) : null}
    </button>
  );
}
