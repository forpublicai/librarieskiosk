import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function ResourcesPage() {
  return (
    <div className="info-page">
      <header className="info-topbar">
        <Link href="/">
          <img src="/images/lib-logo.png" alt="Public AI" className="info-topbar-logo" />
        </Link>
        <nav className="info-topbar-nav">
          <Link href="/getting-started">Get Started</Link>
          <Link href="/resources" className="active">Resources</Link>
          <Link href="/faqs">FAQs</Link>
        </nav>
        <div className="info-topbar-actions">
          <Link href="/" className="info-topbar-back">← Back to Sign In</Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="under-construction">
        <span className="under-construction-icon">🚧</span>
        <p className="under-construction-title">Under Construction</p>
        <p className="under-construction-sub">Resources are being prepared. Check back soon.</p>
      </div>
    </div>
  );
}
