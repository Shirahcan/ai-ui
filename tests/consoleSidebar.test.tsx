import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AiConsoleProvider, ConsoleSidebar } from '../src/console';
import { Kebab } from '../src/console/primitives';

const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#4361EE', accentFg: '#fff' };
const quiet = () => Promise.resolve(new Response('{}', { status: 200 }));

describe('ConsoleSidebar', () => {
  it('collapses to an icon rail whose links keep their names', () => {
    render(
      <ConsoleSidebar
        ariaLabel="AI sections"
        groups={[{ items: [{ key: 'a', label: 'Overview', href: '/a', icon: <svg data-testid="icon" /> }] }]}
        activeKey="a"
        renderLink={(item, props) => (
          <a href={item.href} className={props.className} aria-label={props['aria-label']} title={props.title} aria-current={props['aria-current']}>
            {props.children}
          </a>
        )}
      >
        <p>content</p>
      </ConsoleSidebar>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide sections' }));
    const link = screen.getByRole('link', { name: 'Overview' });
    expect(link.getAttribute('title')).toBe('Overview');
    expect(link.textContent).toBe('');
    expect(screen.getByTestId('icon')).toBeTruthy();
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});

describe('console overlays', () => {
  it('draws a row menu on the body, outside any table scroller, with the theme carried along', () => {
    const { container } = render(
      <AiConsoleProvider baseUrl="/c" theme={theme} fetcher={quiet}>
        <div style={{ overflowX: 'auto' }}>
          <Kebab label="Row actions" items={[{ label: 'Copy', onSelect: () => {} }]} />
        </div>
      </AiConsoleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    expect(menu.closest('[data-ai-console-portal]')?.getAttribute('style')).toContain('--ai-accent');
  });
});
