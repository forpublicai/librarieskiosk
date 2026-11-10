'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import Tabs from '@/components/Tabs';
import Button from '@/components/ui/Button';
import CreditBadge from '@/components/ui/CreditBadge';
import Icon, { type IconName } from '@/components/ui/Icon';
import Notice from '@/components/ui/Notice';
import Spinner from '@/components/ui/Spinner';
import TextField from '@/components/ui/TextField';

type AccountTab = 'password' | 'usage' | 'delete';

const TOOL_NAMES: Record<string, { label: string; icon: IconName }> = {
    chat: { label: 'Chat', icon: 'chat' },
    image: { label: 'Image', icon: 'image' },
    music: { label: 'Music', icon: 'music' },
    video: { label: 'Video', icon: 'video' },
    code: { label: 'Code', icon: 'code' },
};

const ROLE_NAMES: Record<string, string> = {
    SUPER_ADMIN: 'Super admin',
    ADMIN: 'Library admin',
    PATRON: 'Patron',
    GUEST: 'Guest',
};

function ModeName({ mode }: { mode: string }) {
    const tool = TOOL_NAMES[mode];
    if (!tool) return <span className="lk-table__mode">{mode}</span>;
    return (
        <span className="lk-table__mode">
            <Icon name={tool.icon} size={20} />
            {tool.label}
        </span>
    );
}

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

    const [tab, setTab] = useState<AccountTab>('password');
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
            setPwError('The two new passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            setPwError('The new password must have at least 6 characters.');
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
            setPwSuccess('Use the new password the next time you sign in.');
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

    const deleteReady = Boolean(deletePassword && deleteAnswer && deleteConfirmation.trim().toLowerCase() === 'delete my account');

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <Header title="Account" />

            <main className="lk-page">
                <div>
                    <h1 className="lk-title">{user.username}</h1>
                    <div className="lk-page__meta">
                        <span>{ROLE_NAMES[user.role] ?? user.role}</span>
                        <span aria-hidden="true">·</span>
                        <span>{user.library}</span>
                        <CreditBadge credits={user.credits} renewAt={user.creditsRenewAt} />
                    </div>
                </div>

                <Tabs<AccountTab>
                    label="Account settings"
                    value={tab}
                    onChange={setTab}
                    items={[
                        { id: 'password', label: 'Change password' },
                        { id: 'usage', label: 'Credits used' },
                        { id: 'delete', label: 'Delete account' },
                    ]}
                />

                {tab === 'password' && (
                    <section id="panel-password" role="tabpanel" aria-labelledby="tab-password" className="lk-page__narrow">
                        <form className="lk-form" onSubmit={handleChangePassword}>
                            {pwError && <Notice tone="danger" title="Your password did not change">{pwError}</Notice>}
                            {pwSuccess && <Notice tone="success" title="Your password is changed">{pwSuccess}</Notice>}
                            <TextField
                                id="cur-pw"
                                label="Current password"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                            <TextField
                                id="new-pw"
                                label="New password"
                                hint="At least 6 characters."
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                                minLength={6}
                            />
                            <TextField
                                id="confirm-pw"
                                label="Type the new password again"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                                minLength={6}
                            />
                            <Button
                                variant="primary"
                                type="submit"
                                disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
                            >
                                {pwLoading ? 'Changing…' : 'Change password'}
                            </Button>
                        </form>
                    </section>
                )}

                {tab === 'delete' && (
                    <section id="panel-delete" role="tabpanel" aria-labelledby="tab-delete" className="lk-page__narrow">
                        <form className="lk-form" onSubmit={handleDeleteAccount}>
                            <Notice tone="danger" title="This cannot be undone">
                                Your chats, your usage history and everything you made are deleted for good.
                            </Notice>
                            {deleteError && <Notice tone="danger" title="Your account was not deleted">{deleteError}</Notice>}
                            <TextField
                                id="del-pw"
                                label="Current password"
                                type="password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                            <TextField
                                id="del-answer"
                                label="Your security answer"
                                type="text"
                                value={deleteAnswer}
                                onChange={(e) => setDeleteAnswer(e.target.value)}
                                required
                                autoComplete="off"
                            />
                            <TextField
                                id="del-confirm"
                                label="Type “delete my account” to confirm"
                                type="text"
                                value={deleteConfirmation}
                                onChange={(e) => setDeleteConfirmation(e.target.value)}
                                required
                                autoComplete="off"
                            />
                            <Button variant="danger" type="submit" disabled={deleteLoading || !deleteReady}>
                                {deleteLoading ? 'Deleting…' : 'Delete my account'}
                            </Button>
                        </form>
                    </section>
                )}

                {tab === 'usage' && (
                    <section id="panel-usage" role="tabpanel" aria-labelledby="tab-usage" className="lk-form">
                        {usageLoading && !usage ? (
                            <Spinner label="Loading your credit use…" />
                        ) : usage ? (
                            <>
                                <div className="lk-stats">
                                    <div className="lk-stat">
                                        <span className="lk-stat__value">{usage.totals.totalCreditsSpent}</span>
                                        <span className="lk-stat__label">Credits used</span>
                                    </div>
                                    <div className="lk-stat">
                                        <span className="lk-stat__value">{usage.totals.totalEvents}</span>
                                        <span className="lk-stat__label">Times you used a tool</span>
                                    </div>
                                    <div className="lk-stat">
                                        <span className="lk-stat__value">{user.credits}</span>
                                        <span className="lk-stat__label">Credits left</span>
                                    </div>
                                </div>

                                <h2 className="lk-heading">By tool</h2>
                                {usage.byMode.length === 0 ? (
                                    <p className="lk-fine">You have not used any tools yet.</p>
                                ) : (
                                    <div className="lk-table-wrap">
                                        <table className="lk-table">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Tool</th>
                                                    <th scope="col" className="lk-table__num">Times used</th>
                                                    <th scope="col" className="lk-table__num">Credits used</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {usage.byMode.map((m) => (
                                                    <tr key={m.mode}>
                                                        <td><ModeName mode={m.mode} /></td>
                                                        <td className="lk-table__num">{m.count}</td>
                                                        <td className="lk-table__num">{m.credits}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <h2 className="lk-heading">Recent activity</h2>
                                {usage.recent.length === 0 ? (
                                    <p className="lk-fine">Nothing yet.</p>
                                ) : (
                                    <div className="lk-table-wrap">
                                        <table className="lk-table">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Date</th>
                                                    <th scope="col">Tool</th>
                                                    <th scope="col">Model</th>
                                                    <th scope="col">Prompt</th>
                                                    <th scope="col" className="lk-table__num">Credits</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {usage.recent.map((r) => (
                                                    <tr key={r.id}>
                                                        <td>{new Date(r.createdAt).toLocaleString()}</td>
                                                        <td><ModeName mode={r.mode} /></td>
                                                        <td>{r.model}</td>
                                                        <td className="lk-table__clip" title={r.prompt}>{r.prompt}</td>
                                                        <td className="lk-table__num">{r.creditsUsed}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        ) : (
                            <Notice tone="warning" title="Your credit use could not load">
                                Please try again in a moment.
                            </Notice>
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}
