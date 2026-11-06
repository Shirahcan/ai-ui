import type { CSSProperties, ReactNode } from 'react';
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
  /** Drawn before the title, e.g. the button that opens the conversations sidebar. */
  leading?: ReactNode;
  /** One line under the title. Porter has none; Mira has a tagline. */
  subtitle?: ReactNode;

  /** The header's own controls: History, New, Memory. Pills, right-aligned. */
  actions?: ReactNode;

  onClose?: () => void;
  closeLabel?: string;

  /** The accessible name, when the title is not a plain string. */
  label?: string;

  children?: ReactNode;

  /**
   * Position, surface, border and shadow. The size is not yours.
   *
   * ⚠ THESE ARE COLOUR SLOTS AND THEY APPEND, they do not replace. Every one of
   * them is composed ON TOP of `ASSISTANT_GEOMETRY`, so a product cannot drop the
   * shared padding or type size by styling the thing it sits on - which is the exact
   * way the panels drifted apart in the first place.
   */
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  closeClassName?: string;

  /**
   * Extra inline style for the card, merged UNDER the shared dimensions.
   *
   * ⚠ IT CARRIES THE THEME'S CUSTOM PROPERTIES, which is why it cannot be a
   * class: `--ai-*` values are set per instance and the whole subtree reads them
   * through the cascade. The size, radius and max-width still win over anything
   * passed here, so a product cannot reach them this way either.
   */
  style?: CSSProperties;

  /**
   * The large view (1.37.0, owner 2026-11-06): a viewport-bounded card over the page, so a wide table
   * or a long answer has room. The body still scrolls inside and the composer stays pinned.
   */
  expanded?: boolean;
}

/**
 * ⚠ INLINE, SO IT BEATS THE PRODUCT'S POSITION CLASSES. A product floats the small card with its own
 * `fixed bottom-24 right-5`; the large view must take the whole viewport less a margin wherever that
 * is. Both sides pinned plus a max width plus auto margins centres a fixed box; the wide shadow is the
 * scrim, so nothing else has to be mounted.
 */
const EXPANDED: CSSProperties = {
  position: 'fixed',
  top: '1rem',
  bottom: '1rem',
  left: '1rem',
  right: '1rem',
  margin: '0 auto',
  width: 'auto',
  height: 'auto',
  maxWidth: '72rem',
  maxHeight: 'none',
  borderRadius: '1.75rem',
  boxShadow: '0 0 0 100vmax rgba(15, 23, 42, 0.28), 0 24px 60px rgba(15, 23, 42, 0.25)',
};

/**
 * ⚠ `data-*` ATTRIBUTES PASS THROUGH, and that is not a convenience. Porter marks its
 * panel `data-porter-ui="assistant-panel"` because its IT-support snapshot collector
 * EXCLUDES everything under that attribute: the snapshot is meant to describe the page
 * somebody needs help with, and the panel is always open while they are asking for it.
 * A card that could not carry the mark would quietly put Porter's own chat into every
 * diagnostic it sends.
 */
export type AssistantSurfaceAttributes = {
  [key: `data-${string}`]: string | undefined;
};

export function AssistantSurface({
  title,
  leading,
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
  style,
  expanded = false,
  ...rest
}: AssistantSurfaceProps & AssistantSurfaceAttributes) {
  return (
    <div
      className={`flex flex-col overflow-hidden ${className ?? ''}`}
      /*
       * ⚠ THE SURFACE COLOUR IS ALWAYS THE THEME'S, NEVER CONDITIONAL ON
       * `className`. It used to drop to `undefined` the moment a product passed
       * any class at all - which every product did, because `className` is also
       * how a panel says WHERE it floats. So the one mechanism this package
       * documents for branding was unreachable in practice, every product
       * painted its own background with a utility instead, and the two theming
       * paths drifted. A product that wants glass sets a translucent
       * `--ai-surface` and keeps the blur in `className`.
       */
      style={{
        ...style,
        ...ASSISTANT_PANEL_SIZE,
        ...(expanded ? EXPANDED : {}),
        background: aiVar('--ai-surface'),
        color: aiVar('--ai-fg'),
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
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {leading}
          <div className="min-w-0">
          <p className={`${ASSISTANT_GEOMETRY.headerTitle} ${titleClassName ?? ''}`}>{title}</p>
          {subtitle ? (
            <p
              className={`${ASSISTANT_GEOMETRY.headerSubtitle} ${subtitleClassName ?? ''}`}
              style={subtitleClassName ? undefined : { color: aiVar('--ai-muted') }}
            >
              {subtitle}
            </p>
          ) : null}
          </div>
        </div>

        <div className={`${ASSISTANT_GEOMETRY.headerActions} min-w-0 justify-end`}>
          {actions}

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
              className={`${ASSISTANT_GEOMETRY.headerClose} ${closeClassName ?? ''}`}
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
