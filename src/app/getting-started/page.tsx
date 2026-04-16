import Link from 'next/link';

export default function GettingStartedPage() {
  return (
    <div className="info-page">
      <header className="info-topbar">
        <a href="/">
          <img src="/images/lib-logo.png" alt="Public AI" className="info-topbar-logo" />
        </a>
        <nav className="info-topbar-nav">
          <a href="/getting-started" className="active">Get Started</a>
          <a href="/resources">Resources</a>
          <a href="/faqs">FAQs</a>
        </nav>
        <a href="/" className="info-topbar-back">← Back to Sign In</a>
      </header>

      <main className="info-content">
        <p className="info-eyebrow">Patron Guide</p>
        <h1 className="info-title">Welcome to the<br />Public AI Kiosk</h1>
        <p className="info-lead">
          This kiosk gives you free access to a suite of powerful AI tools — right here at your library.
          No technical expertise required. Just sign in or try it as a guest and start creating.
        </p>

        {/* What you can do */}
        <section className="info-section">
          <p className="info-section-title">What's Inside</p>
          <div className="info-feature-grid">
            <div className="info-feature-card">
              <span className="info-feature-card-icon">💬</span>
              <p className="info-feature-card-title">AI Chat</p>
              <p className="info-feature-card-desc">Ask questions, brainstorm ideas, get writing help, or just have a conversation with a state-of-the-art AI.</p>
            </div>
            <div className="info-feature-card">
              <span className="info-feature-card-icon">💻</span>
              <p className="info-feature-card-title">Code Assistant</p>
              <p className="info-feature-card-desc">Get coding help, debug your programs, or learn to write code in any language with AI guidance.</p>
            </div>
            <div className="info-feature-card">
              <span className="info-feature-card-icon">🖼️</span>
              <p className="info-feature-card-title">Image Generation</p>
              <p className="info-feature-card-desc">Turn your ideas into original images. Just describe what you want and the AI will create it.</p>
            </div>
            <div className="info-feature-card">
              <span className="info-feature-card-icon">🎵</span>
              <p className="info-feature-card-title">Music Creation</p>
              <p className="info-feature-card-desc">Generate original music in any style or mood from a simple text description.</p>
            </div>
            <div className="info-feature-card">
              <span className="info-feature-card-icon">🎬</span>
              <p className="info-feature-card-title">Video Generation</p>
              <p className="info-feature-card-desc">Create short AI-generated videos from text prompts — no camera or editing skills needed.</p>
            </div>
          </div>
        </section>

        {/* Account types */}
        <section className="info-section">
          <p className="info-section-title">Account Types</p>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-body">
                <p className="info-step-title">Personal Account (Recommended)</p>
                <p className="info-step-desc">
                  Create an account and ask your library administrator to approve it. Once approved,
                  your history and conversations are saved between visits. You start with
                  <strong> 100 credits</strong> that renew every week automatically.
                </p>
              </div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-body">
                <p className="info-step-title">Guest Account</p>
                <p className="info-step-desc">
                  No sign-up required — just click <em>Continue as Guest</em>. You get
                  <strong> 100 free credits</strong> to try everything. Guest sessions are temporary:
                  your history is not saved when you leave.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How to get started */}
        <section className="info-section">
          <p className="info-section-title">How to Get Started</p>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-body">
                <p className="info-step-title">Create an Account</p>
                <p className="info-step-desc">Click <strong>Create an Account</strong> on the sign-in screen and choose a username and password.</p>
              </div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-body">
                <p className="info-step-title">Get Approved</p>
                <p className="info-step-desc">Let your librarian know you signed up. They will approve your account, usually during your visit.</p>
              </div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-body">
                <p className="info-step-title">Sign In & Explore</p>
                <p className="info-step-desc">Log in with your credentials and pick any tool from the dashboard. On future visits, just sign in and pick up where you left off.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Credits */}
        <section className="info-section">
          <p className="info-section-title">Credits</p>
          <div className="info-credit-box">
            <div className="info-credit-stat">
              <span className="info-credit-stat-value">100</span>
              <span className="info-credit-stat-label">Starting credits</span>
            </div>
            <div className="info-credit-stat">
              <span className="info-credit-stat-value">Weekly</span>
              <span className="info-credit-stat-label">Auto-renewal</span>
            </div>
            <div className="info-credit-stat">
              <span className="info-credit-stat-value">Free</span>
              <span className="info-credit-stat-label">Cost to you</span>
            </div>
          </div>
          <p style={{ marginTop: '20px', fontSize: '0.88rem', lineHeight: '1.7', color: 'var(--text-secondary)' }}>
            Credits are used for image, music, and video generation. Chat and coding are always free.
            Your credits reset every week automatically. If you need more to finish a project, speak
            with your librarian — they can top you up from the library&apos;s credit pool.
          </p>
        </section>
      </main>
    </div>
  );
}
