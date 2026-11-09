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
  | 'recap';

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
];

/** Commands a host may not offer (no level, no brainstorm): left out of the picker and the help. */
export const OPTIONAL_COMMANDS: TerminalCommandName[] = ['level', 'effort', 'brainstorm', 'recap'];

export interface TerminalKey {
  keys: string;
  does: string;
}

export const TERMINAL_KEYS: TerminalKey[] = [
  { keys: 'Ctrl+`', does: 'Open or close the console' },
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
