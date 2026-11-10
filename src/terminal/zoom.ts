/** The console's text sizes (1.54.0): Ctrl + and Ctrl - step through them, Ctrl 0 goes back to 1. */
export const TERMINAL_ZOOMS = [0.85, 1, 1.15, 1.3, 1.5] as const;

/** One step bigger (1), smaller (-1) or back to the usual size (0), from the nearest listed size. */
export function stepZoom(current: number, step: 1 | -1 | 0): number {
  if (step === 0) return 1;

  const sizes: readonly number[] = TERMINAL_ZOOMS;
  const at = sizes.reduce((best, size, i) => (Math.abs(size - current) < Math.abs((sizes[best] ?? 1) - current) ? i : best), 0);

  return sizes[Math.min(sizes.length - 1, Math.max(0, at + step))] ?? 1;
}
