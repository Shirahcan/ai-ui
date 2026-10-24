/**
 * The panel's own icons, as inline SVG.
 *
 * ⚠ THEY EXIST BECAUSE "PASS YOUR OWN ICON" WAS A HOLE, NOT A FEATURE. The
 * package took icons as props so it would not depend on any product's icon
 * library - and the fallback for a missing icon was the WORD. Porter's guest
 * panel passed none, so the shared panel drew "Helpful" and "Not helpful" inside
 * a 28px circle sized for a glyph, overlapping each other, on a public page.
 * Two parts of one package disagreed and a product was blamed for the gap.
 *
 * Inline SVG depends on nothing, so the package can always draw these itself. A
 * product may still pass its own; it never HAS to.
 */
const svg = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function ThumbUpIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svg}>
      <path d="M7 10v12 M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

export function ThumbDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svg}>
      <path d="M17 14V2 M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

export function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svg}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svg}>
      <path d="M3 6h18 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6" />
    </svg>
  );
}
