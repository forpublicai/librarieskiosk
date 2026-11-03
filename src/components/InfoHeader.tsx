'use client';

import AppHeader from '@/components/ui/AppHeader';
import { ButtonLink } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';

const PAGES = [
    { href: '/getting-started', label: 'Get started' },
    { href: '/resources', label: 'Resources' },
    { href: '/faqs', label: 'FAQs' },
];

/** Header for the help pages: logo, the three help links, back to sign in, theme. */
export default function InfoHeader({ current }: { current: string }) {
    const { theme, toggleTheme } = useTheme();

    return (
        <AppHeader
            logoLight="/images/lib-logo.png"
            logoDark="/images/logo.svg"
            logoHref="/"
            onToggleTheme={toggleTheme}
            theme={theme}
        >
            <nav aria-label="Help pages" className="lk-info-nav">
                {PAGES.map((p) => (
                    <ButtonLink
                        key={p.href}
                        variant="quiet"
                        href={p.href}
                        aria-current={p.href === current ? 'page' : undefined}
                        className={p.href === current ? 'lk-btn--current' : undefined}
                    >
                        {p.label}
                    </ButtonLink>
                ))}
            </nav>
            <ButtonLink variant="secondary" icon="back" href="/">Back to sign in</ButtonLink>
        </AppHeader>
    );
}
