'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';

interface LibraryBreakdown {
    name: string;
    weeklyPool: number;
    poolRemaining: number;
    userCount: number;
    totalUsage: number;
    totalCredits: number;
}

interface ModeUsage {
    mode: string;
    count: number;
    credits: number;
}

interface UserAccount {
    id: string;
    username: string;
    role: string;
    status: string;
    credits: number;
    library: string;
    createdAt: string;
    loginCount: number;
    totalUsage: number;
    usageByMode: Record<string, { count: number; credits: number }>;
}

interface Overview {
    totalUsers: number;
    totalGuests: number;
    totalLibraries: number;
    totalUsageLogs: number;
    totalCreditsUsed: number;
}

export default function SuperAdminPage() {
    const { user, token, isLoading } = useAuth();
    const router = useRouter();
    const [overview, setOverview] = useState<Overview | null>(null);
    const [libraries, setLibraries] = useState<LibraryBreakdown[]>([]);
    const [usageByMode, setUsageByMode] = useState<ModeUsage[]>([]);
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [tab, setTab] = useState<'overview' | 'libraries' | 'users'>('overview');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoading && (!user || user.role !== 'SUPER_ADMIN')) {
            router.push('/dashboard');
        }
    }, [user, isLoading, router]);

    const loadData = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/superadmin/overview', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setOverview(data.overview);
                setLibraries(data.libraryBreakdown);
                setUsageByMode(data.usageByMode);
                setUsers(data.users);
            }
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (isLoading || !user || user.role !== 'SUPER_ADMIN') return null;

    const modes = ['chat', 'image', 'video', 'music', 'code'];

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <Header title="Super Admin" />

            <div style={{ padding: '24px 32px' }}>
                {/* Overview cards */}
                {overview && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        <StatCard label="Libraries" value={overview.totalLibraries} icon="📚" />
                        <StatCard label="Users" value={overview.totalUsers} icon="👥" />
                        <StatCard label="Guests" value={overview.totalGuests} icon="👤" />
                        <StatCard label="Total Usage" value={overview.totalUsageLogs} icon="📊" />
                        <StatCard label="Credits Used" value={overview.totalCreditsUsed} icon="💰" />
                    </div>
                )}

                {/* Usage by mode summary */}
                {usageByMode.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
                        {usageByMode.map((m) => (
                            <div key={m.mode} className="credit-badge" style={{ fontSize: '0.8rem' }}>
                                {m.mode}: {m.count} uses ({m.credits} cr)
                            </div>
                        ))}
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                    {(['overview', 'libraries', 'users'] as const).map((t) => (
                        <button
                            key={t}
                            className={tab === t ? 'btn btn-primary' : 'btn'}
                            onClick={() => setTab(t)}
                            style={{ borderBottom: 'none', fontSize: '0.8rem', textTransform: 'capitalize' }}
                        >
                            {t === 'overview' ? `Libraries (${libraries.length})` : t === 'libraries' ? 'Pool Status' : `Users (${users.length})`}
                        </button>
                    ))}
                </div>

                {loading && <div style={{ textAlign: 'center', padding: '48px' }}><div className="gen-spinner" /></div>}

                {/* Libraries overview tab */}
                {!loading && tab === 'overview' && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-strong)' }}>
                                    <th style={thStyle}>Library</th>
                                    <th style={thStyle}>Users</th>
                                    <th style={thStyle}>Total Usage</th>
                                    <th style={thStyle}>Credits Used</th>
                                    <th style={thStyle}>Pool</th>
                                </tr>
                            </thead>
                            <tbody>
                                {libraries.map((lib) => (
                                    <tr key={lib.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={tdStyle}><strong>{lib.name}</strong></td>
                                        <td style={tdStyle}>{lib.userCount}</td>
                                        <td style={tdStyle}>{lib.totalUsage}</td>
                                        <td style={tdStyle}>{lib.totalCredits}</td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600,
                                                background: lib.poolRemaining > 200 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                                color: lib.poolRemaining > 200 ? 'var(--accent-green)' : 'var(--accent-red)',
                                            }}>
                                                {lib.poolRemaining}/{lib.weeklyPool}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pool status tab */}
                {!loading && tab === 'libraries' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {libraries.map((lib) => {
                            const pct = Math.round((lib.poolRemaining / lib.weeklyPool) * 100);
                            return (
                                <div key={lib.name} style={{
                                    padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                                }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '1rem' }}>{lib.name}</div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{
                                            height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                width: `${pct}%`, height: '100%',
                                                background: pct > 50 ? 'var(--accent-green)' : pct > 20 ? 'var(--accent-orange)' : 'var(--accent-red)',
                                                transition: 'width 0.3s',
                                            }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <span>{lib.poolRemaining} remaining</span>
                                        <span>{pct}%</span>
                                    </div>
                                    <div style={{ marginTop: '12px', display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        <span>👥 {lib.userCount} users</span>
                                        <span>📊 {lib.totalUsage} uses</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Users tab */}
                {!loading && tab === 'users' && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-strong)' }}>
                                    <th style={thStyle}>User</th>
                                    <th style={thStyle}>Library</th>
                                    <th style={thStyle}>Role</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Credits</th>
                                    <th style={thStyle}>Logins</th>
                                    <th style={thStyle}>Usage</th>
                                    {modes.map((m) => (
                                        <th key={m} style={thStyle}>{m}</th>
                                    ))}
                                    <th style={thStyle}>Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={tdStyle}>
                                            <strong>{u.username}</strong>
                                            {u.role === 'ADMIN' && <span style={{ fontSize: '0.7rem', color: 'var(--accent-orange)', marginLeft: '4px' }}>ADMIN</span>}
                                            {u.role === 'SUPER_ADMIN' && <span style={{ fontSize: '0.7rem', color: 'var(--accent-red)', marginLeft: '4px' }}>SUPER</span>}
                                        </td>
                                        <td style={tdStyle}>{u.library}</td>
                                        <td style={tdStyle}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{u.role}</span>
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
                                        <td style={tdStyle}>{u.loginCount}</td>
                                        <td style={tdStyle}>{u.totalUsage}</td>
                                        {modes.map((m) => (
                                            <td key={m} style={tdStyle}>{u.usageByMode[m]?.count || 0}</td>
                                        ))}
                                        <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
    return (
        <div style={{
            padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            textAlign: 'center',
        }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{icon}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{value.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
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
