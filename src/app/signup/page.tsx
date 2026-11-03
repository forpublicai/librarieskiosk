'use client';

import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { SECURITY_QUESTIONS } from '@/lib/security';
import AuthLogo from '@/components/AuthLogo';
import FloatingThemeToggle from '@/components/FloatingThemeToggle';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import SelectField from '@/components/ui/SelectField';
import TextField from '@/components/ui/TextField';

const LIBRARIES = [
    'Pottsboro, TX',
    'Salem City, UT',
    'Public AI',
    'Tremonton, UT',
    'Sussex County, NJ',
    'Osterville, MA',
    'Salt Lake City, UT',
    'Grapevine, TX',
    'Adams Public Library, IN',
    'Jessamine County, KY',
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

    useEffect(() => {
        if (user) router.push('/dashboard');
    }, [user, router]);

    if (user) return null;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('The two passwords do not match.');
            return;
        }

        if (!library) {
            setError('Please choose your library.');
            return;
        }

        if (!securityQuestion) {
            setError('Please choose a security question.');
            return;
        }

        if (!securityAnswer.trim()) {
            setError('Please answer your security question.');
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
                throw new Error(data.error || 'Sign up failed');
            }

            await login(username.trim().toLowerCase(), password);
            router.push('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign up failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lk-auth-single">
            <FloatingThemeToggle />
            <div className="lk-auth-single__inner">
                <AuthLogo />
                <div>
                    <h1 className="lk-title">Create an account</h1>
                    <p className="lk-fine" style={{ marginTop: 'var(--space-2)' }}>
                        A library administrator approves each new account before you can use it.
                    </p>
                </div>

                {error && <Notice tone="danger" title="Your account was not created">{error}</Notice>}

                <form className="lk-form" onSubmit={handleSubmit}>
                    <SelectField
                        id="signup-library"
                        label="Your library"
                        placeholder="Choose your library"
                        options={LIBRARIES}
                        value={library}
                        onChange={(e) => setLibrary(e.target.value)}
                        required
                    />
                    <TextField
                        id="signup-username"
                        label="Username"
                        hint="3 to 30 characters."
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        required
                        minLength={3}
                        maxLength={30}
                    />
                    <TextField
                        id="signup-password"
                        label="Password"
                        hint="At least 6 characters."
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                    />
                    <TextField
                        id="signup-confirm"
                        label="Type the password again"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                    />
                    <SelectField
                        id="signup-question"
                        label="Security question"
                        placeholder="Choose a question"
                        options={SECURITY_QUESTIONS}
                        value={securityQuestion}
                        onChange={(e) => setSecurityQuestion(e.target.value)}
                        required
                    />
                    <TextField
                        id="signup-answer"
                        label="Your answer"
                        hint="You use this to reset your password. Capital letters do not matter."
                        type="text"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        autoComplete="off"
                        required
                    />
                    <Button
                        variant="primary"
                        size="lg"
                        block
                        type="submit"
                        disabled={loading || !username || !password || !confirmPassword || !library || !securityQuestion || !securityAnswer}
                    >
                        {loading ? 'Creating your account…' : 'Create account'}
                    </Button>
                </form>

                <p>
                    Already have an account? <Link className="lk-link" href="/">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
