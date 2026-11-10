import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface SharedProps {
    /** Default 'secondary'. One 'primary' per view. */
    variant?: Variant;
    /** 'md' is 48px, 'lg' is 56px. Default 'md'. */
    size?: 'md' | 'lg';
    /** Icon before the label. */
    icon?: IconName;
    /** Icon after the label. */
    iconEnd?: IconName;
    /** Fill the container width. */
    block?: boolean;
    /** The label: a verb in sentence case. */
    children: ReactNode;
}

function buttonClass({ variant = 'secondary', size, block }: SharedProps, className?: string) {
    return cx('lk-btn', `lk-btn--${variant}`, size === 'lg' && 'lk-btn--lg', block && 'lk-btn--block', className);
}

function ButtonContent({ icon, iconEnd, children }: SharedProps) {
    return (
        <>
            {icon && <Icon name={icon} size={22} />}
            <span>{children}</span>
            {iconEnd && <Icon name={iconEnd} size={22} />}
        </>
    );
}

export type ButtonProps = SharedProps & ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button({ variant, size, icon, iconEnd, block, className, children, type = 'button', ...rest }: ButtonProps) {
    const shared = { variant, size, icon, iconEnd, block, children };
    return (
        <button type={type} {...rest} className={buttonClass(shared, className)}>
            <ButtonContent {...shared} />
        </button>
    );
}

export type ButtonLinkProps = SharedProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** A link that looks like a Button. Use it for navigation. */
export function ButtonLink({ variant, size, icon, iconEnd, block, className, children, ...rest }: ButtonLinkProps) {
    const shared = { variant, size, icon, iconEnd, block, children };
    return (
        <a {...rest} className={buttonClass(shared, className)}>
            <ButtonContent {...shared} />
        </a>
    );
}
