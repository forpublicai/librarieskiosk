import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { cx } from './cx';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon?: IconName;
    /** Set true or false to make the chip a toggle. Leave undefined for a plain action. */
    selected?: boolean;
    children: ReactNode;
}

export default function Chip({ icon, selected, className, children, type = 'button', ...rest }: ChipProps) {
    return (
        <button
            type={type}
            {...rest}
            className={cx('lk-chip', selected && 'lk-chip--selected', className)}
            aria-pressed={selected === undefined ? undefined : selected}
        >
            {icon && <Icon name={icon} size={20} />}
            {children}
        </button>
    );
}
