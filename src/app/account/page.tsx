'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';

interface UsageData {
    totals: { totalCreditsSpent: number; totalEvents: number };
    byMode: { mode: string; credits: number; count: number }[];
    recent: {
        id: string;
        mode: string;
        model: string;
        prompt: string;
        creditsUsed: number;
        createdAt: string;
    }[];
}

export default function AccountPage() {
    const { user, token, isLoading } = useAuth();
    const router = useRouter();

    const [tab, setTab] = useState<'password' | 'usage' | 'delete'>('password');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwError, setPwError] = useState('');
    const [pwSuccess, setPwSuccess] = useState('');
    const [pwLoading, setPwLoading] = useState(false);

    const [usage, setUsage] = useState<UsageData | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);

    const [deletePassword, setDeletePassword] = useState('');
    const [deleteAnswer, setDeleteAnswer] = useState('');
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        if (!isLoading && (!user || user.role === 'GUEST')) {
            router.push('/dashboard');
        }
    }, [user, isLoading, router]);

    const loadUsage = useCallback(async () => {
        if (!token) return;
        setUsageLoading(true);
        try {
            const res = await fetch('/api/account/usage', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setUsage(await res.json());
        } finally {
            setUsageLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (tab === 'usage' && !usage) loadUsage();
    }, [tab, usage, loadUsage]);

    const handleChangePassword = async (e: FormEvent) => {
        e.preventDefault();
        setPwError('');
        setPwSuccess('');

        if (newPassword !== confirmPassword) {
            setPwError('New passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            setPwError('Password must be at least 6 characters');
            return;
        }

        setPwLoading(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to change password');
            setPwSuccess('Password changed successfully.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            setPwError(err instanceof Error ? err.message : 'Failed to change password');
        } finally {
            setPwLoading(false);
        }
    };

    const handleDeleteAccount = async (e: FormEvent) => {
        e.preventDefault();
        setDeleteError('');
        setDeleteLoading(true);
        try {
            const res = await fetch('/api/account/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    password: deletePassword,
                    answer: deleteAnswer,
                    confirmation: deleteConfirmation,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Deletion failed');
            // Account deleted — clear local state and go to login
            localStorage.removeItem('kiosk_token');
            router.push('/');
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Deletion failed');
        } finally {
            setDeleteLoading(false);
        }
    };

    if (isLoading || !user || user.role === 'GUEST') return null;

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <Header title="My Account" />

            <div style={{ padding: '24px 32px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '4px' }}>
                        {user.username}
                    </h1>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {user.role} · {user.library} · {user.credits} credits
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                    <button
                        className={tab === 'password' ? 'btn btn-primary' : 'btn'}
                        onClick={() => setTab('password')}
                        style={{ borderBottom: 'none', fontSize: '0.8rem' }}
                    >
                        Reset Password
                    </button>
                    <button
                        className={tab === 'usage' ? 'btn btn-primary' : 'btn'}
                        onClick={() => setTab('usage')}
                        style={{ borderBottom: 'none', fontSize: '0.8rem' }}
                    >
                        Credit Spend
                    </button>
                    <button
                        className={tab === 'delete' ? 'btn btn-primary' : 'btn'}
                        onClick={() => setTab('delete')}
                        style={{ borderBottom: 'none', fontSize: '0.8rem', color: tab === 'delete' ? undefined : 'var(--accent-red)' }}
                    >
                        Delete Account
                    </button>
                </div>

                {tab === 'password' && (
                    <form onSubmit={handleChangePassword} style={{ maxWidth: '420px' }}>
                        {pwError && <div className="gen-error" style={{ marginBottom: '16px' }}>{pwError}</div>}
                        {pwSuccess && <div className="alert-success" style={{ marginBottom: '16px' }}>{pwSuccess}</div>}

                        <div className="form-group">
                            <label className="form-label" htmlFor="cur-pw">CURRENT PASSWORD</label>
                            <input
                                id="cur-pw"
                                className="input"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="new-pw">NEW PASSWORD</label>
                            <input
                                id="new-pw"
                                className="input"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="MIN 6 CHARACTERS"
                                required
                                minLength={6}
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <label className="form-label" htmlFor="confirm-pw">CONFIRM NEW PASSWORD</label>
                            <input
                                id="confirm-pw"
                                className="input"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>

                        <button
                            className="btn btn-primary"
                            type="submit"
                            disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
                        >
                            {pwLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
                        </button>
                    </form>
                )}

                {tab === 'delete' && (
                    <div style={{ maxWidth: '420px' }}>
                        <div style={{
                            padding: '16px',
                            background: 'rgba(239,68,68,0.07)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            marginBottom: '24px',
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)',
                            lineHeight: '1.5',
                        }}>
                            <strong style={{ color: 'var(--accent-red)' }}>This is permanent.</strong>{' '}
                            All your conversations, usage history, and generated media will be deleted
                            and cannot be recovered.
                        </div>

                        <form onSubmit={handleDeleteAccount}>
                            {deleteError && (
                                <div className="gen-error" style={{ marginBottom: '16px' }}>{deleteError}</div>
                            )}

                            <div className="form-group">
                                <label className="form-label" htmlFor="del-pw">CURRENT PASSWORD</label>
                                <input
                                    id="del-pw"
                                    className="input"
                                    type="password"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="del-answer">SECURITY ANSWER</label>
                                <input
                                    id="del-answer"
                                    className="input"
                                    type="text"
                                    value={deleteAnswer}
                                    onChange={(e) => setDeleteAnswer(e.target.value)}
                                    required
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '24px' }}>
                                <label className="form-label" htmlFor="del-confirm">
                                    TYPE &ldquo;delete my account&rdquo; TO CONFIRM
                                </label>
                                <input
                                    id="del-confirm"
                                    className="input"
                                    type="text"
                                    value={deleteConfirmation}
                                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                                    placeholder="delete my account"
                                    required
                                    autoComplete="off"
                                />
                            </div>

                            <button
                                className="btn"
                                type="submit"
                                disabled={
                                    deleteLoading ||
                                    !deletePassword ||
                                    !deleteAnswer ||
                                    deleteConfirmation.trim().toLowerCase() !== 'delete my account'
                                }
                                style={{
                                    background: 'var(--accent-red)',
                                    color: '#fff',
                                    border: 'none',
                                    opacity: (deleteLoading || !deletePassword || !deleteAnswer || deleteConfirmation.trim().toLowerCase() !== 'delete my account') ? 0.5 : 1,
                                }}
                            >
                                {deleteLoading ? 'DELETING...' : 'DELETE MY ACCOUNT'}
                            </button>
                        </form>
                    </div>
                )}

                {tab === 'usage' && (
                    <div>
                        {usageLoading && !usage ? (
                            <div className="gen-spinner" />
                        ) : usage ? (
                            <>
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                                    <div className="credit-badge">
                                        💸 {usage.totals.totalCreditsSpent} credits spent
                                    </div>
                                    <div className="credit-badge">
                                        📊 {usage.totals.totalEvents} generations
                                    </div>
                                    <div className="credit-badge">
                                        💰 {user.credits} remaining
                                    </div>
                                </div>

                                <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    By Mode
                                </h3>
                                {usage.byMode.length === 0 ? (
                                    <div className="gen-empty" style={{ padding: '24px', marginBottom: '24px' }}>
                                        <div className="gen-empty-text">No usage yet</div>
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto', marginBottom: '32px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--border-strong)' }}>
                                                    <th style={thStyle}>Mode</th>
                                                    <th style={thStyle}>Generations</th>
                                                    <th style={thStyle}>Credits Spent</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {usage.byMode.map((m) => (
                                                    <tr key={m.mode} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={tdStyle}><strong>{m.mode}</strong></td>
                                                        <td style={tdStyle}>{m.count}</td>
                                                        <td style={tdStyle}>{m.credits}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Recent Activity
                                </h3>
                                {usage.recent.length === 0 ? (
                                    <div className="gen-empty" style={{ padding: '24px' }}>
                                        <div className="gen-empty-text">No recent activity</div>
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--border-strong)' }}>
                                                    <th style={thStyle}>Date</th>
                                                    <th style={thStyle}>Mode</th>
                                                    <th style={thStyle}>Model</th>
                                                    <th style={thStyle}>Prompt</th>
                                                    <th style={thStyle}>Credits</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {usage.recent.map((r) => (
                                                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={tdStyle}>{new Date(r.createdAt).toLocaleString()}</td>
                                                        <td style={tdStyle}>{r.mode}</td>
                                                        <td style={tdStyle}>{r.model}</td>
                                                        <td style={{ ...tdStyle, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {r.prompt}
                                                        </td>
                                                        <td style={tdStyle}>{r.creditsUsed}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 8px',
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
    padding: '10px 8px',
    verticalAlign: 'middle',
};
