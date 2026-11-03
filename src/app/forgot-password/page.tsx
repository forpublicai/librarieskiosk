'use client';

import Link from 'next/link';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import AuthLogo from '@/components/AuthLogo';
import FloatingThemeToggle from '@/components/FloatingThemeToggle';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import TextField from '@/components/ui/TextField';

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
            setError(err instanceof Error ? err.message : 'Lookup failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('The two passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            setError('The password must have at least 6 characters.');
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
            setError(err instanceof Error ? err.message : 'Reset failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lk-auth-single">
            <FloatingThemeToggle />
            <div className="lk-auth-single__inner">
                <AuthLogo />
                <h1 className="lk-title">Reset your password</h1>

                {error && <Notice tone="danger" title="Your password was not reset">{error}</Notice>}

                {step === 'username' && (
                    <form className="lk-form" onSubmit={handleLookup}>
                        <TextField
                            id="fp-username"
                            label="Username"
                            hint="Next, you answer the security question you chose when you signed up."
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            autoFocus
                            required
                        />
                        <Button variant="primary" size="lg" block type="submit" disabled={loading || !username}>
                            {loading ? 'Looking up…' : 'Continue'}
                        </Button>
                    </form>
                )}

                {step === 'answer' && (
                    <form className="lk-form" onSubmit={handleReset}>
                        <div className="lk-field">
                            <span className="lk-field__label">Your security question</span>
                            <p className="lk-question">{question}</p>
                        </div>
                        <TextField
                            id="fp-answer"
                            label="Your answer"
                            hint="Capital letters do not matter."
                            type="text"
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            autoComplete="off"
                            autoFocus
                            required
                        />
                        <TextField
                            id="fp-new"
                            label="New password"
                            hint="At least 6 characters."
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            minLength={6}
                        />
                        <TextField
                            id="fp-confirm"
                            label="Type the new password again"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            minLength={6}
                        />
                        <Button
                            variant="primary"
                            size="lg"
                            block
                            type="submit"
                            disabled={loading || !answer || !newPassword || !confirmPassword}
                        >
                            {loading ? 'Resetting…' : 'Reset password'}
                        </Button>
                    </form>
                )}

                {step === 'done' && (
                    <>
                        <Notice tone="success" title="Your password is reset">
                            You can now sign in with your new password.
                        </Notice>
                        <Button variant="primary" size="lg" block onClick={() => router.push('/')}>
                            Go to sign in
                        </Button>
                    </>
                )}

                {step !== 'done' && (
                    <p>
                        Remember it now? <Link className="lk-link" href="/">Back to sign in</Link>
                    </p>
                )}
            </div>
        </div>
    );
}
