'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

const modes = [
    {
        key: 'chat',
        label: 'Public AI Chat',
        description: 'Have a conversation with AI. Ask questions, get explanations, brainstorm ideas.',
        href: '/chat',
        span: 'span 4',
    },
    {
        key: 'code',
        label: 'Code',
        description: 'Code, collaborate, and deploy projects in an instant online IDE.',
        href: '/code',
        span: 'span 4',
    },
    {
        key: 'music',
        label: 'Music',
        description: 'Create music and audio content with AI-powered tools.',
        href: '/music',
        span: 'span 4',
    },
    {
        key: 'image',
        label: 'Images',
        description: 'Generate stunning images with advanced AI models.',
        href: '/image',
        span: 'span 6',
    },
    {
        key: 'video',
        label: 'Videos',
        description: 'Create and edit video content with AI.',
        href: '/video',
        span: 'span 6',
    },
];

export default function DashboardPage() {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/');
        }
    }, [user, isLoading, router]);

    if (isLoading || !user) {
        return (
            <div className="login-container">
                <div className="gen-spinner" />
            </div>
        );
    }

    const isGuest = user.role === 'GUEST';

    // Pending approval screen (skip for guests)
    if (!isGuest && user.status === 'PENDING') {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: 'center' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Waiting for Approval</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                        Your account is waiting for approval from the <strong>{user.library}</strong> library administrator.
                    </p>
                    <button className="btn btn-primary" onClick={logout}>Sign Out</button>
                </div>
            </div>
        );
    }

    // Banned screen (skip for guests)
    if (!isGuest && user.status === 'BANNED') {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: 'center' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Account Suspended</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                        Your account has been suspended. Please contact your library administrator.
                    </p>
                    <button className="btn btn-primary" onClick={logout}>Sign Out</button>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <header className="page-header">
                <div className="page-header-left">
                    <img src="/images/logo.svg" alt="Public AI" className="header-logo" />
                </div>
                <div className="page-header-right">
                    <span className="credit-badge">{user.credits} Credits</span>
                    {isGuest && <span className="credit-badge" style={{ background: 'rgba(255,77,0,0.1)', color: 'var(--accent-orange)' }}>Guest</span>}
                    {!isGuest && (
                        <button className="back-btn" onClick={() => router.push('/account')}>
                            My Account
                        </button>
                    )}
                    <button className="back-btn" onClick={logout}>{isGuest ? 'Exit' : 'Sign Out'}</button>
                </div>
            </header>

            <main className="dashboard">
                <div className="dashboard-header">
                    <h1 className="dashboard-title">Explore Services</h1>
                    <div style={{ color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {isGuest ? 'Guest Session' : `Welcome, ${user.username}`}
                    </div>
                </div>

                {isGuest && (
                    <div style={{
                        marginBottom: '24px',
                        padding: '16px 20px',
                        backgroundColor: 'rgba(255, 165, 0, 0.08)',
                        border: '1px solid rgba(255, 165, 0, 0.2)',
                        borderRadius: '8px',
                        color: 'var(--text-secondary)',
                        fontSize: '0.95rem',
                        lineHeight: '1.5',
                    }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Guest Session</strong> — You have full access to all services, but your work won't be saved after you exit. <a href="/" style={{ color: 'var(--accent-orange)', fontWeight: '500', textDecoration: 'none' }}>Sign in or create an account</a> to save your creations and build your portfolio.
                    </div>
                )}

                <div className="dashboard-grid">
                    {modes.map((mode) => (
                        <a
                            key={mode.key}
                            className="mode-card"
                            style={{ gridColumn: mode.span }}
                            href={mode.href}
                            onClick={(e) => {
                                e.preventDefault();
                                router.push(mode.href);
                            }}
                        >
                            <div className="mode-label">{mode.label}</div>
                            <div className="mode-description">{mode.description}</div>
                        </a>
                    ))}

                    {/* Admin dashboard card */}
                    {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                        <a
                            className="mode-card full"
                            href="/admin"
                            onClick={(e) => {
                                e.preventDefault();
                                router.push('/admin');
                            }}
                        >
                            <div className="mode-label">Admin Dashboard</div>
                            <div className="mode-description">Manage accounts, approve users, and view usage.</div>
                        </a>
                    )}

                    {/* Super admin dashboard card */}
                    {user.role === 'SUPER_ADMIN' && (
                        <a
                            className="mode-card full"
                            href="/admin/superadmin"
                            onClick={(e) => {
                                e.preventDefault();
                                router.push('/admin/superadmin');
                            }}
                            style={{ borderColor: 'var(--accent-orange)' }}
                        >
                            <div className="mode-label">👑 Super Admin Dashboard</div>
                            <div className="mode-description">View usage across all libraries, manage global settings, and track system-wide activity.</div>
                        </a>
                    )}
                </div>
            </main>

            <footer style={{ padding: '40px', borderTop: '1px solid var(--border-color)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <img src="/images/logo.svg" alt="Public AI" style={{ height: '24px', marginBottom: '12px', opacity: 0.5 }} /><br />
                &copy; 2026 Public AI Libraries Project
            </footer>
        </div>
    );
}
