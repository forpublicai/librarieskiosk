import Icon, { type IconName } from '@/components/ui/Icon';
import type { ToolName } from '@/components/ui/ToolShape';

/** The five tools in Home order. `key` is the usage-log mode. */
export const TOOL_COLUMNS: { key: ToolName; label: string }[] = [
    { key: 'chat', label: 'Chat' },
    { key: 'image', label: 'Image' },
    { key: 'music', label: 'Music' },
    { key: 'video', label: 'Video' },
    { key: 'code', label: 'Code' },
];

export const ROLE_NAMES: Record<string, string> = {
    SUPER_ADMIN: 'Super admin',
    ADMIN: 'Library admin',
    PATRON: 'Patron',
    GUEST: 'Guest',
};

const STATUS: Record<string, { label: string; icon: IconName; tone: 'success' | 'warning' | 'danger' }> = {
    APPROVED: { label: 'Approved', icon: 'check', tone: 'success' },
    PENDING: { label: 'Waiting', icon: 'alert', tone: 'warning' },
    BANNED: { label: 'Suspended', icon: 'alert', tone: 'danger' },
};

/** Account status as an icon and a word. The color goes on the icon only. */
export function StatusLabel({ status }: { status: string }) {
    const s = STATUS[status];
    if (!s) return <span className="lk-status">{status}</span>;
    return (
        <span className={`lk-status lk-status--${s.tone}`}>
            <Icon name={s.icon} size={20} />
            {s.label}
        </span>
    );
}

/** A heading for one library's group of accounts. */
export function GroupHeading({ library, count }: { library: string; count: number }) {
    return (
        <div className="lk-group-head">
            <h2 className="lk-heading">{library}</h2>
            <span className="lk-fine">{count} {count === 1 ? 'account' : 'accounts'}</span>
        </div>
    );
}

export function formatLastLogin(lastLoginAt: string | null, loginCount: number): string {
    if (lastLoginAt) {
        const date = new Date(lastLoginAt);
        if (!Number.isNaN(date.getTime())) return date.toLocaleString();
    }

    return loginCount > 0 ? 'Unknown' : 'Never';
}
