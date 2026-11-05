'use client';

import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import FloatingThemeToggle from '@/components/FloatingThemeToggle';
import Button, { ButtonLink } from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import TextField from '@/components/ui/TextField';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginAsGuest, user } = useAuth();
  const router = useRouter();

  // Redirect in an effect, not during render, so React does not warn about a
  // router update while rendering.
  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  if (user) return null;

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
    <div className="lk-auth">
      <FloatingThemeToggle />

      <section className="lk-auth__brand">
        <span className="lk-auth__logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/lib-logo.png" alt="Public AI Libraries Project" className="lk-logo-light" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.svg" alt="Public AI Libraries Project" className="lk-logo-dark" />
        </span>
        <p className="lk-lead" style={{ margin: 0 }}>
          Chat, make pictures, music and video, or write code. Sign in, or start right away as a guest.
        </p>
        <nav className="lk-auth__nav" aria-label="Help">
          <ButtonLink variant="quiet" icon="help" href="/getting-started">Get started</ButtonLink>
          <ButtonLink variant="quiet" href="/resources">Resources</ButtonLink>
          <ButtonLink variant="quiet" href="/faqs">FAQs</ButtonLink>
        </nav>
        <a className="lk-link" href="https://publicai.network/libraries.html" target="_blank" rel="noopener noreferrer">
          Learn more about the program
        </a>
      </section>

      <section className="lk-auth__panel" aria-labelledby="sign-in-title">
        <h1 id="sign-in-title" className="lk-title">Sign in</h1>

        {error && <Notice tone="danger" title="You could not sign in">{error}</Notice>}

        <form className="lk-form" onSubmit={handleSubmit}>
          <TextField
            id="username"
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Button variant="primary" size="lg" block type="submit" disabled={loading || !username || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="lk-auth__links">
          <Link className="lk-link" href="/signup">Create an account</Link>
          <Link className="lk-link" href="/forgot-password">Forgot your password?</Link>
        </div>

        <p className="lk-divider">or</p>

        <Button variant="secondary" size="lg" block icon="user" onClick={handleGuestLogin} disabled={loading}>
          {loading ? 'Starting…' : 'Continue as guest'}
        </Button>
        <p className="lk-fine">100 free credits. No account needed. Your work is not saved when you leave.</p>

        <p className="lk-auth__footer">
          <a className="lk-link" href="https://publicai.network/" target="_blank" rel="noopener noreferrer">
            &copy; 2026 Public AI Libraries Project
          </a>
        </p>
      </section>
    </div>
  );
}
