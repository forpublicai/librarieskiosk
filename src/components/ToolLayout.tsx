'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';

interface ToolLayoutProps {
    /** History panel content. */
    sidebar: ReactNode;
    /** Name of the history panel, also the drawer button label below 900px. */
    sidebarLabel: string;
    /** data-tour id for the coachmark tour. */
    sidebarTour?: string;
    /** The thread column. */
    children: ReactNode;
    /** Panels after the thread, e.g. the code output or the learning guide. */
    after?: ReactNode;
}

/**
 * The frame every tool screen shares: a history sidebar on surface-sunken and
 * the thread column. Below 900px the sidebar becomes a drawer.
 */
export default function ToolLayout({ sidebar, sidebarLabel, sidebarTour, children, after }: ToolLayoutProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const asideRef = useRef<HTMLElement>(null);
    const openButtonRef = useRef<HTMLDivElement>(null);

    // While the drawer is open: focus starts on its close button, Tab stays
    // inside it, Escape closes it, and focus goes back to the drawer button.
    useEffect(() => {
        if (!drawerOpen) return;
        const aside = asideRef.current;
        aside?.querySelector<HTMLButtonElement>('.lk-tool__drawer-head button')?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setDrawerOpen(false);
                return;
            }
            if (e.key !== 'Tab' || !aside) return;
            const focusable = Array.from(aside.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || !aside.contains(active))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (active === last || !aside.contains(active))) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        const openButton = openButtonRef.current;
        return () => {
            document.removeEventListener('keydown', onKey);
            openButton?.querySelector<HTMLButtonElement>('button')?.focus();
        };
    }, [drawerOpen]);

    // Growing past the drawer width closes the drawer, so the thread never stays inert.
    useEffect(() => {
        const wide = window.matchMedia('(min-width: 901px)');
        const onChange = () => { if (wide.matches) setDrawerOpen(false); };
        wide.addEventListener('change', onChange);
        return () => wide.removeEventListener('change', onChange);
    }, []);

    // Picking a history row or a new-chat button closes the drawer.
    const closeOnPick = (e: MouseEvent<HTMLElement>) => {
        if ((e.target as HTMLElement).closest('.lk-convo, [data-drawer-close]')) setDrawerOpen(false);
    };

    return (
        <div className="lk-tool">
            {drawerOpen && <div className="lk-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
            <aside
                ref={asideRef}
                className={drawerOpen ? 'lk-tool__sidebar lk-tool__sidebar--open' : 'lk-tool__sidebar'}
                aria-label={sidebarLabel}
                data-tour={sidebarTour}
                onClick={closeOnPick}
            >
                <div className="lk-tool__drawer-head">
                    <span className="lk-heading">{sidebarLabel}</span>
                    <IconButton icon="close" label={`Close ${sidebarLabel.toLowerCase()}`} onClick={() => setDrawerOpen(false)} />
                </div>
                {sidebar}
            </aside>
            <main className="lk-tool__main" inert={drawerOpen || undefined}>
                <div className="lk-tool__bar" ref={openButtonRef}>
                    <Button variant="secondary" icon="menu" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
                        {sidebarLabel}
                    </Button>
                </div>
                {children}
            </main>
            {after}
        </div>
    );
}
