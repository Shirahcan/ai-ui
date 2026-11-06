import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { looksLikeMarkdown, markdownToEditorHtml } from './markdownToEditorHtml';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    markdownPaste: {
      /** Insert Markdown at the selection as the editor's own formatting (bold, lists, links). */
      insertMarkdown: (markdown: string) => ReturnType;
    };
  }
}

/**
 * The shared editor's Markdown door (1.35.0, owner 2026-11-06): add it to ANY TipTap editor and
 *
 *  - `editor.commands.insertMarkdown(md)` puts an assistant's answer in as real formatting, and
 *  - pasting Markdown copied as plain text (from Porter, a chat app, a README) lands formatted.
 *
 * ⚠ IT IS ONE DOOR SO EVERY EDITOR AGREES. Each product's message box, notes and email editor would
 * otherwise grow its own converter, and they would differ on which marks survive (the first one, in
 * Portify's message box, dropped bold and lists entirely).
 *
 * ⚠ PASTE CONVERTS ONLY PLAIN TEXT THAT LOOKS LIKE MARKDOWN, and never when the clipboard also has
 * HTML: copying from a web page or a document already carries its formatting, and that paste is left
 * to the editor as it always was.
 *
 * ⚠ ONE INSERT, NOT A CHAIN. Building paragraphs with insert / splitBlock / setHardBreak in one chain
 * worked from the position before the last step, and ProseMirror threw "Position 301 out of range".
 *
 * Lives behind `@shirahcan/ai-ui/editor`, so a product with no TipTap never loads it.
 */
export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addCommands() {
    return {
      insertMarkdown:
        (markdown: string) =>
        ({ commands }) => {
          const html = markdownToEditorHtml(markdown);

          return html === '' ? false : commands.insertContent(html);
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data || data.types.includes('text/html') || data.files.length > 0) return false;
            const text = data.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) return false;

            return editor.commands.insertMarkdown(text);
          },
        },
      }),
    ];
  },
});
