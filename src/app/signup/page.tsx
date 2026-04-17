'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { SECURITY_QUESTIONS } from '@/lib/security';

const LIBRARIES = [
    'Pottsboro, TX',
    'Salem City, UT',
    'Public AI',
];

export default function SignupPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [library, setLibrary] = useState('');
    const [securityQuestion, setSecurityQuestion] = useState('');
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { user, login } = useAuth();
    const router = useRouter();

    if (user) {
        router.push('/dashboard');
        return null;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('PASSWORDS DO NOT MATCH');
            return;
        }

        if (!library) {
            setError('PLEASE SELECT A LIBRARY');
            return;
        }

        if (!securityQuestion) {
            setError('PLEASE SELECT A SECURITY QUESTION');
            return;
        }

        if (!securityAnswer.trim()) {
            setError('PLEASE PROVIDE A SECURITY ANSWER');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username.trim(),
                    password,
                    library,
                    securityQuestion,
                    securityAnswer,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'SIGN UP FAILED');
            }

            await login(username.trim().toLowerCase(), password);
            router.push('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'SIGN UP FAILED');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <img src="/images/logo.svg" alt="Public AI" className="login-logo-img" />
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase' }}>JOIN THE NETWORK</h1>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && <div className="login-error" style={{ marginBottom: '20px' }}>{error}</div>}

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-library">LIBRARY LOCATION</label>
                        <select
                            id="signup-library"
                            className="input"
                            value={library}
                            onChange={(e) => setLibrary(e.target.value)}
                            required
                        >
                            <option value="">SELECT YOUR LIBRARY...</option>
                            {LIBRARIES.map((lib) => (
                                <option key={lib} value={lib}>{lib.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-username">USERNAME</label>
                        <input
                            id="signup-username"
                            className="input"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="CHOOSE A USERNAME"
                            required
                            minLength={3}
                            maxLength={30}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-password">PASSWORD</label>
                        <input
                            id="signup-password"
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="MIN 6 CHARACTERS"
                            required
                            minLength={6}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-confirm">CONFIRM PASSWORD</label>
                        <input
                            id="signup-confirm"
                            className="input"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="RE-ENTER PASSWORD"
                            required
                            minLength={6}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="signup-question">SECURITY QUESTION</label>
                        <select
                            id="signup-question"
                            className="input"
                            value={securityQuestion}
                            onChange={(e) => setSecurityQuestion(e.target.value)}
                            required
                        >
                            <option value="">SELECT A QUESTION...</option>
                            {SECURITY_QUESTIONS.map((q) => (
                                <option key={q} value={q}>{q.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: '40px' }}>
                        <label className="form-label" htmlFor="signup-answer">SECURITY ANSWER</label>
                        <input
                            id="signup-answer"
                            className="input"
                            type="text"
                            value={securityAnswer}
                            onChange={(e) => setSecurityAnswer(e.target.value)}
                            placeholder="YOUR ANSWER"
                            autoComplete="off"
                            required
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                            USED TO RECOVER YOUR PASSWORD. NOT CASE-SENSITIVE.
                        </span>
                    </div>

                    <button
                        className="btn btn-primary btn-lg"
                        type="submit"
                        disabled={loading || !username || !password || !confirmPassword || !library || !securityQuestion || !securityAnswer}
                        style={{ padding: '20px' }}
                    >
                        {loading ? 'CREATING...' : 'REQUEST ACCESS'}
                    </button>

                    <p style={{
                        textAlign: 'center',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        color: 'var(--text-muted)',
                        marginTop: '20px'
                    }}>
                        ACCOUNTS REQUIRE ADMINISTRATOR APPROVAL.
                    </p>

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
                            GO TO LOGIN
                        </a>
                    </p>
                </form>
            </div>
        </div>
    );
}
