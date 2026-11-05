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

/**
 * Words that carry a sentence on. When the previous piece was cut mid-sentence and the next one
 * begins with one of these, its capital is the transcriber's guess at a new sentence, not the
 * speaker's: "...account history. And the manager said" reads "...account history and the manager
 * said". Only these: a capital on a name, a programme ("IRCC") or "I" is never touched.
 */
const CONTINUATIONS = new Set([
  'and', 'but', 'or', 'so', 'because', 'then', 'that', 'which', 'who', 'when', 'while', 'if', 'as',
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'it', 'its',
  'this', 'these', 'those', 'we', 'you', 'they', 'he', 'she', 'my', 'your', 'our', 'their', 'is',
  'are', 'was', 'were', 'will', 'would', 'should', 'can', 'could', 'please',
  'et', 'mais', 'ou', 'donc', 'car', 'que', 'qui', 'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du',
]);

/**
 * Tidy one piece for where it lands in the sentence.
 * - `afterMidSentence`: the piece before was cut while the person kept talking, so a capital on a
 *   carrying-on word here is the transcriber's guess at a new sentence: lowercase it.
 * - `midSentence`: THIS piece was cut while they kept talking, so its closing full stop is the
 *   transcriber's, not the speaker's: drop it (a question or exclamation mark is kept). A missing
 *   full stop is the cheaper mistake: adding one back could split "Adebanjo. Deborah".
 */
export function stitchPiece(text: string, afterMidSentence: boolean, midSentence: boolean): string {
  let out = text;

  if (afterMidSentence) {
    const first = /^\p{Lu}\p{Ll}*/u.exec(out);
    if (first && CONTINUATIONS.has(first[0].toLowerCase())) out = first[0].toLowerCase() + out.slice(first[0].length);
  }
  if (midSentence) out = out.replace(/\.\s*$/u, '');

  return out;
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
