import React, { useEffect, useRef } from 'react';

export interface TerminalMenuItem {
  label: string;
  run: () => void;
}

/**
 * The console's ⋮ menu (1.48.0). It closes on a click or a tab anywhere outside it, as every menu does
 * (owner 2026-11-09: it stayed open over the transcript until the trigger was pressed again), and on Esc
 * through the panel's keys. ↑ ↓ move between its items; the first is focused when it opens from the keys.
 */
export function TerminalMenu({ open, onOpenChange, items }: { open: boolean; onOpenChange: (open: boolean) => void; items: TerminalMenuItem[] }): React.JSX.Element {
  const wrap = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const outside = (event: Event) => {
      const target = event.target as Node | null;

      if (target && wrap.current && !wrap.current.contains(target)) onOpenChange(false);
    };

    // Capture, so a click that something else stops still closes the menu.
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);

    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
    };
  }, [open, onOpenChange]);

  const move = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;

    buttons[(next + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' || open) return;
          event.preventDefault();
          onOpenChange(true);
          requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
        }}
        className="rounded px-1.5 text-[var(--term-dim)] outline-none hover:text-[var(--term-text)] focus-visible:ring-1 focus-visible:ring-[var(--term-accent)]"
      >
        ⋮
      </button>
      {open ? (
        <ul role="menu" aria-label="More" onKeyDown={move} className="absolute right-0 top-7 z-10 w-max min-w-56 rounded-md border border-[var(--term-border)] bg-[var(--term-bar)] py-1 shadow-xl">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenChange(false);
                  item.run();
                }}
                className="w-full whitespace-nowrap px-3 py-1 text-left text-[12px] outline-none hover:bg-[var(--term-selection)] focus-visible:bg-[var(--term-selection)]"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
