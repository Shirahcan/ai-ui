/**
 * `@shirahcan/ai-ui/terminal`: a console for a studio surface (1.44.0, Porter console 2026-11-08). A
 * Claude Code style session on one subject: asks, steps, thinking, replies and outcomes line by line,
 * `/clear` `/compact` `/context` `/resume` `/rewind` `/brief`, history and keys. 1.45.0 (2026-11-09): folded,
 * never cut (thinking folds once anything follows; Rewind folds the turn); `/level` and `/effort`, the
 * level that answered on each outcome and "Try again at Pro"; the assistant's questions with choices,
 * its findings, a brainstorm mode; a recap after a break.
 *
 * Backend: `TerminalRoutes::mount('...')` + a `TerminalSubject` binding from `shirahcan/ai-client` >= 1.58,
 * inside the product's authenticated group and its own gate. The ask itself is the product's route.
 */
export { AssistantTerminal } from './AssistantTerminal';
export type { AssistantTerminalProps } from './AssistantTerminal';
export { TerminalInput } from './TerminalInput';
export type { TerminalComposerOptions, TerminalInputProps, TerminalMentions } from './TerminalInput';
export { TerminalLines, foldText } from './TerminalLines';
export { TerminalQuestionBlock, TerminalQuestionLog } from './TerminalQuestion';
export type { TerminalQuestionDraft } from './TerminalQuestion';
export { TerminalRewind, rewindableAsks } from './TerminalRewind';
export type { TerminalRewindChoice } from './TerminalRewind';
export { TerminalStatus } from './TerminalStatus';
export { OPTIONAL_COMMANDS, SAVED_COMMAND_NAME, TERMINAL_COMMANDS, TERMINAL_KEYS, expandSavedCommand, parseCommand, savedNameProblem, savedSlashCommands, slashCommands, specializationFromArg, templateFromArg } from './commands';
export type { TerminalCommand, TerminalCommandName, TerminalKey, TerminalSavedCommand } from './commands';
export { CostView, SavedCommandsView, SpecializationView, specializationWhy, TemplateView, templateWhy } from './TerminalExtrasViews';
export { DEFAULT_TERMINAL_THEME, TERMINAL_THEMES, contrastRatio, terminalTheme, themeToTerminalVars } from './terminalThemes';
export type { TerminalTheme } from './terminalThemes';
export { LEVEL_LABELS, levelPhrase, nextEffort, nextLevel, outcomeLine, recapLines, toLines, toMarkdown } from './transcript';
export type { ToLinesOptions } from './transcript';
export { TERMINAL_DEFAULT_WIDTH, TERMINAL_MIN_WIDTH, clampTerminalWidth, useTerminalDock } from './useTerminalDock';
export { TERMINAL_ZOOMS, stepZoom } from './zoom';
export { useTerminalKeys } from './useTerminalKeys';
export type * from './types';
