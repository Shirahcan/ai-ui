import { formatZonedDate, formatZonedDateTime, formatZonedTime, instantToWallTime } from '@shirahcan/calendar-ui';

/**
 * When a chat message was said, in words a reader needs no arithmetic for (1.37.0, owner 2026-11-06).
 *
 * ⚠ THE INSTANT IS THE SERVICE'S, THE WORDS ARE CALENDAR-UI'S. ai-service records when every turn was
 * said; a product only copies that onto `PanelMessage.at`. Every label here goes through calendar-ui,
 * the estate's one zone authority, so a chat time reads exactly like a meeting time ("5:07 PM WAT") and
 * names its zone, in the viewer's clock (owner time rules, 2026-10-04 and 2026-11-01).
 *
 * ⚠ GARBAGE IN, NOTHING OUT. A missing or unparseable instant returns null and the caller draws
 * nothing: "Invalid Date" on a chat row is worse than no time at all.
 */

function valid(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-11-06", the calendar day the instant falls on in `zone`. */
export function dayKey(iso: string | null | undefined, zone: string): string | null {
  const date = valid(iso);

  return date ? instantToWallTime(date, zone).slice(0, 10) : null;
}

/**
 * The calendar day `days` away from a "2026-11-06" key. Date arithmetic on the wall date, so a DST
 * change cannot skip or repeat a day the way subtracting 24 hours can.
 */
export function shiftDay(key: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);

  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whether two instants fall on the same calendar day in `zone`. */
export function sameDay(a: string | null | undefined, b: string | null | undefined, zone: string): boolean {
  const x = dayKey(a, zone);

  return x !== null && x === dayKey(b, zone);
}

/** "5:07 PM WAT". */
export function answerTime(iso: string | null | undefined, zone: string): string | null {
  const date = valid(iso);

  return date ? formatZonedTime(date, zone) : null;
}

/** "Fri, Nov 6, 2026, 5:07 PM WAT", for an export or a full tooltip. */
export function fullTime(iso: string | null | undefined, zone: string): string | null {
  const date = valid(iso);

  return date ? formatZonedDateTime(date, zone) : null;
}

/**
 * The divider over a day's messages: "Today", "Yesterday", "Wed, Nov 4", or with the year when it is
 * not this year ("Wed, Nov 4, 2025"). Today is the viewer's today, in `zone`, never UTC's.
 */
export function dayLabel(iso: string | null | undefined, zone: string, now: Date = new Date()): string | null {
  const date = valid(iso);
  if (!date) return null;
  const day = instantToWallTime(date, zone).slice(0, 10);
  const today = instantToWallTime(now, zone).slice(0, 10);
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  const label = formatZonedDate(date, zone, 'medium');

  return day.slice(0, 4) === today.slice(0, 4) ? label.replace(/, \d{4}$/, '') : label;
}

/** "8 s", "2 min", "1 h 5 min", "3 days": how long between two instants, for "answered 8 s later". */
export function elapsed(fromIso: string | null | undefined, toIso: string | null | undefined): string | null {
  const from = valid(fromIso);
  const to = valid(toIso);
  if (!from || !to) return null;
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  const days = Math.round(hours / 24);

  return days === 1 ? '1 day' : `${days} days`;
}
