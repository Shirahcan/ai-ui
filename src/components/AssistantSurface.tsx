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
}

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

        <div className={ASSISTANT_GEOMETRY.headerActions}>
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
