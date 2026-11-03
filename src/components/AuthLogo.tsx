/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';

/** The Public AI lockup for signed-out pages: lib-logo.png in Light, logo.svg in Dark. */
export default function AuthLogo({ href = '/' }: { href?: string }) {
    return (
        <Link className="lk-auth__logo lk-header__logo" href={href} aria-label="Public AI Libraries Project, back to sign in">
            <img src="/images/lib-logo.png" alt="" className="lk-logo-light" />
            <img src="/images/logo.svg" alt="" className="lk-logo-dark" />
        </Link>
    );
}
