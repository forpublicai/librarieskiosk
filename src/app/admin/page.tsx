'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';

interface UserAccount {
    id: string;
    username: string;
    role: string;
    status: string;
    credits: number;
    library: string;
    createdAt: string;
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
}

export default function AdminPage() {
    const { user, token, isLoading } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [creditRequests, setCreditRequests] = useState<CreditRequestItem[]>([]);
    const [pool, setPool] = useState<LibraryPool | null>(null);
    const [adminLibrary, setAdminLibrary] = useState('');
    const [loadingAction, setLoadingAction] = useState<string | null>(null);
    const [sendCreditsModal, setSendCreditsModal] = useState<{ userId: string; username: string } | null>(null);
    const [sendAmount, setSendAmount] = useState(10);
    const [tab, setTab] = useState<'accounts' | 'requests'>('accounts');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (!isLoading && (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN'))) {
            router.push('/dashboard');
        }
    }, [user, isLoading, router]);

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
        setTimeout(() => { setError(''); setSuccess(''); }, 3000);
    };

    const handleStatusChange = async (userId: string, status: string) => {
        setLoadingAction(userId);
        try {
            const res = await fetch('/api/admin/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId, status }),
            });
            if (res.ok) { showMessage(`User ${status.toLowerCase()} successfully`); loadData(); }
            else { const data = await res.json(); showMessage(data.error || 'Failed to update status', true); }
        } catch { showMessage('Failed to update status', true); }
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
            if (res.ok) { showMessage(`Sent ${sendAmount} credits to ${sendCreditsModal.username}`); setSendCreditsModal(null); loadData(); }
            else { const data = await res.json(); showMessage(data.error || 'Failed to send credits', true); }
        } catch { showMessage('Failed to send credits', true); }
        finally { setLoadingAction(null); }
    };

    const handleCreditRequest = async (requestId: string, action: 'APPROVED' | 'DECLINED') => {
        setLoadingAction(requestId);
        try {
            const res = await fetch('/api/admin/credit-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ requestId, action }),
            });
            if (res.ok) { showMessage(`Request ${action.toLowerCase()}`); loadData(); }
            else { const data = await res.json(); showMessage(data.error || 'Failed', true); }
        } catch { showMessage('Failed to handle request', true); }
        finally { setLoadingAction(null); }
    };

    if (isLoading || !user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) return null;

    const pendingUsers = users.filter((u) => u.status === 'PENDING');
    const modes = ['chat', 'image', 'video', 'music', 'coding'];

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <Header title="Admin" />

            <div style={{ padding: '24px 32px' }}>
                {/* Pool info bar */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {pool && (
                        <div className="credit-badge">
                            🏦 {pool.poolRemaining}/{pool.weeklyPool} pool
                        </div>
                    )}
                    <div className="credit-badge">
                        📚 {adminLibrary}
                    </div>
                </div>

                {/* Messages */}
                {error && <div className="gen-error" style={{ marginBottom: '16px' }}>{error}</div>}
                {success && <div className="alert-success" style={{ marginBottom: '16px' }}>{success}</div>}

                {/* Pending alert */}
                {pendingUsers.length > 0 && (
                    <div className="alert-warning" style={{ marginBottom: '16px' }}>
                        ⚠️ {pendingUsers.length} account{pendingUsers.length > 1 ? 's' : ''} pending approval
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                    <button
                        className={tab === 'accounts' ? 'btn btn-primary' : 'btn'}
                        onClick={() => setTab('accounts')}
                        style={{ borderBottom: 'none', fontSize: '0.8rem' }}
                    >
                        Accounts ({users.length})
                    </button>
                    <button
                        className={tab === 'requests' ? 'btn btn-primary' : 'btn'}
                        onClick={() => setTab('requests')}
                        style={{ borderBottom: 'none', fontSize: '0.8rem' }}
                    >
                        Credit Requests ({creditRequests.length})
                    </button>
                </div>

                {/* Accounts tab */}
                {tab === 'accounts' && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-strong)' }}>
                                    <th style={thStyle}>User</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Credits</th>
                                    <th style={thStyle}>Usage</th>
                                    {modes.map((m) => (
                                        <th key={m} style={thStyle}>{m}</th>
                                    ))}
                                    <th style={thStyle}>Joined</th>
                                    <th style={thStyle}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={tdStyle}>
                                            <strong>{u.username}</strong>
                                            {u.role === 'ADMIN' && <span style={{ fontSize: '0.7rem', color: 'var(--accent-orange)', marginLeft: '4px' }}>ADMIN</span>}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600,
                                                background: u.status === 'APPROVED' ? 'rgba(16,185,129,0.1)' : u.status === 'BANNED' ? 'rgba(239,68,68,0.1)' : 'rgba(255,77,0,0.1)',
                                                color: u.status === 'APPROVED' ? 'var(--accent-green)' : u.status === 'BANNED' ? 'var(--accent-red)' : 'var(--accent-orange)',
                                            }}>
                                                {u.status}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>{u.credits}</td>
                                        <td style={tdStyle}>{u.totalUsage}</td>
                                        {modes.map((m) => (
                                            <td key={m} style={tdStyle}>{u.usageByMode[m]?.count || 0}</td>
                                        ))}
                                        <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                        <td style={{ ...tdStyle, display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {u.role !== 'ADMIN' && (
                                                <>
                                                    {u.status !== 'APPROVED' && (
                                                        <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                                            onClick={() => handleStatusChange(u.id, 'APPROVED')} disabled={loadingAction === u.id}>
                                                            ✓ Approve
                                                        </button>
                                                    )}
                                                    {u.status !== 'BANNED' && (
                                                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                                            onClick={() => handleStatusChange(u.id, 'BANNED')} disabled={loadingAction === u.id}>
                                                            Ban
                                                        </button>
                                                    )}
                                                    <button className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                                        onClick={() => { setSendCreditsModal({ userId: u.id, username: u.username }); setSendAmount(10); }}>
                                                        Credits
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Requests tab */}
                {tab === 'requests' && (
                    <div>
                        {creditRequests.length === 0 ? (
                            <div className="gen-empty" style={{ padding: '48px' }}>
                                <div className="gen-empty-icon">💰</div>
                                <div className="gen-empty-text">No pending credit requests</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {creditRequests.map((req) => (
                                    <div key={req.id} style={{
                                        padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        <div>
                                            <strong>{req.user.username}</strong> requests <strong>{req.amount}</strong> credits
                                            {req.reason && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Reason: {req.reason}</div>}
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                Balance: {req.user.credits} · {new Date(req.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                onClick={() => handleCreditRequest(req.id, 'APPROVED')} disabled={loadingAction === req.id}>
                                                ✓ Approve
                                            </button>
                                            <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                onClick={() => handleCreditRequest(req.id, 'DECLINED')} disabled={loadingAction === req.id}>
                                                ✕ Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Send credits modal */}
            {sendCreditsModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'var(--overlay-bg)', zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                }} onClick={() => setSendCreditsModal(null)}>
                    <div style={{
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
                        padding: '32px', width: '360px', maxWidth: '90vw',
                    }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '16px', fontWeight: 'bold' }}>Send Credits to {sendCreditsModal.username}</h3>
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label className="form-label">Amount</label>
                            <input className="input" type="number" min={1} max={pool?.poolRemaining || 100}
                                value={sendAmount} onChange={(e) => setSendAmount(Number(e.target.value))} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Pool remaining: {pool?.poolRemaining || 0}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setSendCreditsModal(null)}>Cancel</button>
                            <button className="btn btn-primary"
                                onClick={handleSendCredits}
                                disabled={sendAmount <= 0 || loadingAction === sendCreditsModal.userId}>
                                Send Credits
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
