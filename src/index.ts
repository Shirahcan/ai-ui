/**
 * `@shirahcan/ai-ui` - the front-end half of ai-service.
 *
 * ⚠ IT NEVER CALLS ai-service. The service holds every AI provider key in the
 * estate and is loopback-only by design, so a browser cannot reach it and must
 * not be able to. Everything here talks to the PRODUCT's own routes, which
 * proxy the turn server-side with the product's trust key.
 *
 * ⚠ AND IT OWNS NO LAYOUT. The bubble, the avatar, the panel chrome and the
 * palette stay in the product: that is where assistant surfaces differ most,
 * and a shared component that owned them would be forked within a month. What
 * is shared is what was genuinely broken for want of one owner - the SSE frame
 * reader, the discard handling, a stop that really stops, and the Markdown map.
 *
 * Pairs with `shirahcan/ai-client` on the server side, exactly as
 * `@shirahcan/calendar-ui` pairs with `shirahcan/calendar-client`.
 */

export { useAssistantStream } from './useAssistantStream';
export type { AssistantStreamOptions } from './useAssistantStream';

export { readSseFrames, parseFrame, isAbortError } from './sse';

export { assistantMarkdownComponents, assistantRemarkPlugins } from './markdown';
export type { MarkdownTheme } from './markdown';

export { AssistantMessage } from './components/AssistantMessage';
export type { AssistantMessageProps } from './components/AssistantMessage';

export { ConfirmCard } from './components/ConfirmCard';
export type { ConfirmCardProps } from './components/ConfirmCard';

export { DEFAULT_EVENT_NAMES } from './types';
export type {
  AssistantTurnState,
  StreamEventNames,
  StreamFrame,
  ToolTrailEntry,
  TurnPhase,
} from './types';
