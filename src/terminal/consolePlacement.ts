'use client';

import { type RefObject, useEffect, useRef } from 'react';

/** The gap the console keeps above the bottom of the viewport. */
const BOTTOM_MARGIN = 12;

/** The nearest ancestor that scrolls vertically (the product's canvas region), or null when the window scrolls. */
export function scrollRegionOf(el: Element): Element | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(window.getComputedStyle(node).overflowY)) return node;
  }

  return null;
}

export interface ConsolePlacement {
  /** The host's sticky, zero-height wrapper: where the host mounted the console. */
  anchor: RefObject<HTMLDivElement | null>;
  /** Moved to the scroll region's top-left corner; the tab and the console sit in it. */
  frame: RefObject<HTMLDivElement | null>;
  /** The console's box, its height capped at the bottom of the viewport. */
  box: RefObject<HTMLDivElement | null>;
}

/**
 * Places the console the same way on EVERY host (1.60.3, shared console C6f): at the top-left corner of the region
 * that scrolls (`offset.top` below its top edge, the tab touching its left edge), with its height ending a margin
 * above the bottom of the viewport.
 *
 * Why it is measured: the page builder mounts the console at the top-left of its canvas, so a sticky wrapper alone put
 * it in the right place there. The email editor mounts it inside the page's centred content column, 60px down, and
 * the same wrapper then left a gap between the sidebar and the tab, started the console too low, and ran its composer
 * and send button off the bottom of the screen. A host should not have to know any of that.
 *
 * With no scrolling region (the window scrolls) the host's own placement is kept and only the height is capped: the
 * window's left edge is not the canvas when a fixed sidebar sits over it. Written to the DOM directly, so a scroll
 * never re-renders the console.
 */
export function useConsolePlacement(open: boolean): ConsolePlacement {
  const anchor = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const at = anchor.current;
    const moved = frame.current;
    const capped = box.current;
    if (!at || !moved || !capped || typeof window === 'undefined') return;

    const region = scrollRegionOf(at);

    const fit = () => {
      const here = at.getBoundingClientRect();
      // The sticky wrapper's own `top` is the host's offset below the region's top edge (12px, or 73px under a header).
      const below = Number.parseFloat(window.getComputedStyle(at).top) || 0;
      let top = here.top;

      if (region) {
        const canvas = region.getBoundingClientRect();
        top = canvas.top + below;
        moved.style.left = `${canvas.left - here.left}px`;
        moved.style.top = `${top - here.top}px`;
      }

      capped.style.maxHeight = `${Math.max(window.innerHeight - Math.max(top, 0) - BOTTOM_MARGIN, 0)}px`;
    };

    fit();
    // Synchronous: scroll events run once per frame before paint, so the console never lags a frame behind the page.
    // Capture: the page usually scrolls inside the product's region, not the window, and scroll does not bubble.
    window.addEventListener('scroll', fit, { capture: true, passive: true });
    window.addEventListener('resize', fit);
    // The region moves without a scroll when the sidebar collapses or a banner opens above it.
    const resized = region && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (region) resized?.observe(region);

    return () => {
      window.removeEventListener('scroll', fit, { capture: true });
      window.removeEventListener('resize', fit);
      resized?.disconnect();
    };
  }, [open]);

  return { anchor, frame, box };
}
