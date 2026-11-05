/**
 * Turning a transcribed phrase into what lands in the box: spoken commands, spacing and capitals at
 * the join, and insertion at the caret.
 */

/**
 * Spoken commands, English and French (Canada). Multi-word ones are honoured at the END of a phrase
 * too ("thanks for calling new paragraph"); single words only when they are the whole phrase, so
 * dictating "the processing period" keeps the word.
 */
const COMMANDS: Array<{ words: string[]; text: string; whole?: boolean }> = [
  { words: ['new paragraph', 'nouveau paragraphe'], text: '\n\n' },
  { words: ['new line', 'next line', 'nouvelle ligne', 'à la ligne', 'a la ligne'], text: '\n' },
  { words: ['full stop', 'point final'], text: '.' },
  { words: ['question mark', "point d'interrogation", 'point d’interrogation'], text: '?' },
  { words: ['exclamation mark', "point d'exclamation", 'point d’exclamation'], text: '!' },
  { words: ['period', 'point'], text: '.', whole: true },
  { words: ['comma', 'virgule'], text: ',', whole: true },
];

const normalise = (s: string) => s.toLowerCase().replace(/[.,!?;:]+$/u, '').replace(/\s+/g, ' ').trim();

/** The phrase with a trailing or whole-phrase command replaced by the text it stands for. */
export function applyCommands(phrase: string): string {
  const said = phrase.trim();
  const plain = normalise(said);

  for (const command of COMMANDS) {
    for (const words of command.words) {
      if (plain === words) return command.text;
      if (command.whole) continue;
      if (plain.endsWith(' ' + words)) {
        // Cut the command (and its trailing punctuation) off the spoken text, keep the rest as said.
        const cut = said.toLowerCase().lastIndexOf(words.split(' ')[0] ?? words);
        const before = said.slice(0, cut).replace(/[\s,]+$/u, '');
        return before + command.text;
      }
    }
  }

  return said;
}

const startsWithPunctuation = (s: string) => /^[.,!?;:]/u.test(s);
const endsSentence = (s: string) => s.trim() === '' || /[.!?]\s*$/u.test(s) || /\n\s*$/u.test(s);

/** Join `insert` after `before`: one space between words, none before punctuation, a capital after a sentence. */
export function joinAt(before: string, insert: string): string {
  if (insert === '') return '';
  if (insert.startsWith('\n')) return insert;
  if (startsWithPunctuation(insert)) return insert;

  let text = insert;
  if (endsSentence(before)) text = text.charAt(0).toUpperCase() + text.slice(1);

  const needsSpace = before !== '' && !/\s$/u.test(before);
  return (needsSpace ? ' ' : '') + text;
}

export interface Insertion {
  value: string;
  caret: number;
}

/**
 * The box's new value and caret after inserting a phrase at the selection. A selection the person
 * made is replaced (that is what they chose); otherwise the words go in at the caret.
 */
export function insertPhrase(value: string, selectionStart: number, selectionEnd: number, phrase: string): Insertion {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  let before = value.slice(0, start);
  const after = value.slice(end);

  const text = applyCommands(phrase);
  if (text === '') return { value, caret: end };

  // Punctuation and line breaks attach to the word before them.
  if (startsWithPunctuation(text) || text.startsWith('\n')) before = before.replace(/[ \t]+$/u, '');

  const joined = joinAt(before, text);
  const spaceAfter = after !== '' && !/^[\s.,!?;:]/u.test(after) && !/\s$/u.test(joined) ? ' ' : '';
  const inserted = joined + spaceAfter;

  return { value: before + inserted + after, caret: before.length + joined.length };
}
