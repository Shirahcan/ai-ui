import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantBox, AssistantNotice } from '../src/components/AssistantBox';
import { greetingFor, identityFromRecord, resetAssistantIdentityCache, useAssistantIdentity } from '../src/surface/useAssistantIdentity';

const THEME = { surface: '#ffffff', fg: '#0f172a', muted: '#64748b', border: '#e2e8f0', accent: '#4361EE', accentFg: '#ffffff' };

/**
 * 1.42.0: the base assistant on any screen. One shell, the chat panel's own composer, the product's
 * theme as values; the assistant's name is data from its record, never a different UI.
 */
describe('AssistantBox', () => {
  it('renders the slots around the shared composer, themed by values, with the product marker', () => {
    const onSend = vi.fn();
    const { container } = render(
      <AssistantBox
        theme={THEME}
        marker="creator-porter"
        label="Porter, the site builder"
        working={<p>Building the page</p>}
        notices={<AssistantNotice onDismiss={() => undefined}>Done: the hero is on the page.</AssistantNotice>}
        composer={{ value: 'make it blue', onChange: () => undefined, onSend, sendLabel: 'Build' }}
      />,
    );

    const box = container.querySelector('[data-assistant-box]') as HTMLElement;
    expect(box.hasAttribute('data-creator-porter')).toBe(true);
    expect(box.style.getPropertyValue('--ai-accent')).toBe('#4361EE');
    expect(screen.getByRole('region', { name: 'Porter, the site builder' })).toBeTruthy();
    expect(screen.getByText('Building the page')).toBeTruthy();
    expect(screen.getByText('Done: the hero is on the page.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(onSend).toHaveBeenCalled();
  });

  it('a notice dismisses itself through its own button and warns in its own tone', () => {
    const dismiss = vi.fn();
    render(<AssistantNotice tone="warning" onDismiss={dismiss}>Check the contrast.</AssistantNotice>);
    expect(screen.getByRole('status').getAttribute('data-assistant-notice')).toBe('warning');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(dismiss).toHaveBeenCalledOnce();
  });
});

describe('useAssistantIdentity', () => {
  beforeEach(() => resetAssistantIdentityCache());

  const fallback = { key: 'porter', name: 'Porter', productName: 'Portify' };

  it('reads the record and keeps the fallback for what it lacks', () => {
    const id = identityFromRecord({ assistant: { key: 'porter', display_name: 'Porter', product_name: 'Portify',
      look: { avatar_url: '/p.png', greetings: { client: 'Hi, I can help with your case.', '*': 'Hi.' } },
      surfaces: [{ key: 'site_builder', mode: 'grounded', label: 'the site builder' }, { key: 9 }] } }, fallback);

    expect(id.fromService).toBe(true);
    expect(id.avatarUrl).toBe('/p.png');
    expect(id.surfaces).toEqual([{ key: 'site_builder', mode: 'grounded', label: 'the site builder', description: '' }]);
    expect(greetingFor(id, 'client')).toBe('Hi, I can help with your case.');
    expect(greetingFor(id, 'employer')).toBe('Hi.');
    expect(identityFromRecord('nonsense', fallback).name).toBe('Porter');
  });

  it('shows the fallback at once, the record after, and reads it once for every surface on the page', async () => {
    const load = vi.fn(() => Promise.resolve({ assistant: { key: 'porter', display_name: 'Porter (beta)', product_name: 'Portify' } }));
    function Name() {
      const id = useAssistantIdentity(load, fallback);

      return <span>{id.name}</span>;
    }
    render(<><Name /><Name /></>);
    expect(screen.getAllByText('Porter')).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByText('Porter (beta)')).toHaveLength(2));
    expect(load).toHaveBeenCalledOnce();
  });

  it('a failed read keeps the fallback and never throws at the screen', async () => {
    const load = vi.fn(() => Promise.reject(new Error('down')));
    function Name() {
      return <span>{useAssistantIdentity(load, fallback).name}</span>;
    }
    await act(async () => {
      render(<Name />);
    });
    expect(screen.getByText('Porter')).toBeTruthy();
  });
});
