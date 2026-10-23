import type { ReactNode } from 'react';
import { ASSISTANT_GEOMETRY, ASSISTANT_PANEL_SIZE } from '../geometry';
import { aiVar } from '../theme';

/**
 * The floating card an assistant lives in: its size, its header, and the way out.
 *
 * ⚠ IT EXISTS BECAUSE SHARING THE PARTS WAS NOT SHARING THE PANEL. P18a-d gave
 * three products the same feedback control, bubble, intro, composer and history
 * list, and left each panel a different size and shape - Porter 34rem by 40rem,
 * Mira 400px by 560px, with different radii, header heights and paddings. Two
 * panels built from the same components still did not look like one product, and a
 * layout change still had to be made in every product that had a panel.
 *
 * ⚠ THE DIMENSIONS ARE NOT OVERRIDABLE BY A CLASS, deliberately. They are inline
 * style, because that is the only way a shared size cannot be quietly beaten by a
 * product's own `h-[560px]`. Everything that is COLOUR - the surface, the border,
 * the shadow, the blur, the accent on the action pills - arrives as class slots,
 * and a product that passes none gets a readable, unbranded card.
 *
 * ⚠ POSITION STAYS THE PRODUCT'S. Porter anchors above a stack of two floating
 * buttons and remembers which corner the user dragged it to; Mira sits above one.
 * That is not geometry a package can know, so `className` carries it.
 */
export interface AssistantSurfaceProps {
  /** The panel's name. Also its accessible name unless `label` says otherwise. */
  title: ReactNode;
  /** One line under the title. Porter has none; Mira has a tagline. */
  subtitle?: ReactNode;

  /** The header's own controls: History, New, Memory. Pills, right-aligned. */
  actions?: ReactNode;

  onClose?: () => void;
  closeLabel?: string;

  /** The accessible name, when the title is not a plain string. */
  label?: string;

  children?: ReactNode;

  /** Position, surface, border and shadow. The size is not yours. */
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  closeClassName?: string;

  /** Passed through so a product can exclude the panel from its own DOM reads. */
  'data-testid'?: string;
}

export function AssistantSurface({
  title,
  subtitle,
  actions,
  onClose,
  closeLabel = 'Close',
  label,
  children,
  className,
  headerClassName,
  titleClassName,
  subtitleClassName,
  closeClassName,
  ...rest
}: AssistantSurfaceProps) {
  return (
    <div
      className={`flex flex-col overflow-hidden ${className ?? ''}`}
      style={{
        ...ASSISTANT_PANEL_SIZE,
        background: className ? undefined : aiVar('--ai-surface'),
        color: className ? undefined : aiVar('--ai-fg'),
      }}
      /*
       * ⚠ `role="dialog"` WITH A NAME, because this is a floating region a keyboard
       * user lands in from nowhere. Without the name a screen reader announces
       * "dialog" and nothing else.
       */
      role="dialog"
      aria-label={label ?? (typeof title === 'string' ? title : 'Assistant')}
      {...rest}
    >
      <header
        className={`${ASSISTANT_GEOMETRY.header} shrink-0 ${headerClassName ?? ''}`}
        style={
          headerClassName ? undefined : { borderBottom: `1px solid ${aiVar('--ai-border')}` }
        }
      >
        <div className="min-w-0">
          <p className={titleClassName ?? ASSISTANT_GEOMETRY.headerTitle}>{title}</p>
          {subtitle ? (
            <p
              className={subtitleClassName ?? ASSISTANT_GEOMETRY.headerSubtitle}
              style={subtitleClassName ? undefined : { color: aiVar('--ai-muted') }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className={ASSISTANT_GEOMETRY.headerActions}>
          {actions}

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
              className={closeClassName ?? ASSISTANT_GEOMETRY.headerClose}
              style={closeClassName ? undefined : { color: aiVar('--ai-muted') }}
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      {children}
    </div>
  );
}
