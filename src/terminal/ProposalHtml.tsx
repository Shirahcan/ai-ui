'use client';

import React, { useMemo, useSyncExternalStore } from 'react';

/**
 * A proposal field drafted as rich text (1.61.0, owner 2026-11-14: Porter's proposed email read as one run-on
 * paragraph next to the editor's version). The field's HTML is drawn as a document, typeset the way a WYSIWYG
 * editor shows it: paragraphs, headings, lists, bold, links, tables, note cards (`aside`) and fine print
 * (`small`). Tokens such as `{{button:Pay = {{url}}}}` stay visible text, exactly as the editor shows them.
 *
 * ⚠ THE HTML IS A MODEL'S OUTPUT. It is rebuilt from an allowlist before it is drawn: unknown elements are unwrapped
 * to their text, script-like elements are dropped with their content, every attribute except a link's safe `href`,
 * an image's `src`/`alt` and a cell's spans is removed. Nothing is drawn on the server (no DOMParser there): the
 * plain text stands in until the browser takes over.
 */

const KEEP = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'aside', 'small', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'a']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form', 'input', 'button', 'textarea', 'select']);
const SAFE_HREF = /^(https?:|mailto:|tel:|#|\{\{)/i;
const SAFE_SRC = /^(https?:|\{\{)/i;

function clean(node: Node, doc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [doc.createTextNode(node.textContent ?? '')];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return [];

  const children = Array.from(el.childNodes).flatMap((child) => clean(child, doc));
  if (!KEEP.has(tag)) return children;

  const out = doc.createElement(tag);
  if (tag === 'a') {
    const href = el.getAttribute('href')?.trim() ?? '';
    if (SAFE_HREF.test(href)) out.setAttribute('href', href);
    out.setAttribute('target', '_blank');
    out.setAttribute('rel', 'noopener noreferrer');
  } else if (tag === 'img') {
    const src = el.getAttribute('src')?.trim() ?? '';
    if (!SAFE_SRC.test(src)) return [];
    out.setAttribute('src', src);
    out.setAttribute('alt', el.getAttribute('alt') ?? '');
  } else if (tag === 'td' || tag === 'th') {
    for (const span of ['colspan', 'rowspan']) {
      const value = el.getAttribute(span);
      if (value && /^\d{1,2}$/.test(value) && value !== '1') out.setAttribute(span, value);
    }
  }
  children.forEach((child) => out.appendChild(child));

  return [out];
}

/** The field's HTML rebuilt from the allowlist; null where there is no DOMParser (the server). */
export function sanitizeProposalHtml(html: string): string | null {
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') return null;

  const parsed = new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const holder = parsed.createElement('div');
  Array.from(parsed.body.childNodes).flatMap((child) => clean(child, parsed)).forEach((child) => holder.appendChild(child));

  return holder.innerHTML;
}

/** Plain words for the server render and for a field whose HTML came back empty. */
function plainWords(html: string): string {
  return html.replace(/<\/(p|h[1-4]|li|td|th|aside|blockquote)>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

// The editor's typesetting (Tailwind prose-sm + the editor's own rules), spelled out so a product without the
// typography plugin draws the same document.
const DOCUMENT = [
  'rounded-lg border border-[#e5e7eb] bg-white px-4 py-3 font-sans text-[14px] leading-6 text-[#374151] [overflow-wrap:anywhere]',
  '[&_p]:my-2 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-[22px] [&_h1]:font-semibold [&_h1]:leading-7 [&_h1]:text-[#111827]',
  '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:leading-7 [&_h2]:text-[#111827]',
  '[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-[#111827] [&_h4]:mt-3 [&_h4]:font-semibold',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5',
  '[&_a]:text-[#111827] [&_a]:underline [&_strong]:font-semibold [&_strong]:text-[#111827] [&_b]:font-semibold',
  '[&_code]:rounded [&_code]:bg-[#f3f4f6] [&_code]:px-1 [&_code]:text-[13px]',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-[#e5e7eb] [&_blockquote]:pl-3 [&_blockquote]:italic',
  '[&_hr]:my-4 [&_hr]:border-[#e5e7eb] [&_img]:my-2 [&_img]:max-w-full',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#dddddd] [&_td]:p-2 [&_th]:border [&_th]:border-[#dddddd] [&_th]:bg-[#f3f4f6] [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold',
  '[&_aside]:my-3 [&_aside]:rounded-xl [&_aside]:border [&_aside]:border-[#e5e7eb] [&_aside]:bg-[#f9fafb] [&_aside]:px-4 [&_aside]:py-3',
  '[&_small]:text-[13px] [&_small]:text-[#6b7280] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
].join(' ');

const noSubscription = () => () => undefined;

export function ProposalHtml({ html, label }: { html: string; label: string }): React.JSX.Element {
  // The server and the first client render agree on the plain words; the document follows on the client.
  const onClient = useSyncExternalStore(noSubscription, () => true, () => false);
  const safe = useMemo(() => (onClient ? sanitizeProposalHtml(html) : null), [html, onClient]);

  if (safe === null || safe.trim() === '') {
    return <p className="whitespace-pre-line text-[var(--term-text)]">{plainWords(html)}</p>;
  }

  // Allowlisted above; the document is the field's own words, drawn as the editor draws them.
  return <div role="document" aria-label={label} className={DOCUMENT} dangerouslySetInnerHTML={{ __html: safe }} />;
}
