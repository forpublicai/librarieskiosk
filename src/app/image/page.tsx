'use client';

import { useState, FormEvent, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import { refreshMediaUrl } from '@/lib/mediaClient';
import { useGenerationProgress, formatElapsed } from '@/hooks/useGenerationProgress';

const IMAGE_PROGRESS_MESSAGES = [
    'Parsing your prompt…',
    'Planning composition…',
    'Blocking out shapes…',
    'Sketching rough layout…',
    'Rendering fine details…',
    'Refining color and light…',
    'Almost there — final touches…',
];

interface SessionItem {
    id: string;
    prompt: string;
    url: string | null;
    thumbnailUrl?: string | null;
    hasObject?: boolean;
    mimeType?: string | null;
    storageStatus?: string | null;
    createdAt: string;
}

export default function ImagePage() {
    const { user, token, refreshUser, isLoading } = useAuth();
    const router = useRouter();
    const [prompt, setPrompt] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const progress = useGenerationProgress({
        active: loading,
        messages: IMAGE_PROGRESS_MESSAGES,
    });

    useEffect(() => {
        if (!isLoading && !user) router.push('/');
    }, [user, isLoading, router]);

    useEffect(() => {
        if (token) loadSessions();
    }, [token]);

    const loadSessions = async () => {
        try {
            const res = await fetch('/api/media-sessions?mode=image', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(data.sessions);
            }
        } catch { /* ignore */ }
    };

    const refreshMainUrl = useCallback(async () => {
        if (!currentSessionId || !token) return;
        const fresh = await refreshMediaUrl(currentSessionId, token, { force: true });
        if (fresh?.url) setImageUrl(fresh.url);
    }, [currentSessionId, token]);

    const refreshSessionItemUrl = useCallback(
        async (id: string) => {
            if (!token) return;
            const fresh = await refreshMediaUrl(id, token, { force: true });
            if (fresh?.url) {
                setSessions((prev) =>
                    prev.map((s) =>
                        s.id === id
                            ? { ...s, url: fresh.url, thumbnailUrl: fresh.thumbnailUrl ?? s.thumbnailUrl }
                            : s
                    )
                );
            }
        },
        [token]
    );

    const handleGenerate = async (e: FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || loading) return;

        setLoading(true);
        setError('');
        setImageUrl(null);
        setCurrentSessionId(null);

        try {
            const res = await fetch('/api/image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ prompt: prompt.trim() }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Image generation failed');
            }

            const data = await res.json();
            // R2 path returns { mediaSessionId, url, mimeType, storageStatus }
            // Legacy path returns { url, b64_json }
            if (data.url) {
                setImageUrl(data.url);
            } else if (data.b64_json) {
                setImageUrl(`data:image/png;base64,${data.b64_json}`);
            } else {
                throw new Error('No image returned');
            }

            if (data.mediaSessionId) setCurrentSessionId(data.mediaSessionId);

            await loadSessions();
            await refreshUser();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return null;

    return (
        <div className="page-container">
            <Header title="Images" />

            <div className="gen-container">
                <aside className="gen-sidebar">
                    <h2 className="form-label" style={{ marginBottom: '20px' }}>History</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sessions.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No images generated yet.
                            </p>
                        )}
                        {sessions.map((s) => (
                            <div
                                key={s.id}
                                style={{
                                    cursor: 'pointer',
                                    border: '1px solid var(--border-color)',
                                    padding: '10px',
                                    background: 'var(--bg-card)',
                                    transition: 'background 0.2s',
                                }}
                                onClick={async () => {
                                    setCurrentSessionId(s.id);
                                    if (s.url) {
                                        setImageUrl(s.url);
                                        return;
                                    }
                                    // R2-backed rows don't embed a full URL in the list;
                                    // fetch the presigned URL on demand.
                                    if (s.hasObject && token) {
                                        const fresh = await refreshMediaUrl(s.id, token);
                                        if (fresh?.url) setImageUrl(fresh.url);
                                    }
                                }}
                            >
                                {(s.thumbnailUrl || s.url) && (
                                    <img
                                        src={s.thumbnailUrl || s.url || undefined}
                                        alt={s.prompt}
                                        loading="lazy"
                                        decoding="async"
                                        style={{
                                            width: '100%',
                                            maxHeight: '110px',
                                            objectFit: 'cover',
                                            marginBottom: '8px',
                                        }}
                                        onError={() => refreshSessionItemUrl(s.id)}
                                    />
                                )}
                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.prompt}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="gen-main">
                    <div style={{ width: '100%', maxWidth: '800px' }}>
                        <form className="gen-prompt-area" onSubmit={handleGenerate}>
                            <label className="form-label">Describe the image you want to create</label>
                            <div style={{ display: 'flex' }}>
                                <input
                                    className="input"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="A serene lake at sunset with mountains..."
                                    disabled={loading}
                                    autoFocus
                                    style={{ flex: 1, borderRight: 'none' }}
                                />
                                <button
                                    className="btn btn-primary"
                                    type="submit"
                                    disabled={loading || !prompt.trim()}
                                    style={{ padding: '14px 32px' }}
                                >
                                    {loading ? '...' : 'Generate'}
                                </button>
                            </div>
                        </form>

                        {error && <div className="gen-error" style={{ marginBottom: '20px' }}>{error}</div>}

                        <div className="gen-result-area">
                            {loading && (
                                <div className="gen-loading">
                                    <div className="gen-spinner" />
                                    <div className="gen-loading-text">{progress.message}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                                        {formatElapsed(progress.elapsedSec)} elapsed · typically 10–30s
                                    </div>
                                </div>
                            )}

                            {!loading && imageUrl && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%', padding: '24px' }}>
                                    <img
                                        src={imageUrl}
                                        alt="Generated image"
                                        className="gen-image-result"
                                        onError={refreshMainUrl}
                                    />
                                    <a
                                        href={imageUrl}
                                        download="generated-image.png"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn"
                                    >
                                        Download Image
                                    </a>
                                </div>
                            )}

                            {!loading && !imageUrl && !error && (
                                <div className="gen-empty">
                                    <div className="gen-empty-icon">🎨</div>
                                    <div className="gen-empty-text">Your generated image will appear here</div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
