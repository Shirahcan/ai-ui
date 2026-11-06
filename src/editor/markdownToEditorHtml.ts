/**
 * Markdown as a rich editor's HTML (1.35.0, owner 2026-11-06: "add a pasteMarkdown door on the shared
 * editor to enable universal use"). Paragraphs, bold, italics, inline code, links, bullet and numbered
 * lists, quotes, and headings as bold lines: what an assistant writes, in the shape every TipTap
 * editor in the estate can hold.
 *
 * ⚠ EVERYTHING IS ESCAPED FIRST, then only the tags made here are added. An assistant answer quotes
 * transcripts, documents and emails, and none of that may ever become markup in a message to a client.
 * A link keeps its address only when it is http(s) or a path on the same site.
 *
 * Pure and DOM-free, so it lives in the main entry (any product, any editor) and is unit-tested.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) =>
      /^(https?:\/\/|\/(?![/\\]))/.test(href) ? `<a href="${href}">${label}</a>` : label);
}

type Block = { kind: 'p' | 'quote'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] };

export function markdownToEditorHtml(markdown: string): string {
  const out: string[] = [];
  let block: Block | null = null;

  // Narrowed through a local const each time: TypeScript does not narrow a captured `let`.
  const flush = () => {
    const b: Block | null = block;
    if (b === null) return;
    if ('items' in b) out.push(`<${b.kind}>${b.items.map((i) => `<li><p>${i}</p></li>`).join('')}</${b.kind}>`);
    else if (b.kind === 'quote') out.push(`<blockquote><p>${b.lines.join('<br>')}</p></blockquote>`);
    else out.push(`<p>${b.lines.join('<br>')}</p>`);
    block = null;
  };
  const add = (kind: Block['kind'], html: string) => {
    let b: Block | null = block;
    if (b === null || b.kind !== kind) {
      flush();
      b = kind === 'ul' || kind === 'ol' ? { kind, items: [] } : { kind, lines: [] };
      block = b;
    }
    if ('items' in b) b.items.push(html);
    else b.lines.push(html);
  };

  let fenced = false;
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      flush();
      continue;
    }
    if (fenced) {
      // Code keeps its characters, escaped, one paragraph per line.
      add('p', `<code>${escapeHtml(line)}</code>`);
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (bullet) add('ul', inline(escapeHtml(bullet[1] ?? '')));
    else if (numbered) add('ol', inline(escapeHtml(numbered[1] ?? '')));
    else if (quote) add('quote', inline(escapeHtml(quote[1] ?? '')));
    else if (line.trim() === '' || /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) flush();
    else if (heading) {
      flush();
      out.push(`<p><strong>${inline(escapeHtml(heading[1] ?? ''))}</strong></p>`);
    } else add('p', inline(escapeHtml(line)));
  }
  flush();

  return out.join('');
}

/**
 * Whether pasted plain text is Markdown worth converting: a list, a heading, bold, a link, a quote.
 * Ordinary prose (no marks) pastes as it always did.
 */
export function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)\s*([-*+]|\d+[.)])\s+\S|(^|\n)#{1,6}\s+\S|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|(^|\n)>\s?\S/.test(text);
}
