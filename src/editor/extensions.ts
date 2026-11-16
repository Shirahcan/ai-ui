import { Mark, Node, mergeAttributes, type Extensions } from '@tiptap/core';
// ⚠ NAMED imports only: the CJS bundle (a product's jest) interops in Node mode, where a default import is the
// whole module, so `StarterKit.configure` was undefined there (1.62.2). tests/editorImports.test.ts holds the line.
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { MarkdownPaste } from './MarkdownPaste';

/**
 * The shared editor's extension sets (1.62.0, moved from Portify's `components/ui`, owner 2026-11-16: "Move it to
 * ai-ui"). ONE declaration each, used by `RichTextEditor` and by every product's round-trip test, because TipTap
 * deletes any node or mark it has no extension for, silently, on the first save: the only proof a stored document
 * survives an edit is to run THE REAL list over it, and a copy declared inside a test drifts.
 *
 * A product adds its own format's nodes on top (Portify: the agreement clause panel) rather than forking a list.
 */
export interface EditorExtensionOptions {
  /** The placeholder extension, configured by the editor (it knows the words). */
  placeholder?: Extensions[number];
  /**
   * Whether a plain-text Markdown paste becomes real formatting. A function, read at paste time, so a product's
   * gate can switch it without remounting. Off unless the product says so.
   */
  convertPaste?: () => boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlight: {
      /** Toggle the highlight mark over the current selection. */
      toggleHighlight: () => ReturnType;
    };
    noteCard: {
      /** Wrap the selection in a note card, or lift it out of one. */
      toggleNoteCard: () => ReturnType;
    };
    finePrint: {
      /** Mark the selection as fine print, or clear it. */
      toggleFinePrint: () => ReturnType;
    };
  }
}

/**
 * A highlighted passage, stored as `<mark>`. Also accepts a pasted span with a real background colour (Word and
 * Google Docs paste highlights that way); a transparent or absent background is not a highlight, and treating it as
 * one would mark up half a pasted document.
 *
 * ⚠ REGISTERED IN EVERY SET, even where the toolbar button is hidden: an existing highlight must survive a round
 * trip on every editor, not only the ones that can create it (a `<mark>` on a real agreement clause was being
 * stripped on every edit before this was registered).
 */
export const HighlightMark = Mark.create({
  name: 'highlight',
  // Survives typing at the edge of a highlighted run, the way bold does.
  inclusive: true,

  parseHTML() {
    return [
      { tag: 'mark' },
      {
        tag: 'span[style*="background-color"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const background = (element as HTMLElement).style?.backgroundColor ?? '';

          return background === '' || background === 'transparent' ? false : {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleHighlight() };
  },
});

/**
 * The email format's note card, stored as `<aside>`. A NODE rather than a mark or a token because it has to CONTAIN
 * things: templates inject prepared HTML through a variable, and a construct whose content gets escaped would
 * deliver that markup to the reader as visible text. ⚠ Renders no `class` and no `style`: the product's email
 * compiler styles it at send time and its lint rejects both.
 */
export const NoteCard = Node.create({
  name: 'noteCard',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'aside' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleNoteCard:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});

/**
 * Fine print, stored as `<small>`. A MARK, not a block: it is used for a whole trailing paragraph and for the first
 * sentence of one, and a block in the second position would nest a `<p>` inside a `<p>`, which breaks the paragraph
 * in every mail client.
 */
export const FinePrint = Mark.create({
  name: 'finePrint',

  parseHTML() {
    return [{ tag: 'small' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['small', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleFinePrint:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});

const LISTS = { keepMarks: true, keepAttributes: false } as const;

/**
 * Agreements, libraries, messages, posts: anything rendered on a page.
 *
 * ⚠ Link and Underline are configured THROUGH StarterKit: v3 bundles both, and adding them again registered each
 * twice ("Duplicate extension names"), so the bundled Link's defaults (open on click) ran alongside this one.
 */
export function basicEditorExtensions({ placeholder, convertPaste = () => false }: EditorExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: LISTS,
      orderedList: LISTS,
      link: { openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800' } },
    }),
    ...(placeholder ? [placeholder] : []),
    // Markdown in as real formatting. Adds no node or mark, so stored documents serialise as before.
    MarkdownPaste.configure({ convertPaste }),
    HighlightMark,
    Image.configure({
      HTMLAttributes: {
        class: 'max-w-full h-auto rounded-lg',
        // Inline style too: email clients ignore CSS classes, so images stay responsive in a 600px email.
        style: 'max-width:100%;height:auto;',
      },
    }),
  ];
}

/**
 * An email body: semantic HTML with NO `class` and NO `style`, styled when the mail is sent.
 *
 * ⚠ `target` and `rel` are nulled deliberately: the link extension defaults to `target="_blank" rel="noopener
 * noreferrer nofollow"`, an email lint rejects both, and leaving them on failed every link an author touched.
 * ⚠ Column resizing writes a `colwidth` that means nothing in an email and churns the stored body on every drag.
 */
export function emailEditorExtensions({ placeholder, convertPaste = () => false }: EditorExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: LISTS,
      orderedList: LISTS,
      link: { openOnClick: false, HTMLAttributes: { target: null, rel: null } },
    }),
    ...(placeholder ? [placeholder] : []),
    MarkdownPaste.configure({ convertPaste }),
    Image.configure({}),
    TableKit.configure({ table: { resizable: false } }),
    NoteCard,
    FinePrint,
  ];
}

/**
 * Strip the editor's own table chrome before an email body is stored: TipTap's table always renders a `<colgroup>`
 * and a `min-width` style, which exist for dragging columns and fail an email lint. Presentation, not content:
 * nothing an author typed is removed. Apply it wherever `editor.getHTML()` becomes stored email, nowhere else.
 */
export function canonicaliseEmailBody(html: string): string {
  return html.replace(/<colgroup>[\s\S]*?<\/colgroup>/gi, '').replace(/\s*style="min-width:[^"]*"/gi, '');
}
