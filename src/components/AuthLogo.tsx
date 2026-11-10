/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';

/** The Public AI Libraries Project logo for signed-out pages. */
export default function AuthLogo({ href = '/' }: { href?: string }) {
    return (
        <Link className="lk-auth__logo lk-header__logo" href={href} aria-label="Public AI Libraries Project, back to sign in">
            <img src="/images/lib-logo.png" alt="" />
        </Link>
    );
}
