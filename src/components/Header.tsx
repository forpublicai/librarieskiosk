'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

interface HeaderProps {
    title?: string;
    showBack?: boolean;
}

export default function Header({ title, showBack = true }: HeaderProps) {
    const { user, logout } = useAuth();
    const router = useRouter();

    if (!user) return null;

    return (
        <header className="page-header">
            <div className="page-header-left">
                {showBack && (
                    <button className="back-btn" onClick={() => router.push('/dashboard')} style={{ marginRight: '8px' }}>
                        ← Back
                    </button>
                )}
                <img
                    src="/images/logo.svg"
                    alt="Public AI"
                    className="header-logo"
                    onClick={() => router.push('/dashboard')}
                    style={{ cursor: 'pointer' }}
                />
                {title && (
                    <span style={{ marginLeft: '16px', fontWeight: 'bold', fontSize: '0.85rem', letterSpacing: '0.04em' }}>
                        // {title}
                    </span>
                )}
            </div>
            <div className="page-header-right">
                <span className="credit-badge">{user.credits} Credits</span>
                {user.role !== 'GUEST' && (
                    <button className="back-btn" onClick={() => router.push('/account')}>
                        My Account
                    </button>
                )}
                <button className="back-btn" onClick={logout}>
                    Sign Out
                </button>
            </div>
        </header>
    );
}
