/**
 * `@shirahcan/ai-ui` - the front-end half of ai-service.
 *
 * ⚠ IT NEVER CALLS ai-service. The service holds every AI provider key in the
 * estate and is loopback-only by design, so a browser cannot reach it and must
 * not be able to. Everything here talks to the PRODUCT's own routes, which
 * proxy the turn server-side with the product's trust key.
 *
 * ⚠ IT OWNS THE PANEL'S MECHANICS AND NONE OF ITS CHROME. 1.0 owned no
 * layout at all, on the reasoning that a shared panel "would be forked within a
 * month". The measurement that reversed it (P13): the package had ZERO
 * consumers while FOUR hand-built panels already existed, and only one of them
 * streamed - so the fork had already happened, and the narrowing's only real
 * effect was that the SSE lessons in here reached nobody. 1.1 therefore ships
 * `<AssistantPanel>`: the turn lifecycle, the scroll that does not fight the
 * reader, Stop, the error row and the `aria-live` region. The bubble, the
 * composer, the empty state, the header and the footer are SLOTS, and the
 * palette is CSS custom properties - so there is nothing left worth forking.
 *
 * Pairs with `shirahcan/ai-client` on the server side, exactly as
 * `@shirahcan/calendar-ui` pairs with `shirahcan/calendar-client`.
 */

export { useAssistantStream } from './useAssistantStream';
export type { AssistantStreamOptions } from './useAssistantStream';

export { useTurnCancel } from './useTurnCancel';
export type { TurnCancel, TurnCancelOptions } from './useTurnCancel';

export { useAutoscroll } from './useAutoscroll';
export type { Autoscroll, AutoscrollOptions } from './useAutoscroll';

export { readSseFrames, parseFrame, isAbortError } from './sse';

export { assistantMarkdownComponents, assistantRemarkPlugins } from './markdown';
export type { MarkdownTheme } from './markdown';

export { AssistantMessage } from './components/AssistantMessage';
export type { AssistantMessageProps } from './components/AssistantMessage';

export { ConfirmCard } from './components/ConfirmCard';
export type { ConfirmCardProps } from './components/ConfirmCard';

export { GroundedAnswer } from './components/GroundedAnswer';
export type { GroundedAnswerProps, GroundedAnswerSection } from './components/GroundedAnswer';

export { AssistantFeedback, ASSISTANT_FEEDBACK_REASONS } from './components/AssistantFeedback';
export type {
  AssistantFeedbackProps,
  AssistantFeedbackPayload,
  AssistantFeedbackReason,
} from './components/AssistantFeedback';

export { OnDemandAsk } from './components/OnDemandAsk';
export type { OnDemandAskProps } from './components/OnDemandAsk';

export { AssistantHistory } from './components/AssistantHistory';
export type {
  AssistantHistoryProps,
  AssistantThread,
} from './components/AssistantHistory';

export { AssistantIntro } from './components/AssistantIntro';
export type { AssistantIntroProps } from './components/AssistantIntro';

export { AssistantPanel } from './components/AssistantPanel';
export type { AssistantPanelProps, ComposerSlotProps } from './components/AssistantPanel';

export { MessageBubble } from './components/MessageBubble';
export type { MessageBubbleProps } from './components/MessageBubble';

export { Composer } from './components/Composer';
export type { ComposerProps } from './components/Composer';

export { StreamingCursor, STREAMING_CURSOR_CLASS } from './components/StreamingCursor';
export type { StreamingCursorProps } from './components/StreamingCursor';

export { StopButton } from './components/StopButton';
export type { StopButtonProps } from './components/StopButton';

export { aiVar, AI_UI_CSS_VARIABLES } from './theme';
export type { AiUiCssVariable } from './theme';

export { DEFAULT_EVENT_NAMES } from './types';
export type {
  AssistantTurnState,
  PanelMessage,
  StreamEventNames,
  StreamFrame,
  ToolTrailEntry,
  TurnPhase,
} from './types';
