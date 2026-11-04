'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { formatLastLogin, GroupHeading, ROLE_NAMES, StatusLabel, TOOL_COLUMNS } from '@/components/AdminParts';
import Header from '@/components/Header';
import Tabs from '@/components/Tabs';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { formatCreditRenewalTitle } from '@/lib/creditRenewal';

interface LibraryBreakdown {
    name: string;
    weeklyPool: number;
    poolRemaining: number;
    poolRenewAt: string | null;
    maxConcurrentSessions: number;
    userCount: number;
    guestCount: number;
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
    creditsRenewAt: string | null;
    library: string;
    createdAt: string;
    loginCount: number;
    lastLoginAt: string | null;
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

type SuperTab = 'libraries' | 'pools' | 'users' | 'guests';

// Libraries table: a pool at or below this many credits shows "Low".
const LOW_POOL_CREDITS = 200;
// Pools list: a pool at or below this share shows "Running low".
const LOW_POOL_PERCENT = 20;

export default function SuperAdminPage() {
    const { user, token, isLoading } = useAuth();
    const router = useRouter();
    const [overview, setOverview] = useState<Overview | null>(null);
    const [libraries, setLibraries] = useState<LibraryBreakdown[]>([]);
    const [usageByMode, setUsageByMode] = useState<ModeUsage[]>([]);
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [guests, setGuests] = useState<UserAccount[]>([]);
    const [tab, setTab] = useState<SuperTab>('libraries');
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
                setGuests(data.guests || []);
            }
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (isLoading || !user || user.role !== 'SUPER_ADMIN') return null;

    const userGroups = groupAccountsByLibrary(users, libraries);
    const guestGroups = groupAccountsByLibrary(guests, libraries);

    return (
        <div className="page-container" style={{ overflow: 'auto' }}>
            <Header title="Super admin" />

            <main className="lk-page lk-page--wide">
                <h1 className="lk-title">All libraries</h1>

                {overview && (
                    <div className="lk-stats">
                        <Stat label="Libraries" value={overview.totalLibraries} />
                        <Stat label="Accounts" value={overview.totalUsers} />
                        <Stat label="Guest accounts" value={overview.totalGuests} />
                        <Stat label="Times tools were used" value={overview.totalUsageLogs} />
                        <Stat label="Credits used" value={overview.totalCreditsUsed} />
                    </div>
                )}

                {usageByMode.length > 0 && (
                    <section aria-labelledby="usage-by-tool" className="lk-form">
                        <h2 id="usage-by-tool" className="lk-heading">Use by tool</h2>
                        <UsageChart rows={usageByMode} />
                    </section>
                )}

                <Tabs<SuperTab>
                    label="Super admin sections"
                    value={tab}
                    onChange={setTab}
                    items={[
                        { id: 'libraries', label: `Libraries (${libraries.length})` },
                        { id: 'pools', label: 'Credit pools' },
                        { id: 'users', label: `Accounts (${users.length})` },
                        { id: 'guests', label: `Guests (${guests.length})` },
                    ]}
                />

                <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
                    {loading ? (
                        <Spinner label="Loading…" />
                    ) : tab === 'libraries' ? (
                        <div className="lk-table-wrap">
                            <table className="lk-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Library</th>
                                        <th scope="col" className="lk-table__num">Accounts</th>
                                        <th scope="col" className="lk-table__num">Guests</th>
                                        <th scope="col" className="lk-table__num">Times used</th>
                                        <th scope="col" className="lk-table__num">Credits used</th>
                                        <th scope="col">Pool left</th>
                                        <th scope="col">Kiosks at once</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {libraries.map((lib) => (
                                        <tr key={lib.name}>
                                            <th scope="row" className="lk-table__name">{lib.name}</th>
                                            <td className="lk-table__num">{lib.userCount}</td>
                                            <td className="lk-table__num">{lib.guestCount}</td>
                                            <td className="lk-table__num">{lib.totalUsage}</td>
                                            <td className="lk-table__num">{lib.totalCredits}</td>
                                            <td title={formatCreditRenewalTitle(lib.poolRenewAt)}>
                                                <span className="lk-row-actions">
                                                    <span>{lib.poolRemaining} of {lib.weeklyPool}</span>
                                                    {lib.poolRemaining <= LOW_POOL_CREDITS && (
                                                        <span className="lk-status lk-status--danger">
                                                            <Icon name="alert" size={20} />
                                                            Low
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td>
                                                <SessionCapEditor
                                                    library={lib.name}
                                                    value={lib.maxConcurrentSessions}
                                                    token={token}
                                                    onSaved={loadData}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : tab === 'pools' ? (
                        <ul className="lk-rows">
                            {libraries.map((lib) => {
                                const pct = lib.weeklyPool > 0 ? Math.round((lib.poolRemaining / lib.weeklyPool) * 100) : 0;
                                return (
                                    <li key={lib.name} className="lk-row">
                                        <div className="lk-row__text">
                                            <p className="lk-row__title">{lib.name}</p>
                                            <div className="lk-meter lk-series-1" aria-hidden="true">
                                                <div className="lk-meter__fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                            </div>
                                            <p className="lk-fine">
                                                <span title={formatCreditRenewalTitle(lib.poolRenewAt)}>
                                                    {lib.poolRemaining} of {lib.weeklyPool} credits left ({pct}%)
                                                </span>
                                                {' · '}{lib.userCount} {lib.userCount === 1 ? 'account' : 'accounts'}
                                                {' · '}used {lib.totalUsage} {lib.totalUsage === 1 ? 'time' : 'times'}
                                            </p>
                                        </div>
                                        {pct <= LOW_POOL_PERCENT && (
                                            <span className="lk-status lk-status--warning">
                                                <Icon name="alert" size={20} />
                                                Running low
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    ) : tab === 'guests' ? (
                        guests.length === 0 ? (
                            <p className="lk-fine">No guest accounts yet.</p>
                        ) : (
                            <div className="lk-groups">
                                {guestGroups.map((group) => (
                                    <section key={group.library}>
                                        <GroupHeading library={group.library} count={group.accounts.length} />
                                        <AccountTable accounts={group.accounts} guests />
                                    </section>
                                ))}
                            </div>
                        )
                    ) : users.length === 0 ? (
                        <p className="lk-fine">No accounts yet.</p>
                    ) : (
                        <div className="lk-groups">
                            {userGroups.map((group) => (
                                <section key={group.library}>
                                    <GroupHeading library={group.library} count={group.accounts.length} />
                                    <AccountTable accounts={group.accounts} />
                                </section>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

function groupAccountsByLibrary(accounts: UserAccount[], libraries: LibraryBreakdown[]) {
    const accountsByLibrary = new Map<string, UserAccount[]>();

    accounts.forEach((account) => {
        accountsByLibrary.set(account.library, [...(accountsByLibrary.get(account.library) ?? []), account]);
    });

    const knownLibraryNames = libraries.map((library) => library.name);
    const knownGroups = knownLibraryNames.filter((library) => accountsByLibrary.has(library));
    const unmatchedGroups = Array.from(accountsByLibrary.keys())
        .filter((library) => !knownLibraryNames.includes(library))
        .sort((a, b) => a.localeCompare(b));

    return [...knownGroups, ...unmatchedGroups].map((library) => ({
        library,
        accounts: accountsByLibrary.get(library) ?? [],
    }));
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="lk-stat">
            <span className="lk-stat__value">{value.toLocaleString()}</span>
            <span className="lk-stat__label">{label}</span>
        </div>
    );
}

// Charts follow the brand's fixed color order (red, cobalt, sun, pink, green), so the tools go Chat, Video, Image, Music, Code.
const CHART_ORDER = ['chat', 'video', 'image', 'music', 'code'];

/** Horizontal bars, one per tool, in the fixed chart color order. Each bar uses its tool's color. */
function UsageChart({ rows }: { rows: ModeUsage[] }) {
    const order = CHART_ORDER;
    const sorted = [...rows].sort((a, b) => {
        const ia = order.indexOf(a.mode);
        const ib = order.indexOf(b.mode);
        return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib) || a.mode.localeCompare(b.mode);
    });
    const max = Math.max(1, ...sorted.map((r) => r.count));

    return (
        <ul className="lk-chart">
            {sorted.map((r) => {
                const tool = TOOL_COLUMNS.find((t) => t.key === r.mode);
                const label = tool?.label ?? (r.mode === 'guide' ? 'Learning guide' : r.mode);
                return (
                    <li key={r.mode} className={tool ? `lk-chart__row lk-tool--${tool.key}` : 'lk-chart__row'}>
                        <span className="lk-chart__label">
                            <Icon name={tool?.key ?? 'help'} size={20} />
                            {label}
                        </span>
                        <span className="lk-chart__track">
                            <span className="lk-chart__lane" aria-hidden="true">
                                <span className="lk-chart__bar" style={{ width: `${(r.count / max) * 100}%` }} />
                            </span>
                            <span className="lk-chart__value">
                                {r.count.toLocaleString()} {r.count === 1 ? 'use' : 'uses'} · {r.credits.toLocaleString()} {r.credits === 1 ? 'credit' : 'credits'}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function AccountTable({ accounts, guests = false }: { accounts: UserAccount[]; guests?: boolean }) {
    return (
        <div className="lk-table-wrap">
            <table className="lk-table">
                <thead>
                    <tr>
                        <th scope="col">{guests ? 'Guest account' : 'Account'}</th>
                        {!guests && <th scope="col">Role</th>}
                        <th scope="col">Status</th>
                        <th scope="col" className="lk-table__num">Credits</th>
                        <th scope="col" className="lk-table__num">Sign-ins</th>
                        <th scope="col">Last sign-in</th>
                        <th scope="col" className="lk-table__num">Times used</th>
                        {TOOL_COLUMNS.map((t) => (
                            <th key={t.key} scope="col" className="lk-table__num">{t.label}</th>
                        ))}
                        {!guests && <th scope="col">Joined</th>}
                    </tr>
                </thead>
                <tbody>
                    {accounts.map((a) => (
                        <tr key={a.id}>
                            <th scope="row" className="lk-table__name">{a.username}</th>
                            {!guests && <td>{ROLE_NAMES[a.role] ?? a.role}</td>}
                            <td><StatusLabel status={a.status} /></td>
                            <td className="lk-table__num" title={formatCreditRenewalTitle(a.creditsRenewAt)}>{a.credits}</td>
                            <td className="lk-table__num">{a.loginCount}</td>
                            <td>{formatLastLogin(a.lastLoginAt, a.loginCount)}</td>
                            <td className="lk-table__num">{a.totalUsage}</td>
                            {TOOL_COLUMNS.map((t) => (
                                <td key={t.key} className="lk-table__num">{a.usageByMode[t.key]?.count || 0}</td>
                            ))}
                            {!guests && <td>{new Date(a.createdAt).toLocaleDateString()}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SessionCapEditor({
    library,
    value,
    token,
    onSaved,
}: {
    library: string;
    value: number;
    token: string | null;
    onSaved: () => void;
}) {
    const [draft, setDraft] = useState(String(value));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const id = useId();

    useEffect(() => {
        setDraft(String(value));
    }, [value]);

    const save = async () => {
        if (!token) return;
        const n = Number(draft);
        if (!Number.isInteger(n) || n < 1) {
            setError('Use a whole number, 1 or more.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/superadmin/overview', {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: library, maxConcurrentSessions: n }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'It did not save. Please try again.');
            } else {
                onSaved();
            }
        } catch {
            setError('It did not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const dirty = draft !== String(value);

    return (
        <form className="lk-cap" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
            <label className="lk-sr" htmlFor={id}>Kiosks at once for {library}</label>
            <input
                id={id}
                className="lk-field__control"
                type="number"
                inputMode="numeric"
                min={1}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(null); }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-err` : undefined}
            />
            {dirty && (
                <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            )}
            {error && (
                <span className="lk-cap__error" id={`${id}-err`} role="alert">
                    <Icon name="alert" size={20} />
                    {error}
                </span>
            )}
        </form>
    );
}
