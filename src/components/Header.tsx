'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import AppHeader from '@/components/ui/AppHeader';
import type { ToolName } from '@/components/ui/ToolShape';
import { useTheme } from '@/hooks/useTheme';

interface HeaderProps {
    title?: string;
    /** Shows the tool's shape and color before the title. */
    tool?: ToolName;
    showBack?: boolean;
    actions?: ReactNode;
}

/** The signed-in app header, wired to auth, routing and the theme. */
export default function Header({ title, tool, showBack = true, actions }: HeaderProps) {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const router = useRouter();

    if (!user) return null;

    const isGuest = user.role === 'GUEST';

    return (
        <AppHeader
            logoSrc="/images/lib-logo.png"
            logoHref="/dashboard"
            onLogoClick={(e) => {
                e.preventDefault();
                router.push('/dashboard');
            }}
            onBack={showBack ? () => router.push('/dashboard') : undefined}
            title={title}
            tool={tool}
            credits={user.credits}
            renewAt={user.creditsRenewAt}
            onAccount={isGuest ? undefined : () => router.push('/account')}
            onToggleTheme={toggleTheme}
            theme={theme}
            onSignOut={logout}
            signOutLabel={isGuest ? 'End session' : 'Sign out'}
        >
            {actions}
        </AppHeader>
    );
}
