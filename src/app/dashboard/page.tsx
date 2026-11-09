'use client';

import { useEffect, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import FloatingThemeToggle from '@/components/FloatingThemeToggle';
import Header from '@/components/Header';
import Button, { ButtonLink } from '@/components/ui/Button';
import ModeCard from '@/components/ui/ModeCard';
import Notice from '@/components/ui/Notice';
import Spinner from '@/components/ui/Spinner';
import type { ToolName } from '@/components/ui/ToolShape';
import { formatModeCost } from '@/lib/creditCosts';

const modes: { tool: ToolName; title: string; description: string; href: string }[] = [
    { tool: 'chat', title: 'Chat', description: 'Ask a question, get help writing, or plan something.', href: '/chat' },
    { tool: 'image', title: 'Image', description: 'Describe a picture. The AI draws it.', href: '/image' },
    { tool: 'music', title: 'Music', description: 'Make a short song.', href: '/music' },
    { tool: 'video', title: 'Video', description: 'Turn an idea into a clip.', href: '/video' },
    { tool: 'code', title: 'Code', description: 'Write and fix code.', href: '/code' },
];

export default function DashboardPage() {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/');
        }
    }, [user, isLoading, router]);

    const go = (href: string) => (e: MouseEvent) => {
        e.preventDefault();
        router.push(href);
    };

    if (isLoading || !user) {
        return (
            <div className="lk-center">
                <Spinner label="Loading…" />
            </div>
        );
    }

    const isGuest = user.role === 'GUEST';

    // Pending approval screen (skip for guests)
    if (!isGuest && user.status === 'PENDING') {
        return (
            <div className="lk-center">
                <FloatingThemeToggle />
                <div className="lk-panel">
                    <h1 className="lk-title">Your account is waiting for approval</h1>
                    <p>
                        The <strong>{user.library}</strong> library administrator must approve your account first.
                        Please ask a librarian, or come back later.
                    </p>
                    <Button variant="primary" icon="signout" onClick={logout}>Sign out</Button>
                </div>
            </div>
        );
    }

    // Banned screen (skip for guests)
    if (!isGuest && user.status === 'BANNED') {
        return (
            <div className="lk-center">
                <FloatingThemeToggle />
                <div className="lk-panel">
                    <h1 className="lk-title">Your account is suspended</h1>
                    <p>Please talk to your library administrator to find out more.</p>
                    <Button variant="primary" icon="signout" onClick={logout}>Sign out</Button>
                </div>
            </div>
        );
    }

    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <Header showBack={false} />

            <main className="lk-home">
                <h1 className="lk-display">
                    {isGuest ? 'What would you like to do today?' : `Hi ${user.username}, what would you like to do today?`}
                </h1>

                <div className="lk-home__grid">
                    {modes.map((mode, i) => (
                        <div key={mode.tool} className={i === 0 ? 'lk-home__tile lk-home__tile--hero' : 'lk-home__tile'}>
                            <ModeCard
                                hero={i === 0}
                                tool={mode.tool}
                                title={mode.title}
                                description={mode.description}
                                cost={formatModeCost(mode.tool)}
                                href={mode.href}
                                onClick={go(mode.href)}
                            />
                        </div>
                    ))}
                </div>

                <div className="lk-home__section">
                    {isGuest ? (
                        <Notice
                            tone="info"
                            title="You are using a guest session"
                            action={<Button variant="secondary" icon="user" onClick={logout}>Sign in or sign up</Button>}
                        >
                            You can use every tool, but your work is not saved when you leave.
                            Sign in or create an account to keep what you make.
                        </Notice>
                    ) : (
                        <Notice
                            tone="info"
                            title="New here?"
                            action={<ButtonLink variant="secondary" icon="help" href="/getting-started">Get started</ButtonLink>}
                        >
                            A short guide shows how each tool works.
                        </Notice>
                    )}
                </div>

                {isAdmin && (
                    <section className="lk-home__section" aria-labelledby="library-tools">
                        <h2 id="library-tools" className="lk-heading">Library tools</h2>
                        <div className="lk-home__actions">
                            <ButtonLink variant="secondary" icon="user" href="/admin" onClick={go('/admin')}>
                                Admin dashboard
                            </ButtonLink>
                            {user.role === 'SUPER_ADMIN' && (
                                <ButtonLink variant="secondary" icon="credits" href="/admin/superadmin" onClick={go('/admin/superadmin')}>
                                    Super admin dashboard
                                </ButtonLink>
                            )}
                        </div>
                    </section>
                )}
            </main>

            <footer className="lk-home__footer">
                <span>&copy; 2026 Public AI Libraries Project</span>
                <nav aria-label="Help">
                    <ButtonLink variant="quiet" href="/getting-started">Get started</ButtonLink>
                    <ButtonLink variant="quiet" href="/resources">Resources</ButtonLink>
                    <ButtonLink variant="quiet" href="/faqs">FAQs</ButtonLink>
                </nav>
            </footer>
        </div>
    );
}
