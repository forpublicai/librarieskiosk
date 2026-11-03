'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { ROLE_NAMES, StatusLabel, TOOL_COLUMNS } from '@/components/AdminParts';
import Dialog from '@/components/Dialog';
import Header from '@/components/Header';
import Tabs from '@/components/Tabs';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import TextField from '@/components/ui/TextField';
import { formatCreditRenewalTitle } from '@/lib/creditRenewal';

interface UserAccount {
    id: string;
    username: string;
    role: string;
    status: string;
    credits: number;
    creditsRenewAt: string | null;
    library: string;
    createdAt: string;
    lastLoginAt: string | null;
    totalUsage: number;
    usageByMode: Record<string, { count: number; credits: number }>;
}

interface CreditRequestItem {
    id: string;
    amount: number;
    reason: string | null;
    status: string;
    createdAt: string;
    user: { id: string; username: string; credits: number; library: string };
}

interface LibraryPool {
    name: string;
    weeklyPool: number;
    poolRemaining: number;
    poolRenewAt: string | null;
}

type AdminTab = 'accounts' | 'requests';

const MESSAGE_MS = 8000;

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export default function AdminPage() {
    const { user, token, isLoading, refreshUser } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [creditRequests, setCreditRequests] = useState<CreditRequestItem[]>([]);
    const [pool, setPool] = useState<LibraryPool | null>(null);
    const [adminLibrary, setAdminLibrary] = useState('');
    const [loadingAction, setLoadingAction] = useState<string | null>(null);
    const [sendCreditsModal, setSendCreditsModal] = useState<{ userId: string; username: string } | null>(null);
    const [sendAmount, setSendAmount] = useState(10);
    const [tab, setTab] = useState<AdminTab>('accounts');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isLoading && (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN'))) {
            router.push('/dashboard');
        }
    }, [user, isLoading, router]);

    useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current); }, []);

    const loadData = useCallback(async () => {
        if (!token) return;
        try {
            const [accountsRes, poolRes, requestsRes] = await Promise.all([
                fetch('/api/admin/accounts', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/credit-pool', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/credit-requests', { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (accountsRes.ok) {
                const data = await accountsRes.json();
                setUsers(data.users);
                setAdminLibrary(data.library);
            }
            if (poolRes.ok) {
                const data = await poolRes.json();
                setPool(data.library);
            }
            if (requestsRes.ok) {
                const data = await requestsRes.json();
                setCreditRequests(data.requests);
            }
        } catch { /* ignore */ }
    }, [token]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const showMessage = (msg: string, isError = false) => {
        if (isError) { setError(msg); setSuccess(''); }
        else { setSuccess(msg); setError(''); }
        if (messageTimer.current) clearTimeout(messageTimer.current);
        messageTimer.current = setTimeout(() => { setError(''); setSuccess(''); }, MESSAGE_MS);
    };

    const handleStatusChange = async (account: UserAccount, status: 'APPROVED' | 'BANNED') => {
        setLoadingAction(account.id);
        try {
            const res = await fetch('/api/admin/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: account.id, status }),
            });
            if (res.ok) {
                showMessage(status === 'APPROVED' ? `${account.username} can now use the kiosk.` : `${account.username} is suspended.`);
                loadData();
            } else {
                const data = await res.json();
                showMessage(data.error || 'The account did not change. Please try again.', true);
            }
        } catch { showMessage('The account did not change. Please try again.', true); }
        finally { setLoadingAction(null); }
    };

    const handleSendCredits = async () => {
        if (!sendCreditsModal) return;
        setLoadingAction(sendCreditsModal.userId);
        try {
            const res = await fetch('/api/admin/credit-pool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: sendCreditsModal.userId, amount: sendAmount }),
            });
            if (res.ok) {
                showMessage(`${sendCreditsModal.username} got ${plural(sendAmount, 'credit')}.`);
                setSendCreditsModal(null);
                loadData();
                refreshUser();
            } else {
                const data = await res.json();
                showMessage(data.error || 'The credits were not sent. Please try again.', true);
            }
        } catch { showMessage('The credits were not sent. Please try again.', true); }
        finally { setLoadingAction(null); }
    };

    const handleCreditRequest = async (req: CreditRequestItem, action: 'APPROVED' | 'DECLINED') => {
        setLoadingAction(req.id);
        try {
            const res = await fetch('/api/admin/credit-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ requestId: req.id, action }),
            });
            if (res.ok) {
                showMessage(action === 'APPROVED'
                    ? `${req.user.username} got ${plural(req.amount, 'credit')}.`
                    : `You declined the request from ${req.user.username}.`);
                loadData();
                refreshUser();
            } else {
                const data = await res.json();
                showMessage(data.error || 'The request did not change. Please try again.', true);
            }
        } catch { showMessage('The request did not change. Please try again.', true); }
        finally { setLoadingAction(null); }
    };

    if (isLoading || !user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) return null;

    const pendingUsers = users.filter((u) => u.status === 'PENDING');
    // The server checks the pool too; the cap here only applies once the pool has loaded.
    const overPool = pool !== null && sendAmount > pool.poolRemaining;
    const amountValid = Number.isInteger(sendAmount) && sendAmount > 0 && !overPool;

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <Header title="Admin" />

            <main className="lk-page lk-page--wide">
                <div>
                    <h1 className="lk-title">Library admin</h1>
                    {adminLibrary && <p className="lk-page__meta">{adminLibrary}</p>}
                </div>

                <div className="lk-stats">
                    {pool && (
                        <div className="lk-stat" title={formatCreditRenewalTitle(pool.poolRenewAt)}>
                            <span className="lk-stat__value">{pool.poolRemaining} of {pool.weeklyPool}</span>
                            <span className="lk-stat__label">Credits left in the weekly pool</span>
                        </div>
                    )}
                    <div className="lk-stat">
                        <span className="lk-stat__value">{users.length}</span>
                        <span className="lk-stat__label">Accounts</span>
                    </div>
                    <div className="lk-stat">
                        <span className="lk-stat__value">{creditRequests.length}</span>
                        <span className="lk-stat__label">Requests for credits</span>
                    </div>
                </div>

                {(error || success) && (
                    <div className="lk-form">
                        {error && <Notice tone="danger" title="That did not work">{error}</Notice>}
                        {success && <Notice tone="success" title="Done">{success}</Notice>}
                    </div>
                )}

                {pendingUsers.length > 0 && (
                    <Notice
                        tone="warning"
                        title={`${plural(pendingUsers.length, 'account')} ${pendingUsers.length === 1 ? 'is' : 'are'} waiting for approval`}
                    >
                        Approve them in the list of accounts below.
                    </Notice>
                )}

                <Tabs<AdminTab>
                    label="Admin sections"
                    value={tab}
                    onChange={setTab}
                    items={[
                        { id: 'accounts', label: `Accounts (${users.length})` },
                        { id: 'requests', label: `Requests for credits (${creditRequests.length})` },
                    ]}
                />

                {tab === 'accounts' && (
                    <section id="panel-accounts" role="tabpanel" aria-labelledby="tab-accounts">
                        {users.length === 0 ? (
                            <p className="lk-fine">No accounts yet.</p>
                        ) : (
                            <div className="lk-table-wrap">
                                <table className="lk-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Account</th>
                                            <th scope="col">Status</th>
                                            <th scope="col" className="lk-table__num">Credits</th>
                                            <th scope="col" className="lk-table__num">Times used</th>
                                            {TOOL_COLUMNS.map((t) => (
                                                <th key={t.key} scope="col" className="lk-table__num">{t.label}</th>
                                            ))}
                                            <th scope="col">Joined</th>
                                            <th scope="col"><span className="lk-sr">Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((u) => (
                                            <tr key={u.id}>
                                                <th scope="row" className="lk-table__name">
                                                    {u.username}
                                                    {u.role === 'ADMIN' && <span className="lk-table__sub">{ROLE_NAMES.ADMIN}</span>}
                                                </th>
                                                <td><StatusLabel status={u.status} /></td>
                                                <td className="lk-table__num" title={formatCreditRenewalTitle(u.creditsRenewAt)}>{u.credits}</td>
                                                <td className="lk-table__num">{u.totalUsage}</td>
                                                {TOOL_COLUMNS.map((t) => (
                                                    <td key={t.key} className="lk-table__num">{u.usageByMode[t.key]?.count || 0}</td>
                                                ))}
                                                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                                                <td>
                                                    {u.role !== 'ADMIN' && (
                                                        <div className="lk-row-actions">
                                                            {u.status !== 'APPROVED' && (
                                                                <Button
                                                                    icon="check"
                                                                    onClick={() => handleStatusChange(u, 'APPROVED')}
                                                                    disabled={loadingAction === u.id}
                                                                >
                                                                    Approve
                                                                </Button>
                                                            )}
                                                            <Button
                                                                variant="quiet"
                                                                icon="credits"
                                                                onClick={() => { setSendCreditsModal({ userId: u.id, username: u.username }); setSendAmount(10); }}
                                                            >
                                                                Give credits
                                                            </Button>
                                                            {u.status !== 'BANNED' && (
                                                                <Button
                                                                    variant="danger"
                                                                    onClick={() => handleStatusChange(u, 'BANNED')}
                                                                    disabled={loadingAction === u.id}
                                                                >
                                                                    Suspend
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {tab === 'requests' && (
                    <section id="panel-requests" role="tabpanel" aria-labelledby="tab-requests">
                        {creditRequests.length === 0 ? (
                            <p className="lk-fine">No one is asking for credits right now.</p>
                        ) : (
                            <ul className="lk-rows">
                                {creditRequests.map((req) => (
                                    <li key={req.id} className="lk-row">
                                        <div className="lk-row__text">
                                            <p className="lk-row__title">
                                                {req.user.username} asks for {plural(req.amount, 'credit')}
                                            </p>
                                            {req.reason && <p className="lk-row__body">“{req.reason}”</p>}
                                            <p className="lk-fine">
                                                Has {plural(req.user.credits, 'credit')} now · {new Date(req.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="lk-row-actions">
                                            <Button
                                                icon="check"
                                                onClick={() => handleCreditRequest(req, 'APPROVED')}
                                                disabled={loadingAction === req.id}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                variant="quiet"
                                                onClick={() => handleCreditRequest(req, 'DECLINED')}
                                                disabled={loadingAction === req.id}
                                            >
                                                Decline
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </main>

            <Dialog
                open={sendCreditsModal !== null}
                title={sendCreditsModal ? `Give credits to ${sendCreditsModal.username}` : 'Give credits'}
                onClose={() => setSendCreditsModal(null)}
                actions={
                    <>
                        <Button variant="quiet" onClick={() => setSendCreditsModal(null)}>Cancel</Button>
                        <Button
                            variant="primary"
                            icon="credits"
                            onClick={handleSendCredits}
                            disabled={!amountValid || loadingAction === sendCreditsModal?.userId}
                        >
                            Give credits
                        </Button>
                    </>
                }
            >
                <TextField
                    label="How many credits"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={pool?.poolRemaining}
                    value={Number.isNaN(sendAmount) ? '' : sendAmount}
                    onChange={(e) => setSendAmount(e.target.valueAsNumber)}
                    hint={pool ? `The weekly pool has ${plural(pool.poolRemaining, 'credit')} left.` : undefined}
                    error={overPool && pool ? `The pool has only ${plural(pool.poolRemaining, 'credit')} left.` : undefined}
                />
            </Dialog>
        </div>
    );
}
