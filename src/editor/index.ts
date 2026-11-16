// The shared editor's Markdown door (1.35.0). TipTap is an optional peer: only products that import
// this entry need it.
export { MarkdownPaste } from './MarkdownPaste';
export { markdownToEditorHtml, looksLikeMarkdown } from './markdownToEditorHtml';

// The shared rich text editor (1.62.0, moved from Portify, owner 2026-11-16). TipTap's React binding and the
// extensions it registers are optional peers, like the core: only products that import this entry need them.
export { RichTextEditor, ToolbarButton, ToolbarSeparator, editorContentClass } from './RichTextEditor';
export type { RichTextEditorProps, RichTextControl, RichTextVariant } from './RichTextEditor';
export { EditorIcon } from './editorIcons';
export type { EditorIconName } from './editorIcons';
export { basicEditorExtensions, emailEditorExtensions, canonicaliseEmailBody, HighlightMark, NoteCard, FinePrint } from './extensions';
export type { EditorExtensionOptions } from './extensions';
