import { useState } from 'react';

/**
 * One series over days as thin bars (one per day), in the product's accent, with a hover
 * tooltip per bar. A single series needs no legend: the section title names it.
 */
export interface TrendPoint {
  date: string;
  value: number;
  label: string;
}

const H = 140;
const PAD_TOP = 8;

export function TrendChart({ points, ariaLabel }: { points: TrendPoint[]; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 0);
  const slot = 100 / points.length;
  // 2px surface gap between bars, expressed in the 0-100 viewBox width.
  const barW = Math.max(slot - 0.8, 0.4);
  const first = points[0] as TrendPoint;
  const last = points[points.length - 1] as TrendPoint;
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), first);
  const hovered = hover === null ? null : (points[hover] ?? null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="block h-36 w-full" role="img" aria-label={ariaLabel}>
        {/* Recessive baseline only; values are read from the tooltip and the table. */}
        <line x1="0" x2="100" y1={H - 0.5} y2={H - 0.5} stroke="var(--ai-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => {
          const h = max > 0 ? ((H - PAD_TOP) * p.value) / max : 0;
          const x = i * slot + (slot - barW) / 2;
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Hit target taller and wider than the mark. */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 ? (
                <rect
                  x={x}
                  y={H - h}
                  width={barW}
                  height={h}
                  rx={Math.min(barW / 2, 1.2)}
                  fill="var(--ai-accent)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null && hovered ? (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[var(--ai-border)] bg-[var(--ai-surface)] px-2.5 py-1.5 text-xs shadow"
          style={{ left: `${(hover + 0.5) * slot}%` }}
        >
          <div className="text-[var(--ai-muted)]">{hovered.date}</div>
          <div className="font-semibold">{hovered.label}</div>
        </div>
      ) : null}
      <div className="mt-1 flex justify-between gap-2 text-xs text-[var(--ai-muted)]">
        <span>{first.date}</span>
        {peak.value > 0 ? (
          <span className="hidden sm:inline">
            Highest: <strong className="text-[var(--ai-fg)]">{peak.label}</strong> on {peak.date}
          </span>
        ) : null}
        <span>{last.date}</span>
      </div>
    </div>
  );
}
