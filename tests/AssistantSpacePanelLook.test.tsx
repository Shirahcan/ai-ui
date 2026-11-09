import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_CARD_SHADOW,
  AssistantSpacePanel,
  createAssistantSpaceClient,
  defaultToPanelMessage,
  themeToVars,
  type AssistantSpaceFetcher,
  type AssistantTheme,
} from '../src';

/**
 * Owner 2026-11-09: "Mploynow's chat panel still differs from Portify's!!" and "Mploynow shouldn't use
 * Portify's glassmorphic aesthetics - the shared panel should support proper customizations".
 *
 * ⚠ WHAT THIS GUARDS. Two products with different colours and different named looks get the SAME panel:
 * every element, every class, the answer card, the scrollbar and the shadow. Only the theme's values and
 * the named `panel` look may differ. The 1.43 parity test compared the menu only, so the look drifted
 * (Mira's answers drew as loose text on a flat card; Porter's sat in cards on glass) while it stayed green.
 */
const PORTER_LIKE: AssistantTheme = {
  panel: 'glass',
  surface: 'rgba(255,255,255,0.8)',
  fg: '#334155',
  muted: '#94a3b8',
  border: '#e2e8f0',
  accent: '#4361EE',
  accentFg: '#ffffff',
  accentSoft: '#eef2ff',
  assistantBubbleBg: 'rgba(255,255,255,0.8)',
  assistantBubbleBorder: '#ffffff',
  card: 'fixed z-50 bottom-24 right-5',
};

const MIRA_LIKE: AssistantTheme = {
  panel: 'solid',
  surface: '#ffffff',
  fg: '#152237',
  muted: '#6b7280',
  border: '#e5e7eb',
  accent: '#6f6df3',
  accentFg: '#ffffff',
  accentSoft: '#eeedfd',
  card: 'fixed z-50 bottom-24 right-5',
};

function fetcher() {
  return vi.fn<AssistantSpaceFetcher>(async (method, path) => {
    const key = `${method} ${path}`;
    if (key === 'GET active-conversation') return { data: { conversation_id: 'c-1' } };
    if (key === 'GET conversations/c-1')
      return {
        data: {
          conversation: { id: 'c-1', title: 'Hiring' },
          messages: [
            { id: 'u-1', ai_turn_id: 't-1', role: 'user', content: 'What is waiting for me?' },
            { id: 'a-1', ai_turn_id: 't-2', role: 'assistant', content: 'Two things:\n\n- **3** candidates to review\n- **1** offer to send\n\nSee [the queue](/queue).' },
          ],
        },
      };
    if (key === 'GET input-history') return { data: { history: [] } };
    if (key === 'GET memory') return { data: { memory: [] } };
    return { data: {} };
  });
}

async function mount(theme: AssistantTheme, name: string) {
  const client = createAssistantSpaceClient({ base: '/api/assistant/space', fetcher: fetcher() });
  const view = render(
    <AssistantSpacePanel
      client={client}
      accountKey="u-1"
      assistantName={name}
      theme={theme}
      adapter={{ toPanelMessage: defaultToPanelMessage, intro: { greeting: 'Hi', body: 'Ask me.' }, onError: vi.fn() }}
      onClose={() => {}}
    />,
  );
  await screen.findByText('candidates to review');

  return view;
}

/** Every element's tag and classes, in order: the panel's whole shape, with the product's name taken out. */
function shape(root: HTMLElement, name: string): string[] {
  return [...root.querySelectorAll('*')].map((el) => `${el.tagName} ${(el.getAttribute('class') ?? '').trim()}`.replaceAll(name, 'NAME'));
}

describe('the shared panel looks the same in every product', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
  });

  it('draws the same elements and classes for a glass and a solid product', async () => {
    const porter = await mount(PORTER_LIKE, 'Porter');
    const porterShape = shape(porter.container, 'Porter');
    porter.unmount();

    const mira = await mount(MIRA_LIKE, 'Mira');
    const miraShape = shape(mira.container, 'Mira');

    expect(miraShape).toEqual(porterShape);
  });

  it('draws the card look itself: the same shadow for both, the blur only on glass', async () => {
    const porter = await mount(PORTER_LIKE, 'Porter');
    const porterCard = porter.getByRole('dialog');
    expect(porterCard.style.boxShadow).toBe(ASSISTANT_CARD_SHADOW);
    expect(porterCard.style.backdropFilter).toBe('blur(24px)');
    expect(porterCard.style.border).toContain('--ai-card-border');
    porter.unmount();

    const mira = await mount(MIRA_LIKE, 'Mira');
    const miraCard = mira.getByRole('dialog');
    expect(miraCard.style.boxShadow).toBe(ASSISTANT_CARD_SHADOW);
    expect(miraCard.style.backdropFilter || '').toBe('');
  });

  it('gives the message list its own thin scrollbar', async () => {
    const view = await mount(MIRA_LIKE, 'Mira');
    const log = view.getByRole('log');

    expect(log.style.scrollbarWidth).toBe('thin');
  });

  it('shows the answer card on a solid card, where the surface colour would hide it', () => {
    const vars = themeToVars(MIRA_LIKE);

    expect(vars['--ai-bubble-assistant-bg']).not.toBe(MIRA_LIKE.surface);
    expect(vars['--ai-bubble-assistant-bg']).toContain('color-mix');
    expect(vars['--ai-bubble-assistant-border']).toBe(MIRA_LIKE.border);
    expect(vars['--ai-card-border']).toBe(MIRA_LIKE.border);
  });

  it("keeps Porter's glass values exactly as they were", () => {
    const vars = themeToVars(PORTER_LIKE);

    expect(vars['--ai-bubble-assistant-bg']).toBe('rgba(255,255,255,0.8)');
    expect(vars['--ai-bubble-assistant-border']).toBe('#ffffff');
    expect(vars['--ai-card-border']).toBe('#ffffff');
  });
});
