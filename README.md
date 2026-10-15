# @shirahcan/ai-ui

The front-end half of [`ai-service`](https://github.com/Shirahcan/ai-service): a streamed
assistant turn, a stop that really stops, the panel they happen in, the confirm card, and
the one Markdown map an assistant's words are rendered with.

Pairs with [`shirahcan/ai-client`](https://github.com/Shirahcan/ai-waterfall) on the server
side, exactly as `@shirahcan/calendar-ui` pairs with `shirahcan/calendar-client`.

## ⚠ It never calls ai-service, and must never learn how to

The service holds **every AI provider key in the estate** and is loopback-only by design, so
a browser cannot reach it and must not be able to. Everything here talks to the **product's
own routes**, which proxy the turn server-side with the product's trust key.

That is also why the event names are configurable: your route is yours, and this package
adapts to it rather than demanding you rewrite a working backend.

## ⚠ It owns the mechanics, not the chrome

**1.0 owned no layout at all**, on the reasoning that a shared panel would be forked within
a month. That was the wrong call, and the evidence is why: the package had no consumers while
four hand-built panels already existed, and only one of them streamed. The fork had already
happened. The narrowing's only real effect was that the lessons in here reached nobody.

**1.1 ships `<AssistantPanel>`**, and answers the fork risk by design instead of by omission.
It owns only the parts every panel got wrong and nothing a product wants to change:

| the package owns | the product owns |
|---|---|
| the turn lifecycle and `discard` handling | the bubble, the avatar, the timestamp |
| scroll that follows the answer without fighting the reader | the empty state, the header, the footer |
| the streaming cursor, Stop, the error row + retry | the palette, the fonts, the icons |
| the `aria-live` region and the keyboard contract | the composer, if the default is not enough |

Chrome arrives through **slots**; colour arrives through **CSS custom properties**. There is
nothing left in the component worth copying out.

## Install

```bash
npm i @shirahcan/ai-ui
```

Peer dependencies: `react`, `react-dom`, `react-markdown`, `remark-gfm`.

## A streamed turn

```tsx
const turn = useAssistantStream({
  url: '/api/proxy/assistant/chat/stream',
  cancelUrl: '/api/proxy/assistant/chat/stream/{id}',
  headers: () => ({ Authorization: `Bearer ${getAuthToken()}` }),
  // Only if your route speaks a different dialect:
  events: { discard: 'reset', done: 'message' },
});

await turn.ask({ message, conversation_id: id, page_context: ctx });

<AssistantMessage text={turn.state.text} streaming={turn.isBusy} theme={yourTheme} />
{turn.isBusy && <button onClick={turn.stop}>Stop</button>}
```

⚠ **`discard` is the event every consumer forgets, and it corrupts the answer.** The
waterfall can fail a rung **after** emitting tokens: the provider dies mid-sentence and the
next rung starts the answer over. A consumer that keeps appending shows two different
half-answers glued together, with nothing saying anything went wrong - worse than an error,
because it reads as finished prose. The hook resets the text, and that is the whole reason
it is worth sharing.

⚠ **Stop is three things in this order:** local state, so the UI stops and the user is
believed; abort the fetch, so this tab stops receiving; `DELETE` the stream, so the
**provider** stops generating and billing. Doing the DELETE first makes the user wait on a
round trip to be told their own click worked; skipping it stops the spinner and not the
money. The DELETE is `keepalive`, so a closing tab still stops the spend.

⚠ **A stream that ends without a terminal event DID NOT FINISH**, and `ask()` returns
`false`. Reporting it as success is how a user acts on half an answer: the paragraph simply
stops, and a truncated sentence reads as a complete one often enough to matter.

⚠ **The terminal event's text wins over the accumulated tokens.** A provider can emit
tokens that differ from its final answer (a repaired field, a trimmed ending), and showing
the accumulation leaves the user reading something the model did not finally say.

## The panel

One required prop, and you have a working streamed conversation:

```tsx
import { AssistantPanel } from '@shirahcan/ai-ui';

<AssistantPanel url="/api/proxy/assistant/chat/stream" />;
```

Add the cancel route and Stop stops the **provider**, not just the spinner:

```tsx
<AssistantPanel
  url="/api/proxy/assistant/chat/stream"
  cancelUrl="/api/proxy/assistant/chat/stream/{id}"
  headers={() => ({ Authorization: `Bearer ${token}` })}
  body={{ conversation_id: conversationId }}
/>;
```

### Controlled, for a panel that already has a history

A product that owns its own turn (a query-library mutation, its own persistence, its own
cache) keeps all of it and still gets the mechanics:

```tsx
<AssistantPanel
  messages={messages}
  busy={mutation.isPending}
  stage={stage}
  error={error}
  onSend={send}
  onStop={stopTurn}
  onRetry={retry}
  renderBubble={(message) => <MyBubble message={message} />}
/>;
```

In controlled mode `url` is unused. In uncontrolled mode it is required, and a panel given
neither renders a visible **"not configured"** notice rather than a Send button that quietly
swallows every question.

### Theming

Set the custom properties on any ancestor. Nothing to configure in JavaScript, and nothing
in this package imports a palette:

```css
.my-panel {
  --ai-surface: #ffffff;
  --ai-fg: #0f172a;
  --ai-muted: #64748b;
  --ai-border: #e2e8f0;
  --ai-accent: #4361ee;
  --ai-accent-fg: #ffffff;
  --ai-danger: #b91c1c;
  --ai-radius: 1.25rem;
  --ai-bubble-user-bg: #4361ee;
  --ai-bubble-user-fg: #ffffff;
  --ai-bubble-assistant-bg: transparent;
  --ai-bubble-assistant-fg: #0f172a;
}
```

The defaults are deliberately plain, so an unfinished adoption **looks** unfinished rather
than looking like a different product.

### ⚠ The scroll rule, because every panel gets it wrong

`scrollTo({ top: scrollHeight })` on every message change is the obvious implementation and
it is unusable: during a streamed answer it fires on a token cadence, so a reader who scrolls
up to re-read something is dragged back to the bottom several times a second. `useAutoscroll`
follows the stream **only while the reader is already at the bottom**, reports `isPinned` when
they are not, and offers them the way back instead of taking the decision from them.

## Stop, without giving up your turn loop

`useTurnCancel` is the cancel discipline on its own, for a panel that keeps its own turn:

```tsx
const cancel = useTurnCancel({
  cancelUrl: '/api/proxy/assistant/chat/stream/{id}',
  headers: () => ({ Authorization: `Bearer ${token}` }),
  onStop: () => { setStreamingText(''); setStage(null); },
});

const controller = cancel.startTurn();      // 1. a fresh signal for this turn
// on the stream's open frame:
cancel.trackTurn(data.stream_id);           // 2. the id the server cancels by
// in a finally:
cancel.endTurn();

{cancel.isStoppable ? <StopButton onStop={cancel.stop} /> : null}
```

Stop is **three things in this order**, and the order is the point:

1. **local state**, on the same tick as the click, or the user presses it twice;
2. **abort the fetch**, so this tab stops receiving;
3. **DELETE the stream**, so the provider stops generating - and stops billing.

Skip (3) and the spinner stops while the money does not.

## The Markdown map

```tsx
<ReactMarkdown remarkPlugins={assistantRemarkPlugins} components={assistantMarkdownComponents(theme)}>
  {text}
</ReactMarkdown>
```

⚠ **This exists because Portify had the same map in two places and both were wrong in the
same ways** - which is how a duplicated fact fails: you fix it in one copy. The two had
already drifted (one set `cursor-pointer` on links, the other did not), and both were
missing the two things reported from production:

- **Tables rendered as raw pipes.** `react-markdown` does not parse GFM tables without
  `remark-gfm`, so a knowledge entry containing a table arrived as
  `| | what it is for | |---|---| | **Portify** | ...`. The easiest plugin to leave out,
  because everything else works without it.
- **Headings rendered as body text.** They *were* real `<h2>` elements, but Tailwind's
  preflight resets heading size and weight to the surrounding text, so a section title
  looked like a stray sentence.

Three things the map does that are security rather than style:

- `h1`/`h2` become `h3`/`h4` **elements**. A chat panel sits inside a page that already has
  a title; a second `h1` from an answer is a real accessibility defect.
- External links get `noopener noreferrer`. An answer can contain a link found on the open
  web (a research citation), and `target=_blank` without it hands that page a handle on
  this one.
- **Images are dropped**, keeping the alt text. A Markdown image whose URL came from the
  open web makes the viewer's browser fetch a third-party resource, leaking that they read
  this answer to whoever wrote the page it was found on.

The classes are **yours**. A package shipping Portify's `#4361EE` would be unusable by
MployNow without a fork.

## The confirm card

```tsx
<ConfirmCard
  title="Send 3 service options to Maria Garcia"
  confirmLabel="Send 3 options to Maria Garcia"
  outcome={card.outcome}
  onConfirm={run}
  onCancel={dismiss}
>
  Spousal Sponsorship · $4,200 · due on acceptance
</ConfirmCard>
```

⚠ **The label is the real verb, never "Confirm".** "Send 3 options to Maria Garcia" is a
sentence somebody can refuse; "Confirm" is a button people press to make a dialog go away.
The prop is required for that reason.

⚠ **A cancelled card must not later read as done.** Portify shipped exactly that: cancel
and success were stored as one "completed" mark, so a re-mounted card said "Done." about an
action that never ran. `outcome` has three states and they are not interchangeable.

## Testing

`readSseFrames` and `parseFrame` are exported because the three lessons in them are the
ones that work perfectly on localhost and corrupt in production, and they deserve direct
tests in a consuming product too:

1. `decode(value, { stream: true })` - a multi-byte character routinely straddles a chunk
   boundary, and per-chunk decoding turns every accented name into a replacement character.
2. Frames split across chunks - `data: {"te` and `xt":"hi"}` arrive separately under any
   real network.
3. `\r\n` happens - some proxies rewrite line endings, and a `\n\n`-only parser then waits
   for a boundary that has already gone past.

```bash
npm test
```
