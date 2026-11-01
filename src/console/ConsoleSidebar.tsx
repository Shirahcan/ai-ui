import { useEffect, useState, type ReactNode } from 'react';

/**
 * The section list beside a Site management page: one area's sections (and their sub-sections)
 * in a sidebar that collapses to a slim rail, so the content keeps its standard width.
 *
 * ⚠ SHARED BECAUSE THE ASSEMBLY IS WHAT DRIFTS. Every product's Site management lays out the
 * same way: the product's shell holds the AREAS as its main tabs, this holds the SECTIONS.
 * Links are drawn by the product (`renderLink`) so each uses its own router.
 *
 * Collapsed, it is a rail of the sections' icons, each named by its tooltip. Collapsed state is remembered per browser (`storageKey`), and on a narrow screen the list
 * starts closed above the content instead of beside it.
 */
export interface ConsoleSidebarItem {
  key: string;
  label: string;
  href: string;
  /** Drawn beside the label, and alone in the collapsed rail (owner, 2026-11-01). */
  icon?: ReactNode;
}

export interface ConsoleSidebarGroup {
  /** A heading over this group's items, e.g. "AI vault". Omit for the first, unnamed group. */
  label?: string;
  items: ConsoleSidebarItem[];
}

export interface ConsoleSidebarProps {
  /** Names the navigation for screen readers, e.g. "AI sections". */
  ariaLabel: string;
  groups: ConsoleSidebarGroup[];
  activeKey: string;
  renderLink: (
    item: ConsoleSidebarItem,
    props: { className: string; 'aria-current'?: 'page'; 'aria-label'?: string; title?: string; children: ReactNode },
  ) => ReactNode;
  storageKey?: string;
  children: ReactNode;
}

function readCollapsed(key: string | undefined): boolean {
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function ConsoleSidebar({ ariaLabel, groups, activeKey, renderLink, storageKey, children }: ConsoleSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [openOnPhone, setOpenOnPhone] = useState(false);

  // Read after mount: the server render has no storage, and reading it during render would
  // mismatch hydration.
  useEffect(() => {
    if (readCollapsed(storageKey)) setCollapsed(true);
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        if (storageKey) window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* storage blocked: the choice lasts for this page only */
      }
      return next;
    });
  };

  const active = groups.flatMap((g) => g.items).find((i) => i.key === activeKey);

  const list = (compact: boolean) => (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className={compact && gi > 0 ? 'border-t border-[var(--ai-border)] pt-2' : undefined}>
          {g.label && !compact ? <div className="mb-1 px-3 text-xs font-semibold text-[var(--ai-muted)]">{g.label}</div> : null}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const on = item.key === activeKey;
              return (
                <li key={item.key}>
                  {renderLink(item, {
                    className: `flex items-center rounded-lg text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] ${
                      compact ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 px-3 py-2'
                    } ${on ? 'bg-[var(--ai-accent-soft)] font-semibold text-[var(--ai-accent)]' : 'text-[var(--ai-fg)] hover:bg-[var(--ai-accent-soft)]'}`,
                    'aria-current': on ? 'page' : undefined,
                    // The rail shows the icon alone, so the name travels as the label and the tooltip.
                    'aria-label': compact ? item.label : undefined,
                    title: compact ? item.label : undefined,
                    children: (
                      <>
                        {item.icon ? (
                          <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center ${on ? '' : 'text-[var(--ai-muted)]'}`}>
                            {item.icon}
                          </span>
                        ) : compact ? (
                          <span aria-hidden className="text-xs font-semibold">{item.label.slice(0, 1)}</span>
                        ) : null}
                        {compact ? null : <span className="truncate">{item.label}</span>}
                      </>
                    ),
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      {/* Phone: one button above the content, closed by default. */}
      <nav aria-label={ariaLabel} className="md:hidden">
        <button
          type="button"
          aria-expanded={openOnPhone}
          onClick={() => setOpenOnPhone((o) => !o)}
          className="flex w-full items-center justify-between rounded-[var(--ai-radius)] border border-[var(--ai-border)] bg-[var(--ai-surface)] px-4 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)]"
        >
          <span>{active?.label ?? 'Sections'}</span>
          <span aria-hidden>{openOnPhone ? '▴' : '▾'}</span>
        </button>
        {openOnPhone ? <div className="mt-2 rounded-[var(--ai-radius)] border border-[var(--ai-border)] bg-[var(--ai-surface)] p-2">{list(false)}</div> : null}
      </nav>

      {/* Wider screens: beside the content, collapsible to a rail. */}
      <nav
        aria-label={ariaLabel}
        className={`hidden shrink-0 md:sticky md:top-4 md:block ${collapsed ? 'md:w-[3.75rem]' : 'md:w-56'}`}
      >
        <div className="rounded-[var(--ai-radius)] border border-[var(--ai-border)] bg-[var(--ai-surface)] p-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show sections' : 'Hide sections'}
            title={collapsed ? 'Show sections' : 'Hide sections'}
            className={`mb-1 flex w-full items-center rounded-lg px-2 py-1.5 text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] ${collapsed ? 'justify-center' : 'justify-end'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d={collapsed ? 'M13 10l2 2-2 2' : 'M16 10l-2 2 2 2'} />
            </svg>
          </button>
          {/* Collapsed: the same links as an icon rail, each named by its tooltip. */}
          {list(collapsed)}
        </div>
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
