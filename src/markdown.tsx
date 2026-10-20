import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * How an assistant's Markdown is rendered, everywhere it speaks.
 *
 * ⚠ THIS EXISTS BECAUSE PORTIFY HAD THE SAME MAP IN TWO PLACES AND BOTH WERE
 * WRONG IN THE SAME WAYS - which is exactly how a duplicated fact fails: you fix
 * it in one copy. `AssistantMessageBubble` and `ResearchMessage` had already
 * drifted (one set `cursor-pointer` on links, the other did not; one styled
 * `code`, the other did not), and both were missing the two things reported from
 * production:
 *
 *   - ⚠ **TABLES RENDERED AS RAW PIPES.** `react-markdown` does NOT parse GFM
 *     tables without `remark-gfm`, so a knowledge entry containing a table
 *     arrived as `| | what it is for | |---|---| | **Portify** | ...` - a wall
 *     of punctuation in the middle of an otherwise clean answer. Easy to leave
 *     out, because everything else works without it.
 *   - ⚠ **HEADINGS RENDERED AS BODY TEXT.** They WERE real `<h2>` elements, but
 *     Tailwind's preflight resets heading size and weight to the surrounding
 *     text, so a section title looked like a stray sentence.
 *
 * ⚠ THE CLASSES ARE THE PRODUCT'S, NOT THIS PACKAGE'S. What is shared is the
 * STRUCTURE - which elements are mapped, that `remark-gfm` is on, that headings
 * are sized DOWN for a chat bubble rather than left at browser defaults - and a
 * product passes its own palette. A package that shipped Portify's `#4361EE`
 * would be unusable by MployNow without a fork, and the fork would drift.
 */

export interface MarkdownTheme {
  link?: string;
  paragraph?: string;
  list?: string;
  orderedList?: string;
  listItem?: string;
  strong?: string;
  heading?: string;
  /**
   * Per-level heading classes, each falling back to `heading`.
   *
   * ⚠ ADDED IN 1.2. One class for every level reads fine until an answer is
   * long enough to need real sections: a knowledge entry written as a document
   * arrives with `h1`, `h2` and `h3` in it, and rendering all three identically
   * turns the hierarchy its author wrote into undifferentiated bold lines.
   */
  heading1?: string;
  heading2?: string;
  heading3?: string;
  heading4?: string;
  code?: string;
  codeBlock?: string;
  table?: string;
  tableHead?: string;
  tableCell?: string;
  /**
   * The `<thead>` and `<tbody>` rows.
   *
   * ⚠ ADDED IN 1.2 BECAUSE A PRODUCT COULD NOT EXPRESS ITS OWN TABLE. The
   * first real adopter styled `thead` with a bottom rule and `tbody` with row
   * dividers, and there was no slot for either - so adopting this map would
   * have silently flattened its tables into undivided blocks of text. A
   * capability a consumer needs is a slot added here, never a reason for that
   * consumer to keep its own copy of the whole map.
   */
  tableHeadRow?: string;
  tableBody?: string;
  blockquote?: string;
  hr?: string;
}

/**
 * Deliberately plain. A product that passes nothing gets something readable
 * rather than something branded, so an unstyled adoption looks unfinished
 * instead of looking like another product.
 */
const FALLBACK: Required<MarkdownTheme> = {
  link: 'underline underline-offset-2 outline-none',
  paragraph: 'my-1 first:mt-0 last:mb-0',
  list: 'my-1 list-disc space-y-1 pl-5',
  orderedList: 'my-1 list-decimal space-y-1 pl-5',
  listItem: 'leading-relaxed',
  strong: 'font-semibold',
  /*
   * ⚠ SIZED DOWN ON PURPOSE. These arrive from knowledge entries written as
   * DOCUMENTS, so a browser-default `<h2>` is enormous inside a ~330px chat
   * bubble. They have to read as section breaks in a conversation.
   */
  heading: 'mt-3 mb-1 text-[0.95em] font-bold first:mt-0',
  /**
   * Per-level overrides, each falling back to `heading`.
   *
   * ⚠ ADDED IN 1.2. One class for every level reads fine until an answer is
   * long enough to need real sections - a knowledge entry written as a document
   * arrives with `h1`, `h2` and `h3` in it, and rendering all three identically
   * loses the hierarchy the author wrote. The first adopter had four distinct
   * sizes for exactly that reason.
   */
  heading1: '',
  heading2: '',
  heading3: '',
  heading4: '',
  code: 'rounded px-1 py-0.5 text-[0.9em]',
  codeBlock: 'my-2 overflow-x-auto rounded-lg p-2 text-[0.85em]',
  /*
   * ⚠ `overflow-x-auto` ON A WRAPPER, NOT ON THE TABLE. A wide table inside a
   * chat bubble otherwise stretches the bubble past the panel and takes the
   * whole conversation's layout with it.
   */
  table: 'my-2 w-full border-collapse text-[0.9em]',
  tableHeadRow: '',
  tableBody: '',
  tableHead: 'text-left font-semibold',
  tableCell: 'border-b py-1 pr-3 align-top',
  blockquote: 'my-2 border-l-2 pl-3 italic',
  hr: 'my-3 border-t',
};

/**
 * ⚠ PASS THIS TO EVERY `<ReactMarkdown>` THAT RENDERS AN ASSISTANT'S WORDS.
 * Without it, tables are raw pipes. It is the single easiest thing to omit and
 * the most visible when omitted.
 */
export const assistantRemarkPlugins = [remarkGfm];

export function assistantMarkdownComponents(theme: MarkdownTheme = {}): Components {
  const t = { ...FALLBACK, ...theme };

  return {
    a: ({ href, children }) => {
      const url = href ?? '#';
      /*
       * ⚠ EXTERNAL LINKS GET `noopener noreferrer`, AND THE REASON IS NOT
       * TIDINESS. An assistant's answer can contain a link it found on the open
       * web (a research citation), and `target="_blank"` without `noopener`
       * hands that page a handle on this one.
       */
      const isExternal = /^https?:\/\//.test(url);

      return (
        <a
          href={url}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className={t.link}
        >
          {children}
        </a>
      );
    },

    p: ({ children }) => <p className={t.paragraph}>{children}</p>,
    ul: ({ children }) => <ul className={t.list}>{children}</ul>,
    ol: ({ children }) => <ol className={t.orderedList}>{children}</ol>,
    li: ({ children }) => <li className={t.listItem}>{children}</li>,
    strong: ({ children }) => <strong className={t.strong}>{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,

    h1: ({ children }) => <h3 className={t.heading1 || t.heading}>{children}</h3>,
    h2: ({ children }) => <h3 className={t.heading2 || t.heading}>{children}</h3>,
    h3: ({ children }) => <h4 className={t.heading3 || t.heading}>{children}</h4>,
    /*
     * ⚠ `h1` AND `h2` BECOME `h3`/`h4` ELEMENTS, not just smaller text. A chat
     * panel sits inside a page that already has its own `h1`, and emitting a
     * second one from an assistant's answer is a real accessibility defect -
     * a screen reader announces the page as having two titles.
     */
    h4: ({ children }) => <h4 className={t.heading4 || t.heading}>{children}</h4>,

    code: ({ className, children }) => {
      // react-markdown marks a fenced block with a `language-*` class; inline
      // code has none. Styling both the same makes a code block unreadable.
      const isBlock = typeof className === 'string' && className.includes('language-');

      return isBlock ? (
        <code className={t.codeBlock}>{children}</code>
      ) : (
        <code className={t.code}>{children}</code>
      );
    },

    pre: ({ children }) => <pre className={t.codeBlock}>{children}</pre>,

    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className={t.table}>{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className={t.tableHeadRow}>{children}</thead>,
    tbody: ({ children }) => <tbody className={t.tableBody}>{children}</tbody>,
    th: ({ children }) => <th className={`${t.tableCell} ${t.tableHead}`}>{children}</th>,
    td: ({ children }) => <td className={t.tableCell}>{children}</td>,

    blockquote: ({ children }) => <blockquote className={t.blockquote}>{children}</blockquote>,
    hr: () => <hr className={t.hr} />,

    /*
     * ⚠ IMAGES ARE DROPPED, DELIBERATELY. An assistant's answer can contain a
     * Markdown image whose URL came from the open web, and rendering it makes
     * the viewer's browser fetch a third-party resource - leaking that they read
     * this answer, to whoever wrote the page it was found on. The alt text is
     * kept so nothing silently disappears.
     */
    img: ({ alt }) => <span className="italic opacity-70">{alt ? `[image: ${alt}]` : '[image]'}</span>,
  };
}
