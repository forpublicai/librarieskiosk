import type { MouseEventHandler, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { cx } from './cx';

interface ConversationItemProps {
    title: string;
    /** Short date, e.g. "Today". */
    meta?: string;
    icon?: IconName;
    /** Shown in place of the icon, e.g. a picture thumbnail. */
    leading?: ReactNode;
    /** The open conversation. */
    selected?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    className?: string;
}

export default function ConversationItem({ title, meta, icon, leading, selected, onClick, className }: ConversationItemProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx('lk-convo', selected && 'lk-convo--selected', className)}
            aria-current={selected ? 'true' : undefined}
        >
            {leading ?? (icon && <Icon name={icon} size={20} className="lk-convo__icon" />)}
            <span className="lk-convo__text">
                <span className="lk-convo__title">{title}</span>
                {meta && <span className="lk-convo__meta">{meta}</span>}
            </span>
        </button>
    );
}
