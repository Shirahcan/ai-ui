import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useConsole } from './ConsoleContext';

/**
 * Renders a modal on `document.body`, carrying the console's theme with it.
 *
 * ⚠ WHY A PORTAL (owner, 2026-11-01: "the modal backdrop isn't properly covering the top
 * area"). A product's page root commonly sets `position: relative; z-index`, which makes a
 * stacking context; a `fixed` scrim inside it can never rise above the product's own top bar,
 * however high its z-index. On the body it covers the whole window.
 *
 * ⚠ AND IT RE-APPLIES THE THEME VARIABLES, because they were set on the provider's element and
 * a portal leaves that subtree: without them the modal would fall back to unbranded defaults.
 */
export function ConsolePortal({ children }: { children: ReactNode }) {
  const { vars } = useConsole();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div style={vars} className="text-[var(--ai-fg)]" data-ai-console-portal="">
      {children}
    </div>,
    document.body,
  );
}
