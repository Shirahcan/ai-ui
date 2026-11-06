import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownPaste, looksLikeMarkdown, markdownToEditorHtml } from '../src/editor';

/**
 * The shared editor's Markdown door (owner 2026-11-06: "Formatting didn't fully carry over"; "add a
 * pasteMarkdown door on the shared editor to enable universal use").
 */
describe('markdownToEditorHtml', () => {
  it('carries bold, lists, links and paragraphs over', () => {
    expect(markdownToEditorHtml('On **Tue, Oct 6** she said:\n\n- "Results expire in March."\n- Book a retest\n\n1. One\n2. Two\n\nSee [the case](/consultant/cases/1).'))
      .toBe('<p>On <strong>Tue, Oct 6</strong> she said:</p>'
        + '<ul><li><p>&quot;Results expire in March.&quot;</p></li><li><p>Book a retest</p></li></ul>'
        + '<ol><li><p>One</p></li><li><p>Two</p></li></ol>'
        + '<p>See <a href="/consultant/cases/1">the case</a>.</p>');
  });

  it('never lets quoted text become markup, and keeps only safe link addresses', () => {
    const html = markdownToEditorHtml('The client wrote <img src=x onerror=alert(1)> and [click](javascript:alert(1)) and [x](//evil.example)');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('//evil');
  });

  it('knows Markdown from ordinary prose', () => {
    expect(looksLikeMarkdown('- one\n- two')).toBe(true);
    expect(looksLikeMarkdown('Please **sign** today')).toBe(true);
    expect(looksLikeMarkdown('Hi Maria, see you on Friday.')).toBe(false);
  });
});

describe('MarkdownPaste extension', () => {
  let editor: Editor | null = null;
  afterEach(() => editor?.destroy());

  it('insertMarkdown puts the answer in as the editor\'s own formatting', () => {
    editor = new Editor({ extensions: [StarterKit, MarkdownPaste], content: '' });

    expect(editor.commands.insertMarkdown('Hello **Maria**\n\n- passport\n- bank letter')).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain('<strong>Maria</strong>');
    expect(html).toContain('<ul><li><p>passport</p></li><li><p>bank letter</p></li></ul>');
  });

  it('an empty answer inserts nothing', () => {
    editor = new Editor({ extensions: [StarterKit, MarkdownPaste], content: '<p>kept</p>' });

    expect(editor.commands.insertMarkdown('   ')).toBe(false);
    expect(editor.getHTML()).toBe('<p>kept</p>');
  });
});
