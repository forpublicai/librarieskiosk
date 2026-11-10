import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { cx } from './cx';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const NOTICE_ICON: Record<Tone, IconName> = { info: 'help', success: 'check', warning: 'alert', danger: 'alert' };

interface NoticeProps {
    /** Default 'info'. */
    tone?: Tone;
    /** One short sentence naming the state. */
    title?: ReactNode;
    /** The next step. */
    children?: ReactNode;
    /** Optional Button at the end. */
    action?: ReactNode;
    className?: string;
}

/** A neutral box. Status color goes on the icon and the title only. */
export default function Notice({ tone = 'info', title, children, action, className }: NoticeProps) {
    return (
        <div className={cx('lk-notice', `lk-notice--${tone}`, className)} role={tone === 'danger' ? 'alert' : 'status'}>
            <Icon name={NOTICE_ICON[tone]} className="lk-notice__icon" />
            <div className="lk-notice__body">
                {title && <p className="lk-notice__title">{title}</p>}
                {children && <div className="lk-notice__text">{children}</div>}
            </div>
            {action}
        </div>
    );
}
