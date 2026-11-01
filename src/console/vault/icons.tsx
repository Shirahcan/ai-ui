/**
 * The icons the ported vault panels name, drawn inline so the package depends on no icon
 * library (the same reason `../icons.tsx` exists). Same names as the lucide originals.
 */
type IconProps = { className?: string };

function make(paths: string[]) {
  return function Icon({ className = 'h-4 w-4' }: IconProps) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

export type LucideIcon = (props: IconProps) => React.ReactElement;

export const MoreVertical = make(['M12 5h.01', 'M12 12h.01', 'M12 19h.01']);
export const Copy = make(['M8 8h12v12H8z', 'M16 8V4H4v12h4']);
export const Plus = make(['M12 5v14', 'M5 12h14']);
export const X = make(['M18 6 6 18', 'M6 6l12 12']);
export const ArrowUp = make(['M12 19V5', 'M5 12l7-7 7 7']);
export const ArrowDown = make(['M12 5v14', 'M19 12l-7 7-7-7']);
export const Trash2 = make(['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6']);
export const KeyRound = make(['M2 18v3h3l7.5-7.5', 'M14 4a6 6 0 1 1-1.8 11.7', 'M16.5 7.5h.01']);
export const ShieldCheck = make(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4']);
export const ShieldOff = make(['M19.7 14A10 10 0 0 0 20 12V5l-8-3-3.2 1.2', 'M4.7 4.7 4 5v7c0 6 8 10 8 10a20 20 0 0 0 5.6-4.4', 'M2 2l20 20']);
export const ShieldQuestion = make(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01']);
export const Power = make(['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.8 0']);
export const PowerOff = make(['M18.4 6.6a9 9 0 0 1 1.3 11', 'M5.6 6.6A9 9 0 0 0 17.2 19.4', 'M12 2v4', 'M2 2l20 20']);
export const OctagonX = make(['M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z', 'M15 9l-6 6', 'M9 9l6 6']);
export const Play = make(['M6 3l14 9-14 9z']);
export const AlertTriangle = make(['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01']);
export const Boxes = make(['M3 7l9-4 9 4-9 4z', 'M3 7v10l9 4 9-4V7', 'M12 11v10']);
export const Globe = make(['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z']);
export const Mic = make(['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3']);
export const ListOrdered = make(['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 6h1v4', 'M4 10h2', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1']);

/* Section icons for the console sidebar (owner, 2026-11-01: every section has one). */
export const Gauge = make(['M12 14l4-4', 'M3.3 19a10 10 0 1 1 17.4 0']);
export const ListIcon = make(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01']);
export const FileText = make(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h6']);
export const MessageVoice = make(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'M8 9h8', 'M8 13h5']);
export const BookOpen = make(['M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z', 'M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z']);
export const ThumbsUp = make(['M7 10v12', 'M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z']);
export const Layers = make(['M12 2 2 7l10 5 10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5']);
export const Route = make(['M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M9 16h6a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h3']);
export const DollarSign = make(['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6']);
export const Wallet = make(['M19 7V4H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6', 'M16 14h.01']);
export const Clock = make(['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2']);
