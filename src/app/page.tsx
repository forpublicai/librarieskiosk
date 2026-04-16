'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginAsGuest, user } = useAuth();
  const router = useRouter();

  if (user) {
    router.push('/dashboard');
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginAsGuest();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-root">
      <div className="landing-main">
        {/* Left: branding + nav */}
        <div className="landing-hero-inner">
          <img src="/images/lib-logo.png" alt="Public AI" className="landing-logo-img" />

          <nav className="landing-nav">
            <a href="/getting-started" className="landing-nav-link">Get Started</a>
            <a href="/resources" className="landing-nav-link">Resources</a>
            <a href="/faqs" className="landing-nav-link">FAQs</a>
          </nav>

          <a
            href="https://publicai.network/libraries.html"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-learn-more"
          >
            Learn more about the program
          </a>
        </div>

        {/* Right: floating login card */}
        <div className="landing-login-panel">
          <div className="landing-login-card">
            {error && <div className="login-error" style={{ marginBottom: '16px' }}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="landing-field">
                <label className="landing-label" htmlFor="username">USERNAME</label>
                <input
                  id="username"
                  className="landing-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ENTER USERNAME"
                  autoFocus
                  required
                />
              </div>

              <div className="landing-field">
                <label className="landing-label" htmlFor="password">PASSWORD</label>
                <input
                  id="password"
                  className="landing-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="ENTER PASSWORD"
                  required
                />
              </div>

              <button
                className="landing-signin-btn"
                type="submit"
                disabled={loading || !username || !password}
              >
                {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
              </button>
            </form>

            <p className="landing-create-account">
              <a href="/signup">CREATE AN ACCOUNT</a>
            </p>

            <div className="landing-guest-divider" />

            <button
              className="landing-guest-btn"
              type="button"
              onClick={handleGuestLogin}
              disabled={loading}
            >
              <span className="landing-guest-icon">👤</span>
              {loading ? 'LOADING...' : 'CONTINUE AS GUEST'}
            </button>
            <p className="landing-guest-note">100 FREE CREDITS · NO ACCOUNT NEEDED</p>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <span>           <a href="https://publicai.network/" target="_blank" rel="noopener noreferrer">
              &copy; 2026 Public AI Libraries Project
            </a>
          </span>
      </footer>
    </div>
  );
}
