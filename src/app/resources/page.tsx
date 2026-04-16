export default function ResourcesPage() {
  return (
    <div className="info-page">
      <header className="info-topbar">
        <a href="/">
          <img src="/images/lib-logo.png" alt="Public AI" className="info-topbar-logo" />
        </a>
        <nav className="info-topbar-nav">
          <a href="/getting-started">Get Started</a>
          <a href="/resources" className="active">Resources</a>
          <a href="/faqs">FAQs</a>
        </nav>
        <a href="/" className="info-topbar-back">← Back to Sign In</a>
      </header>

      <div className="under-construction">
        <span className="under-construction-icon">🚧</span>
        <p className="under-construction-title">Under Construction</p>
        <p className="under-construction-sub">Resources are being prepared. Check back soon.</p>
      </div>
    </div>
  );
}
