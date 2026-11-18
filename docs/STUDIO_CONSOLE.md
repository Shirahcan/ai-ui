# The Studio console (`@shirahcan/ai-ui/terminal`, 1.63.0)

One Porter console for ANY Studio: a blog post, a newsletter, an email template, a share card, a page. A product writes
a **subject** (about 40 lines) and gets the whole console: sessions in ai-service, asks run on a worker, "@" aiming,
hand-offs from the canvas, a document prepared once, proposals decided on the server, rewind, guides.

Lifted from Portify's `DesignerConsole` (shared Studio plan P4a, 2026-11-18). ai-ui never imports PML: a design is any
`{ children? }` tree, and everything PML-specific (part marks, details fields) lives in the product's subject.

## Backend

- `shirahcan/ai-client` >= **1.74.0**: `TerminalRoutes::mount('<prefix>', <Subject>::class, '<name>')` inside the
  product's authenticated group and gate. 1.74.0 adds `PUT .../sessions/{session}/turns/{turn}/card-state`.
- The product's run routes: start a Build on a worker (`startRun`), read it (`getRun`, with the elements and steps
  already seen), stop it (`stopRun`). The worker records the ask's answer in the session; the browser never writes it.

## The subject

```ts
import { StudioConsole, createConsoleApi, type StudioConsoleSubject } from '@shirahcan/ai-ui/terminal';

const subject: StudioConsoleSubject<'growth_post', PmlNode, PostRunData> = {
  api,                    // createConsoleApi(...) plus startRun / getRun / stopRun
  kind: 'growth_post',
  id: post.uuid,
  noun: 'post',           // the assistant's word for it
  nodes,                  // the design on screen
  flush,                  // send a waiting save; false = do not start
  land: (run, path) => { /* put run.data in the tree: at path, or the whole document */ },
  restore: (design) => replaceNodes(design),
  labelFor: (path) => blockName(nodes, path),
  canAim: (node) => profile.canAim(node),     // ONE authority: the profile's rule
  applyProposal: async (run) => { /* write the drafted details */ },
  openDetails: () => openPanel('details'),
};

<StudioConsole subject={subject} options={{ assistantName: 'Porter', openKey: 'porter-console:post:open', onError }} handOffRef={askRef} />
```

`handOffRef.current({ text, path, label })` is the canvas's way in: a block's AI action or a pinned comment's "send to
the assistant". Or call `useStudioConsole(subject, options)` and render `<ConsoleHost {...studio.host} />` yourself.

## The four mount rules (each a defect already paid for)

1. **Every programmatic ask goes through the composer's own ask.** A hand-off or a prepare calls the terminal's
   `onAsk`, never a session made by hand and the runner called directly. Portify's TEST box showed "0 turns" and the
   welcome screen for a whole run that way.
2. **A proposal's decided state is the server's.** Apply / Dismiss writes the answer's turn state through
   `api.decide()` with the chat card's own keys (`card: done | cancelled`), and the console draws `card_state` read
   back from the session. Per-tab state offered Apply again after a reload.
3. **"Changed N elements" is the outcome the server recorded** from the nodes the run returned. The console never
   recounts the design: a recount from re-parsed source read "Changed 19 elements" for one heading.
4. **What can be aimed is the subject's `canAim`**, read from ONE authority (the profile), never a client copy of a
   server rule. A hand-off aimed at a block it refuses opens the details instead; "@" does not offer it.

`tests/studioConsole.test.tsx` holds one test per rule.

## Also exported

- `useWorkerConsoleRunner(api, id, extras, onLanded, { onError, onRefused })`: the Build-only runner on a worker. A
  refused ask (409 / 422 with the server's sentence) is said in the console through `onRefused`.
- `waitForWorkerRun`, `refusalOf`, `nodeAtPath`, `replaceAtPath`, `runOfTurn`, `proposalStateOf`, `mimeOfName`.
