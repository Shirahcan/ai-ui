import type { ComposerSlashCommand } from '../components/ComposerPicker';

/**
 * The console's commands and keys: ONE list each, read by the "/" picker, the parser and the help
 * view, so a command cannot exist in one and be missing from another.
 */
export type TerminalCommandName =
  | 'help'
  | 'clear'
  | 'compact'
  | 'context'
  | 'resume'
  | 'rewind'
  | 'brief'
  | 'plan'
  | 'undo'
  | 'export'
  | 'theme'
  | 'level'
  | 'effort'
  | 'brainstorm'
  | 'recap'
  | 'config'
  | 'cost'
  | 'compare'
  | 'save'
  | 'specialize'
  | 'template';

export interface TerminalCommand {
  name: TerminalCommandName;
  /** Shown after the name in help: `[focus]`. */
  args?: string;
  /** Its words are optional and it is mostly used bare (`/level`): picking it runs it (1.45.0). */
  bare?: boolean;
  /** `{assistant}` and `{subject}` are filled in for the product ("Porter", "page"). */
  description: string;
}

export const TERMINAL_COMMANDS: TerminalCommand[] = [
  { name: 'help', description: 'Commands and shortcuts' },
  { name: 'clear', description: 'Start a new session. The {subject} is untouched; this session stays for /resume' },
  { name: 'compact', args: '[focus]', description: 'Summarise the session so far, keeping the focus in full' },
  { name: 'context', description: "What fills {assistant}'s context, part by part" },
  { name: 'resume', description: 'Open an earlier session on this {subject}' },
  { name: 'rewind', description: 'Go back to before an earlier ask' },
  { name: 'brief', args: '[text]', description: 'Standing instructions for this {subject}, shared by everyone who edits it' },
  { name: 'plan', description: 'Switch between Build and Plan first' },
  { name: 'undo', description: "Put back {assistant}'s last change" },
  { name: 'export', description: 'Copy the transcript and download it as Markdown' },
  { name: 'theme', description: 'Pick a theme' },
  { name: 'level', args: '[normal|pro|expert]', bare: true, description: 'How capable a model {assistant} works on: Pro and Expert fall back when unavailable' },
  { name: 'effort', args: '[low|medium|high]', bare: true, description: 'How hard {assistant} thinks before it answers' },
  { name: 'brainstorm', description: 'Think it through with {assistant}: ideas, questions and a recommendation, nothing changed' },
  { name: 'recap', args: '[off|minutes]', bare: true, description: 'Where the session stands; or when to show it after a break' },
  { name: 'config', description: 'Settings: level, effort, recap, tab mark and theme' },
  { name: 'cost', description: 'What this session has cost so far, by level' },
  { name: 'compare', description: "Check {assistant}'s {subject} against the picture it was built from, difference by difference" },
  { name: 'save', args: '[name]', description: 'Save your last ask as your own command (/name runs it again)' },
  { name: 'specialize', args: '[name|none|auto]', bare: true, description: 'Which guide {assistant} follows on this {subject} (a blog post, a landing page...)' },
  { name: 'template', args: '[name|none|auto]', bare: true, description: 'Which format of its guide this {subject} is written in (a story, a how-to guide...)' },
];

/** Commands a host may not offer (no level, no brainstorm): left out of the picker and the help. */
export const OPTIONAL_COMMANDS: TerminalCommandName[] = ['level', 'effort', 'brainstorm', 'recap', 'cost', 'compare', 'save', 'specialize', 'template'];

/**
 * `/specialize <words>` as a choice (1.55.0): `none` follows no guide, `auto` (or `page`) leaves it to the
 * subject and the assistant (null), a guide's key or name chooses it; undefined when nothing matches.
 */
export function specializationFromArg(arg: string, options: readonly { key: string; name: string }[]): string | null | undefined {
  const words = arg.trim().toLowerCase();
  if (words === 'none' || words === 'off') return 'none';
  if (words === 'auto' || words === 'page' || words === 'default') return null;
  const match = options.find((o) => o.key === words || o.name.toLowerCase() === words);
  return match ? match.key : undefined;
}

/**
 * `/template <words>` as a choice (1.56.0): `none` writes in the guide's own sections, `auto` leaves it to the
 * assistant's pick (null), a template's key or name chooses it; undefined when nothing matches.
 */
export function templateFromArg(arg: string, options: readonly { key: string; name: string }[]): string | null | undefined {
  return specializationFromArg(arg, options);
}

/**
 * A person's own command (1.53.0, owner 2026-11-09 "saved asks"): `/seo-pass` sends its ask again, with
 * any words typed after the name added to it.
 */
export interface TerminalSavedCommand {
  name: string;
  ask: string;
  description?: string | null;
}

/** A saved command's name: lower case, digits and dashes, 2 to 24 long, never a built-in's. */
export const SAVED_COMMAND_NAME = /^[a-z0-9][a-z0-9-]{1,23}$/;

export function savedNameProblem(name: string, saved: readonly TerminalSavedCommand[], editing: string | null = null): string | null {
  if (!SAVED_COMMAND_NAME.test(name)) return 'Use 2 to 24 lower-case letters, digits or dashes, starting with a letter or digit.';
  if (TERMINAL_COMMANDS.some((c) => c.name === name)) return `/${name} is already a command.`;
  if (saved.some((c) => c.name === name && c.name !== editing)) return `You already have /${name}.`;

  return null;
}

/** The "/" picker's entries for the person's own commands: picking one fills the box, Enter sends it. */
export function savedSlashCommands(saved: readonly TerminalSavedCommand[]): ComposerSlashCommand[] {
  return saved.map((command) => ({
    key: `saved:${command.name}`,
    label: `/${command.name}`,
    detail: command.description?.trim() || (command.ask.length > 80 ? `${command.ask.slice(0, 79)}…` : command.ask),
    prompt: `/${command.name}`,
  }));
}

/**
 * A typed saved command as the ask it stands for (`/seo-pass on the blog` -> its ask plus "on the blog"),
 * or null. Built-in commands win, so a saved one can never shadow /clear.
 */
export function expandSavedCommand(text: string, saved: readonly TerminalSavedCommand[]): string | null {
  const match = /^\/([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());

  if (!match || parseCommand(text) !== null) return null;

  const command = saved.find((c) => c.name === match[1]);
  const extra = (match[2] ?? '').trim();

  return command ? (extra === '' ? command.ask : `${command.ask}\n\n${extra}`) : null;
}

export interface TerminalKey {
  keys: string;
  does: string;
}

export const TERMINAL_KEYS: TerminalKey[] = [
  { keys: 'Ctrl+~', does: 'Open or close the console' },
  { keys: 'Ctrl + / Ctrl -', does: 'Bigger or smaller text in the console' },
  { keys: 'Ctrl+0', does: 'Text back to its usual size' },
  { keys: 'Esc', does: 'Stop {assistant} while it works; close a view' },
  { keys: 'Esc Esc', does: 'Rewind (on an empty input); clear the input otherwise' },
  { keys: '↑ ↓', does: 'Earlier asks' },
  { keys: 'Ctrl+R', does: 'Search earlier asks' },
  { keys: 'Alt+M', does: 'Switch between Build, Plan first and Brainstorm' },
  { keys: 'Ctrl+O', does: 'Open everything folded, every step in detail' },
  { keys: 'Ctrl+L', does: 'Clear the screen (the session is kept)' },
  { keys: '?', does: 'These shortcuts (on an empty input)' },
  { keys: 'Shift+Enter', does: 'New line' },
  { keys: '/', does: 'Commands' },
  { keys: '@', does: 'Aim {assistant} at one element' },
];

export function fillWords(text: string, words: { assistant: string; subject: string }): string {
  return text.replaceAll('{assistant}', words.assistant).replaceAll('{subject}', words.subject);
}

/** The "/" picker's entries. Picking one fills the box; Enter runs it. */
export function slashCommands(words: { assistant: string; subject: string }, hidden: readonly TerminalCommandName[] = []): ComposerSlashCommand[] {
  return TERMINAL_COMMANDS.filter((command) => !hidden.includes(command.name)).map((command) => ({
    key: command.name,
    label: `/${command.name}${command.args ? ` ${command.args}` : ''}`,
    detail: fillWords(command.description, words),
    prompt: command.args && !command.bare ? `/${command.name} ` : `/${command.name}`,
  }));
}

/**
 * A typed command, or null when the text is an ask. Only a KNOWN command at the very start counts, so
 * an ask that happens to begin with a slash ("/pricing page needs a FAQ") still goes to the assistant.
 */
export function parseCommand(text: string): { name: TerminalCommandName; arg: string } | null {
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/.exec(text.trim());

  if (!match) return null;

  const command = TERMINAL_COMMANDS.find((c) => c.name === match[1]);

  return command ? { name: command.name, arg: (match[2] ?? '').trim() } : null;
}
