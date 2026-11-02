/**
 * Bold the important figures in an assistant's words, deterministically, wherever it speaks.
 *
 * ⚠ WHY THIS IS NOT LEFT TO THE MODEL (owner, 2026-11-02). Every product's prompt already says "put
 * the important figures in bold" (ai-service ChatTurnFrame), and answers kept arriving with
 * "14,597.48", "54 entries" and "Nov 2, 2026" in plain text: a rule in prose is followed when the
 * model remembers it, and a reply written from a template never saw that rule at all. A remark
 * plugin on the ONE shared Markdown path is applied to every answer, streamed or not, in every
 * product, and to every future reply without anyone remembering anything.
 *
 * What counts as a figure (conservative on purpose: bolding an id or a year is noise):
 *   - money: "3,610.00 CAD", "CAD 19.99", "$262.50", "NGN 215,802.53"
 *   - a percentage: "12.5%"
 *   - a date, with an optional time and zone: "Mon, Nov 2, 2026 at 10:33 PM WAT", "Nov 2, 2026", "2026-11-02"
 *   - a duration: "240 days", "15 minutes"
 *   - a count of things: "18 payment records", "121 checkouts started", "3 cases"
 *   - any number written with a thousands separator or decimals: "14,597.48"
 *
 * Never touched: text already bold, inside a link, inline code or code blocks, headings, and any
 * number that is part of an identifier ("MKT-C1D7F472", "IMM 5476", "v1.27.0", "01a05567").
 */

type Node = { type: string; value?: string; children?: Node[] };

const CURRENCY = '(?:CAD|USD|NGN|GHS|EUR|GBP|KES|ZAR|INR)';
const NUMBER = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const WEEKDAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\\s';
const TIME = '(?:\\s(?:at\\s)?\\d{1,2}:\\d{2}(?:\\s?[AP]M)?(?:\\s[A-Z]{2,5})?)?';
const UNITS = '(?:seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)';

/** Longest alternatives first, so a date wins over the bare number inside it. */
const FIGURE = new RegExp(
  [
    `(?:${WEEKDAY})?${MONTH}\\s\\d{1,2},\\s\\d{4}${TIME}`,
    `\\d{4}-\\d{2}-\\d{2}${TIME}`,
    `${CURRENCY}\\s?(?:${NUMBER})`,
    `(?:C\\$|US\\$|\\$|₦|£|€)\\s?(?:${NUMBER})`,
    `(?:${NUMBER})\\s?${CURRENCY}\\b`,
    `(?:${NUMBER})\\s?%`,
    `(?:${NUMBER})\\s${UNITS}\\b`,
    // A count: a whole number followed by a word (not a unit of a code). Years are left alone.
    `\\b(?!(?:19|20)\\d{2}\\b)\\d{1,3}(?:,\\d{3})*(?=\\s[a-z])`,
    `\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+\\.\\d{2}\\b`,
  ].join('|'),
  'g',
);

/** A figure glued to letters, dashes, slashes or dots on either side is part of an identifier. */
function isPartOfIdentifier(text: string, start: number, end: number): boolean {
  const before = text.charAt(start - 1);
  const after = text.charAt(end);
  const glued = /[A-Za-z0-9_\-/#.]/;

  return (before !== '' && glued.test(before) && !/[$€£₦]/.test(text.charAt(start))) || (after !== '' && /[A-Za-z0-9_\-/#]/.test(after));
}

function split(value: string): Node[] {
  const out: Node[] = [];
  let last = 0;
  FIGURE.lastIndex = 0;
  for (let m = FIGURE.exec(value); m !== null; m = FIGURE.exec(value)) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[0].trim() === '' || isPartOfIdentifier(value, start, end)) {
      continue;
    }
    if (start > last) {
      out.push({ type: 'text', value: value.slice(last, start) });
    }
    out.push({ type: 'strong', children: [{ type: 'text', value: m[0] }] });
    last = end;
  }
  if (out.length === 0) {
    return [{ type: 'text', value }];
  }
  if (last < value.length) {
    out.push({ type: 'text', value: value.slice(last) });
  }

  return out;
}

const SKIP = new Set(['strong', 'link', 'linkReference', 'inlineCode', 'code', 'heading', 'html', 'definition', 'image']);

function walk(node: Node): void {
  if (!node.children) {
    return;
  }
  const next: Node[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      next.push(...split(child.value));
    } else {
      if (!SKIP.has(child.type)) {
        walk(child);
      }
      next.push(child);
    }
  }
  node.children = next;
}

/** The remark plugin. Shared through {@link assistantRemarkPlugins}; also exported for tests. */
export function remarkEmphasiseFigures() {
  return (tree: Node) => {
    walk(tree);
  };
}

/** The same rule on a plain string, for a surface that renders Markdown text it builds itself. */
export function emphasiseFiguresInText(text: string): string {
  return split(text)
    .map((n) => (n.type === 'strong' ? `**${n.children?.[0]?.value ?? ''}**` : (n.value ?? '')))
    .join('');
}
