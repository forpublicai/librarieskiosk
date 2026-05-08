'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
<<<<<<< Updated upstream
import CreditBadge from '@/components/CreditBadge';
=======
import ThemeToggle from '@/components/ThemeToggle';
>>>>>>> Stashed changes

interface HeaderProps {
    title?: string;
    showBack?: boolean;
    actions?: React.ReactNode;
}

export default function Header({ title, showBack = true, actions }: HeaderProps) {
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
                        {`// ${title}`}
                    </span>
                )}
            </div>
            <div className="page-header-right">
<<<<<<< Updated upstream
                <CreditBadge renewAt={user.creditsRenewAt}>{user.credits} Credits</CreditBadge>
=======
                {actions}
                <span className="credit-badge">{user.credits} Credits</span>
>>>>>>> Stashed changes
                {user.role !== 'GUEST' && (
                    <button className="back-btn" onClick={() => router.push('/account')}>
                        My Account
                    </button>
                )}
                <ThemeToggle />
                <button className="back-btn" onClick={logout}>
                    Sign Out
                </button>
            </div>
        </header>
    );
}
