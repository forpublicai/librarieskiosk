'use client';

import { useEffect, useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import Button from './Button';
import CreditBadge from './CreditBadge';
import IconButton from './IconButton';
import ToolShape, { type ToolName } from './ToolShape';

interface AppHeaderProps {
    /** The Public AI Libraries Project logo. */
    logoSrc?: string;
    /** Where the logo leads. Usually Home. */
    logoHref?: string;
    onLogoClick?: MouseEventHandler<HTMLAnchorElement>;
    /** Current tool name, shown on the right before the credits. Omit on Home. */
    title?: string;
    /** Shows the tool's small shape before the title. */
    tool?: ToolName;
    /** Shows a Home button with a back arrow, after the logo. */
    onBack?: MouseEventHandler<HTMLButtonElement>;
    credits?: number;
    /** ISO time of the next credit renewal. */
    renewAt?: string | null;
    /** Omit for guests. */
    onAccount?: MouseEventHandler<HTMLButtonElement>;
    onToggleTheme?: MouseEventHandler<HTMLButtonElement>;
    /** Current theme, used for the toggle label. */
    theme?: 'light' | 'dark';
    onSignOut?: MouseEventHandler<HTMLButtonElement>;
    /** Default "Sign out". Guests: "End session". */
    signOutLabel?: string;
    /** Extra items before the credits. */
    children?: ReactNode;
}

/** The top bar on every signed-in screen. Below 820px (1200px on tool screens) the extra and account items move into a menu. */
export default function AppHeader({
    logoSrc,
    logoHref,
    onLogoClick,
    title,
    tool,
    onBack,
    credits,
    renewAt,
    onAccount,
    onToggleTheme,
    theme,
    onSignOut,
    signOutLabel = 'Sign out',
    children,
}: AppHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const dark = theme === 'dark';
    const hasAccountItems = Boolean(onAccount || onToggleTheme || onSignOut);

    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        const onPointer = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onPointer);
        };
    }, [menuOpen]);

    const accountItems = (inMenu: boolean) => (
        <>
            {onAccount && <Button variant="quiet" icon="user" onClick={onAccount}>Account</Button>}
            {onToggleTheme && (
                <Button variant="quiet" icon={dark ? 'sun' : 'moon'} onClick={onToggleTheme}>
                    {dark ? 'Light' : 'Dark'}
                </Button>
            )}
            {onSignOut && (
                <Button variant={inMenu ? 'quiet' : 'secondary'} icon="signout" onClick={onSignOut}>
                    {signOutLabel}
                </Button>
            )}
        </>
    );

    // eslint-disable-next-line @next/next/no-img-element
    const logo = logoSrc && <img src={logoSrc} alt="Public AI Libraries Project" />;

    return (
        <header className={onBack ? 'lk-header lk-header--tool' : 'lk-header'}>
            <div className="lk-header__start">
                {logo && (logoHref ? (
                    <a className="lk-header__logo" href={logoHref} onClick={onLogoClick} aria-label="Home">{logo}</a>
                ) : (
                    <span className="lk-header__logo">{logo}</span>
                ))}
                {onBack && <Button variant="quiet" icon="back" className="lk-header__home" onClick={onBack}>Home</Button>}
            </div>
            <div className="lk-header__end">
                {title && (
                    <span className="lk-header__title">
                        {tool && <ToolShape tool={tool} size={28} />}
                        {title}
                    </span>
                )}
                {children && <span className="lk-header__wide lk-header__end">{children}</span>}
                {credits != null && <CreditBadge credits={credits} renewAt={renewAt} />}
                {hasAccountItems && (
                    <>
                        <span className="lk-header__wide lk-header__end">{accountItems(false)}</span>
                        <div ref={menuRef} className="lk-header__menu-wrap">
                            <IconButton
                                icon={menuOpen ? 'close' : 'menu'}
                                label={menuOpen ? 'Close menu' : 'Menu'}
                                className="lk-header__menu-btn"
                                aria-expanded={menuOpen}
                                onClick={() => setMenuOpen((open) => !open)}
                            />
                            {menuOpen && (
                                <div className="lk-header__menu" onClick={() => setMenuOpen(false)}>
                                    {children}
                                    {accountItems(true)}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </header>
    );
}
