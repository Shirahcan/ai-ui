/**
 * Copying an answer, and exporting a whole conversation, as the reader SAW it (owner, 2026-11-03:
 * "a copy CTA that allows formatted copies; an export conversation CTA").
 *
 * ⚠ COPY READS THE RENDERED ANSWER, NOT ITS MARKDOWN. The stored text is Markdown, and pasting
 * `**54** entries` into an email is exactly the "dirty output" the owner rejected. So a copy puts two
 * flavours on the clipboard: HTML (bold, lists and tables survive a paste into Gmail, Word or Docs)
 * and plain text built from the same rendered nodes (no asterisks), for a box that takes only text.
 *
 * ⚠ CONTROLS ARE NEVER COPIED. A card's buttons, the follow-up suggestions and anything marked
 * `data-ai-no-copy` are removed from the copy, so a pasted answer never reads "Apply it Cancel".
 */

import { deviceTimezone } from '@shirahcan/calendar-ui';
import { fullTime } from './chatTime';

const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR']);

/** A detached copy of `el` without its controls. */
export function cleanClone(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button, input, textarea, select, script, style, svg, [data-ai-no-copy]').forEach((n) => n.remove());
  // The panel's utility classes mean nothing in an email or a document: paste plain semantic HTML.
  [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))].forEach((n) => {
    Array.from(n.attributes)
      .filter((a) => a.name === 'class' || a.name === 'style' || a.name.startsWith('data-') || a.name.startsWith('aria-'))
      .forEach((a) => n.removeAttribute(a.name));
  });

  return clone;
}

/** Plain text that reads like the rendered answer: paragraphs, "- " bullets, numbered lists, tab-separated rows. */
export function htmlToPlainText(root: Node): string {
  let out = '';
  const ensureBreak = (n: number) => {
    const trailing = /\n*$/.exec(out)?.[0].length ?? 0;
    if (out !== '' && trailing < n) out += '\n'.repeat(n - trailing);
  };

  const walk = (node: Node, listIndex: { ordered: boolean; n: number } | null) => {
    if (node.nodeType === 3) {
      out += (node.textContent ?? '').replace(/\s+/g, ' ');

      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === 'BR') {
      out += '\n';

      return;
    }
    if (tag === 'LI') {
      ensureBreak(1);
      out += listIndex?.ordered ? `${++listIndex.n}. ` : '- ';
      el.childNodes.forEach((c) => walk(c, listIndex));

      return;
    }
    if (tag === 'TR') {
      ensureBreak(1);
      const cells = Array.from(el.children).map((c) => htmlToPlainText(c).replace(/\n+/g, ' '));
      out += cells.join('\t');

      return;
    }

    const block = BLOCKS.has(tag);
    if (block) ensureBreak(2);
    const nested = tag === 'UL' || tag === 'OL' ? { ordered: tag === 'OL', n: 0 } : listIndex;
    el.childNodes.forEach((c) => walk(c, nested));
    if (block) ensureBreak(2);
  };

  walk(root, null);

  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Put one rendered answer on the clipboard as HTML and plain text. Falls back to text alone where the
 * browser has no `ClipboardItem` (older Firefox). Throws when the browser refuses both.
 */
export async function copyRendered(el: HTMLElement): Promise<void> {
  const clone = cleanClone(el);
  const text = htmlToPlainText(clone);
  const html = clone.innerHTML;

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);

      return;
    } catch {
      // Some browsers refuse an HTML flavour; text alone still copies.
    }
  }

  await navigator.clipboard.writeText(text);
}

export interface ExportedTurn {
  speaker: string;
  /** The rendered answer or question, cleaned of controls. */
  html: string;
  text: string;
  /**
   * When it was said, in words ("Fri, Nov 6, 2026, 5:07 PM WAT"), when the row carried
   * `data-ai-export-at` (1.37.0). A transcript kept as a record must say when each answer was given.
   */
  when?: string;
}

/**
 * The turns of the conversation as rendered, read from the rows that carry `data-ai-export-role`.
 * `zone` is the reader's clock (default: this device's), for the time of a row that carries one.
 */
export function readRenderedTurns(
  container: HTMLElement,
  names: { user: string; assistant: string },
  zone: string = deviceTimezone(),
): ExportedTurn[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-ai-export-role]')).map((row) => {
    const clone = cleanClone(row);
    const when = fullTime(row.dataset.aiExportAt, zone);

    return {
      speaker: row.dataset.aiExportRole === 'user' ? names.user : names.assistant,
      html: clone.innerHTML,
      text: htmlToPlainText(clone),
      ...(when ? { when } : {}),
    };
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/**
 * Now, in the reader's clock, zone NAMED ("WAT", never "GMT+1"): through calendar-ui like every other
 * time the estate shows (owner time rules). Until 1.37.0 this hand-rolled `toLocaleString`, which
 * printed an offset where ICU has no abbreviation.
 */
function stamp(zone: string = deviceTimezone()): string {
  return fullTime(new Date().toISOString(), zone) ?? new Date().toISOString();
}

/** "You (Fri, Nov 6, 2026, 5:07 PM WAT)" when the turn says when, else just "You". */
function heading(turn: ExportedTurn): string {
  return turn.when ? `${turn.speaker} (${turn.when})` : turn.speaker;
}

function fileName(title: string, ext: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'conversation';

  return `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** A text file anyone can open: the speaker, then what they said, as it read on screen. */
export function conversationAsText(title: string, turns: ExportedTurn[]): string {
  return [`${title}`, `Exported ${stamp()}`, '', ...turns.flatMap((t) => [`${heading(t)}:`, t.text, ''])].join('\n').trim() + '\n';
}

export function downloadConversationText(title: string, turns: ExportedTurn[]): void {
  const blob = new Blob([conversationAsText(title, turns)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(title, 'txt');
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The printable document behind "Save as PDF": formatting kept, every control gone. */
export function conversationAsHtml(title: string, turns: ExportedTurn[]): string {
  const rows = turns
    .map((t) => `<section class="turn"><p class="who">${escapeHtml(heading(t))}</p><div class="body">${t.html}</div></section>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;margin:32px;max-width:760px}
h1{font-size:20px;margin:0 0 4px}.when{color:#64748b;font-size:12px;margin:0 0 24px}
.turn{break-inside:avoid;margin:0 0 18px}.who{font-weight:700;font-size:12px;color:#475569;margin:0 0 4px}
.body p{margin:0 0 8px}.body ul,.body ol{margin:0 0 8px;padding-left:22px}
table{border-collapse:collapse;margin:6px 0 10px}td,th{border:1px solid #cbd5e1;padding:4px 8px;text-align:left;font-size:12px}
a{color:#1d4ed8}</style></head><body><h1>${escapeHtml(title)}</h1><p class="when">Exported ${escapeHtml(stamp())}</p>${rows}</body></html>`;
}

/**
 * Opens the browser's print dialog on the conversation, where "Save as PDF" is one choice. A hidden
 * frame, so the page the reader is on never changes.
 */
export function printConversation(title: string, turns: ExportedTurn[]): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    throw new Error('This browser could not open the print view.');
  }
  doc.open();
  doc.write(conversationAsHtml(title, turns));
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  }, 50);
}
