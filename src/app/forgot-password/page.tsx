'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'username' | 'answer' | 'done';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('username');
    const [username, setUsername] = useState('');
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLookup = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Account recovery is not available.');
            setQuestion(data.question);
            setStep('answer');
        } catch (err) {
            setError(err instanceof Error ? err.message.toUpperCase() : 'LOOKUP FAILED');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('PASSWORDS DO NOT MATCH');
            return;
        }
        if (newPassword.length < 6) {
            setError('PASSWORD MUST BE AT LEAST 6 CHARACTERS');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), answer, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Reset failed.');
            setStep('done');
        } catch (err) {
            setError(err instanceof Error ? err.message.toUpperCase() : 'RESET FAILED');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <img src="/images/logo.svg" alt="Public AI" className="login-logo-img" />
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        RESET PASSWORD
                    </h1>
                </div>

                {error && <div className="login-error" style={{ marginBottom: '20px' }}>{error}</div>}

                {step === 'username' && (
                    <form className="login-form" onSubmit={handleLookup}>
                        <div className="form-group" style={{ marginBottom: '32px' }}>
                            <label className="form-label" htmlFor="fp-username">USERNAME</label>
                            <input
                                id="fp-username"
                                className="input"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="ENTER USERNAME"
                                autoFocus
                                required
                            />
                        </div>
                        <button className="btn btn-primary btn-lg" type="submit" disabled={loading || !username}
                            style={{ padding: '20px' }}>
                            {loading ? 'LOOKING UP...' : 'CONTINUE'}
                        </button>
                    </form>
                )}

                {step === 'answer' && (
                    <form className="login-form" onSubmit={handleReset}>
                        <div className="form-group">
                            <label className="form-label">SECURITY QUESTION</label>
                            <div style={{
                                padding: '12px 14px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-card)',
                                fontSize: '0.9rem',
                                color: 'var(--text-primary)',
                                marginBottom: '4px',
                            }}>
                                {question}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="fp-answer">YOUR ANSWER</label>
                            <input
                                id="fp-answer"
                                className="input"
                                type="text"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                autoComplete="off"
                                autoFocus
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="fp-new">NEW PASSWORD</label>
                            <input
                                id="fp-new"
                                className="input"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="MIN 6 CHARACTERS"
                                required
                                minLength={6}
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: '32px' }}>
                            <label className="form-label" htmlFor="fp-confirm">CONFIRM PASSWORD</label>
                            <input
                                id="fp-confirm"
                                className="input"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="RE-ENTER PASSWORD"
                                required
                                minLength={6}
                            />
                        </div>

                        <button className="btn btn-primary btn-lg" type="submit"
                            disabled={loading || !answer || !newPassword || !confirmPassword}
                            style={{ padding: '20px' }}>
                            {loading ? 'RESETTING...' : 'RESET PASSWORD'}
                        </button>
                    </form>
                )}

                {step === 'done' && (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '32px' }}>
                            PASSWORD RESET SUCCESSFULLY.
                        </p>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={() => router.push('/')}
                            style={{ padding: '20px', width: '100%' }}
                        >
                            GO TO LOGIN
                        </button>
                    </div>
                )}

                <p style={{
                    textAlign: 'center',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    marginTop: '32px'
                }}>
                    <a
                        href="/"
                        onClick={(e) => { e.preventDefault(); router.push('/'); }}
                        style={{ textDecoration: 'underline' }}
                    >
                        BACK TO LOGIN
                    </a>
                </p>
            </div>
        </div>
    );
}
