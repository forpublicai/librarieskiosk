import type { ButtonHTMLAttributes } from 'react';
import Icon, { type IconName } from './Icon';
import { cx } from './cx';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: IconName;
    /** Required accessible name, also the tooltip. */
    label: string;
    /** Default 'quiet'. */
    variant?: 'quiet' | 'primary';
    size?: 'md' | 'lg';
}

/** Icon-only button. Only for send, stop, close and menu. */
export default function IconButton({ icon, label, variant = 'quiet', size, className, type = 'button', ...rest }: IconButtonProps) {
    return (
        <button
            type={type}
            {...rest}
            className={cx('lk-iconbtn', `lk-iconbtn--${variant}`, size === 'lg' && 'lk-iconbtn--lg', className)}
            aria-label={label}
            title={label}
        >
            <Icon name={icon} />
        </button>
    );
}
