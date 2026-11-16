import { useEffect, useRef, useState, type ChangeEvent, type MutableRefObject, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import type { Extensions } from '@tiptap/core';
import { basicEditorExtensions, emailEditorExtensions } from './extensions';
import { EditorIcon, type EditorIconName } from './editorIcons';

/**
 * The estate's rich text editor (1.62.0, moved from Portify, owner 2026-11-16): one toolbar, one link prompt, one
 * image upload, for every product and every shared screen that writes formatted text (Growth's newsletter, Portify's
 * agreements and emails).
 *
 * ⚠ NEVER WRAP THIS IN A `<label>`. A click inside a label is forwarded to the first labelable control in it, which
 * here is the Bold button: clicking a line of text to place the caret silently bolded it and scrolled the reader to
 * the bottom (Portify, 2026-07-13). Use a `<div>` with a sibling caption instead.
 *
 * ⚠ THE LINK PROMPT IS A BAR INSIDE THE EDITOR, NOT A MODAL. This editor lives inside products' own modals, and a
 * modal library traps focus and pointer events inside its own content: a second modal portalled to the body from a
 * shared package could not be typed into there. A bar inside the editor is inside whatever modal holds it.
 *
 * Colours are custom properties with fallbacks that draw the editor as Portify always did (grey frame, white page),
 * so a product that sets nothing gets a finished editor, not an unbranded one.
 */
export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Classes on the frame (e.g. `rounded-2xl`). */
  className?: string;
  /**
   * Extra classes for the editable area (e.g. a taller `min-h-[480px]`). A size or padding given here REPLACES the
   * default one rather than competing with it (there is no class merger in this package).
   */
  contentClassName?: string;
  /** When given, an "Insert image" button uploads the chosen file through it and inserts the returned URL. */
  onImageUpload?: (file: File) => Promise<string>;
  /** Receives the TipTap editor, for programmatic control (inserting a drafted body, for example). */
  editorRef?: MutableRefObject<Editor | null>;
  /**
   * Which toolbar groups to offer. Pass a narrower set when the value is stored somewhere with a narrower allow-list:
   * offering a control the server then strips is silent data loss (a heading applied, saved, and gone, no error).
   */
  controls?: RichTextControl[];
  /** `email`: semantic HTML with no class or style, plus the table, note card and fine print an email can hold. */
  variant?: RichTextVariant;
  /**
   * The product's own extension set, replacing the variant's (a product that adds its own format's nodes, such as
   * Portify's agreement clause panel, passes the shared set plus those). Called with the configured placeholder.
   */
  extensions?: (placeholder: Extensions[number]) => Extensions;
  /** Whether a plain-text Markdown paste becomes real formatting (the product's gate); off by default. */
  convertPaste?: () => boolean;
  /** The product's own buttons in the formatting group, after Underline (Portify: the clause panel). */
  formatTools?: (editor: Editor, disabled: boolean) => ReactNode;
}

/** Toolbar groups. `table` and `blocks` only apply to the email variant; `highlight` is opt-in. */
export type RichTextControl = 'format' | 'headings' | 'lists' | 'link' | 'image' | 'table' | 'blocks' | 'highlight' | 'callout';

export type RichTextVariant = 'default' | 'email';

const ALL_CONTROLS: RichTextControl[] = ['format', 'headings', 'lists', 'link', 'image'];

const CONTENT_DEFAULT = 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2';

/** The default content classes, minus any whose kind (`min-h-`, `px-`, `py-`, `p-`, `max-w-`) the caller set. */
export function editorContentClass(extra?: string): string {
  const given = (extra ?? '').split(/\s+/).filter(Boolean);
  const kind = (token: string) => /^(min-h|max-w|px|py|p)-/.exec(token.replace(/^[a-z0-9]+:/, ''))?.[1] ?? null;
  const overridden = new Set(given.map(kind).filter((k): k is string => k !== null));
  const kept = CONTENT_DEFAULT.split(' ').filter((token) => {
    const k = kind(token);
    // `p-` from the caller replaces both axes.
    return k === null || !(overridden.has(k) || (overridden.has('p') && (k === 'px' || k === 'py')));
  });

  return [...kept, ...given].join(' ');
}

/** One toolbar button, exported so a product's `formatTools` look exactly like the rest. */
export function ToolbarButton({
  icon, label, title, active = false, danger = false, disabled, onClick, busy = false,
}: { icon: EditorIconName; label: string; title?: string; active?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={title ?? label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-[var(--ai-editor-hover,#f1f5f9)] focus-visible:ring-2 focus-visible:ring-[var(--ai-accent,#94a3b8)] disabled:pointer-events-none disabled:opacity-50 ${
        active ? 'bg-[var(--ai-editor-active,#e5e7eb)]' : ''
      } ${danger ? 'text-[var(--ai-danger,#dc2626)]' : 'text-[var(--ai-editor-fg,#0f172a)]'}`}
    >
      <EditorIcon name={busy ? 'Loader' : icon} className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
    </button>
  );
}

export function ToolbarSeparator() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-[var(--ai-editor-border,#d1d5db)]" />;
}

export function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Start typing...',
  disabled = false,
  className = '',
  contentClassName,
  onImageUpload,
  editorRef,
  controls = ALL_CONTROLS,
  variant = 'default',
  extensions,
  convertPaste,
  formatTools,
}: RichTextEditorProps) {
  const shows = (control: RichTextControl) => controls.includes(control);
  const isEmail = variant === 'email';
  const editor = useEditor({
    immediatelyRender: false,
    extensions: (() => {
      const ph = Placeholder.configure({ placeholder, showOnlyWhenEditable: true });
      if (extensions) return extensions(ph);

      return isEmail ? emailEditorExtensions({ placeholder: ph, convertPaste }) : basicEditorExtensions({ placeholder: ph, convertPaste });
    })(),
    editorProps: { attributes: { class: editorContentClass(contentClassName) } },
    content: value,
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
    editable: !disabled,
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Syncing a value the PARENT set must not echo back through onChange: TipTap v3 emits an update for setContent
  // and setEditable by default, which told every form "the user edited this" the moment it mounted.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled, false);
  }, [disabled, editor]);

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  if (!editor) return null;

  const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => fn(editor.chain().focus()).run();

  const openLink = () => {
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (url === '') run((c) => c.extendMarkRange('link').unsetLink());
    else run((c) => c.extendMarkRange('link').setLink({ href: url }));
  };

  const pickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file || !onImageUpload) return;
    setUploading(true);
    try {
      const url = await onImageUpload(file);
      if (url) run((c) => c.setImage({ src: url }));
    } catch {
      // The product's uploader reports its own failure (Portify: through Porter); nothing is inserted.
    } finally {
      setUploading(false);
    }
  };

  const b = (icon: EditorIconName, label: string, active: boolean, onClick: () => void, title?: string) => (
    <ToolbarButton icon={icon} label={label} title={title} active={active} disabled={disabled} onClick={onClick} />
  );

  return (
    <div className={`rounded-lg border border-[var(--ai-editor-border,#d1d5db)] bg-[var(--ai-editor-bg,#ffffff)] ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--ai-editor-border,#e5e7eb)] bg-[var(--ai-editor-toolbar,#f9fafb)] px-2 py-1">
        {shows('format') ? (
          <>
            {b('Bold', 'Bold', editor.isActive('bold'), () => run((c) => c.toggleBold()))}
            {b('Italic', 'Italic', editor.isActive('italic'), () => run((c) => c.toggleItalic()))}
            {b('Underline', 'Underline', editor.isActive('underline'), () => run((c) => c.toggleUnderline()))}
            {formatTools ? formatTools(editor, disabled) : null}
            {shows('highlight') ? b('Highlighter', 'Highlight', editor.isActive('highlight'), () => run((c) => c.toggleHighlight()), 'Highlight (Ctrl+Shift+H)') : null}
            <ToolbarSeparator />
          </>
        ) : null}

        {shows('headings') ? (
          <>
            {b('Heading1', 'Heading 1', editor.isActive('heading', { level: 1 }), () => run((c) => c.toggleHeading({ level: 1 })))}
            {b('Heading2', 'Heading 2', editor.isActive('heading', { level: 2 }), () => run((c) => c.toggleHeading({ level: 2 })))}
            {b('Heading3', 'Heading 3', editor.isActive('heading', { level: 3 }), () => run((c) => c.toggleHeading({ level: 3 })))}
            <ToolbarSeparator />
          </>
        ) : null}

        {shows('lists') ? (
          <>
            {b('List', 'Bullet list', editor.isActive('bulletList'), () => run((c) => c.toggleBulletList()))}
            {b('ListOrdered', 'Numbered list', editor.isActive('orderedList'), () => run((c) => c.toggleOrderedList()))}
            <ToolbarSeparator />
          </>
        ) : null}

        {shows('link') ? (
          <>
            {b('Link', 'Insert link', editor.isActive('link') || linkOpen, openLink)}
            {editor.isActive('link') ? b('Unlink', 'Remove link', false, () => run((c) => c.unsetLink())) : null}
          </>
        ) : null}

        {shows('table') && isEmail ? (
          <>
            <ToolbarSeparator />
            {b('Table', 'Insert detail table', false, () => run((c) => c.insertTable({ rows: 2, cols: 2, withHeaderRow: false })), 'Insert a detail table')}
            {editor.isActive('table') ? (
              <>
                {b('Rows', 'Add row', false, () => run((c) => c.addRowAfter()), 'Add a row below')}
                {b('Columns', 'Add column', false, () => run((c) => c.addColumnAfter()), 'Add a column to the right')}
                {b('Trash', 'Delete row', false, () => run((c) => c.deleteRow()), 'Delete this row')}
                <ToolbarButton icon="Table" label="Delete table" title="Delete the whole table" danger disabled={disabled} onClick={() => run((c) => c.deleteTable())} />
              </>
            ) : null}
          </>
        ) : null}

        {shows('blocks') && isEmail ? (
          <>
            <ToolbarSeparator />
            {b('Note', 'Note card', editor.isActive('noteCard'), () => run((c) => c.toggleNoteCard()), 'Wrap in a note card')}
            {b('FinePrint', 'Fine print', editor.isActive('finePrint'), () => run((c) => c.toggleFinePrint()), 'Mark as fine print')}
          </>
        ) : null}

        {shows('image') && onImageUpload ? (
          <>
            <ToolbarSeparator />
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={pickImage} />
            <ToolbarButton icon="Image" label="Insert image" disabled={disabled || uploading} busy={uploading} onClick={() => fileInput.current?.click()} />
          </>
        ) : null}
      </div>

      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ai-editor-border,#e5e7eb)] bg-[var(--ai-editor-toolbar,#f9fafb)] px-3 py-2">
          <label htmlFor="ai-editor-link-url" className="text-xs font-medium text-[var(--ai-editor-muted,#475569)]">
            Link to
          </label>
          <input
            id="ai-editor-link-url"
            type="url"
            autoFocus
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation(); // close the bar, not the modal around the editor
                setLinkOpen(false);
              }
            }}
            className="min-w-[12rem] flex-1 rounded-lg border border-[var(--ai-editor-border,#d1d5db)] bg-white px-3 py-2 text-sm text-[var(--ai-editor-fg,#0f172a)] outline-none focus:border-[var(--ai-accent,#64748b)]"
          />
          <span className="w-full text-xs text-[var(--ai-editor-muted,#64748b)] sm:order-last">Leave it empty and save to remove the link.</span>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            className="whitespace-nowrap rounded-full border border-[var(--ai-editor-border,#d1d5db)] bg-white px-4 py-2 text-sm font-medium text-[var(--ai-editor-fg,#0f172a)] outline-none hover:bg-[var(--ai-editor-hover,#f1f5f9)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyLink}
            className="whitespace-nowrap rounded-full bg-[var(--ai-accent,#334155)] px-4 py-2 text-sm font-medium text-[var(--ai-accent-fg,#ffffff)] outline-none hover:opacity-90"
          >
            Save link
          </button>
        </div>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
}
