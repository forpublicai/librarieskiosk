'use client';

import { useState, FormEvent, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import { refreshMediaUrl } from '@/lib/mediaClient';
import { useGenerationProgress, formatElapsed } from '@/hooks/useGenerationProgress';
import { loadGuestState, saveGuestState } from '@/lib/guestSession';

const MUSIC_PROGRESS_MESSAGES = [
    'Reading your prompt…',
    'Picking a key and tempo…',
    'Arranging instrumentation…',
    'Laying down the groove…',
    'Mixing layers together…',
    'Mastering the track…',
    'Almost done — final polish…',
];

interface SessionItem {
    id: string;
    prompt: string;
    url: string | null;
    hasObject?: boolean;
    mimeType?: string | null;
    storageStatus?: string | null;
    createdAt: string;
}

const GUEST_KEY = 'music';

interface GuestMusicState {
    audioUrl: string | null;
    sessions: SessionItem[];
}

export default function MusicPage() {
    const { user, token, refreshUser, isLoading } = useAuth();
    const router = useRouter();
    const [prompt, setPrompt] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [instrumental, setInstrumental] = useState(false);
    const [duration, setDuration] = useState(10);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const isGuest = user?.role === 'GUEST';
    const hydratedRef = useRef(false);
    const progress = useGenerationProgress({
        active: loading,
        messages: MUSIC_PROGRESS_MESSAGES,
        intervalSec: 3.5,
    });

    const creditCost = Math.round((duration / 10) * 5);

    useEffect(() => {
        if (!isLoading && !user) router.push('/');
    }, [user, isLoading, router]);

    useEffect(() => {
        if (token && !isGuest) loadSessions();
    }, [token, isGuest]);

    useEffect(() => {
        if (!user || hydratedRef.current) return;
        hydratedRef.current = true;
        if (user.role === 'GUEST') {
            const saved = loadGuestState<GuestMusicState>(GUEST_KEY);
            if (saved) {
                if (saved.audioUrl) setAudioUrl(saved.audioUrl);
                if (saved.sessions?.length) setSessions(saved.sessions);
            }
        }
    }, [user]);

    useEffect(() => {
        if (!isGuest || !hydratedRef.current) return;
        saveGuestState<GuestMusicState>(GUEST_KEY, { audioUrl, sessions });
    }, [isGuest, audioUrl, sessions]);

    const loadSessions = async () => {
        try {
            const res = await fetch('/api/media-sessions?mode=music', {
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
        if (fresh?.url) setAudioUrl(fresh.url);
    }, [currentSessionId, token]);

    const handleGenerate = async (e: FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || loading) return;

        setLoading(true);
        setError('');
        setAudioUrl(null);
        setCurrentSessionId(null);

        try {
            const res = await fetch('/api/music', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    lyrics: instrumental ? undefined : lyrics.trim() || undefined,
                    duration,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Music generation failed');
            }

            const data = await res.json();
            // R2 path returns { mediaSessionId, audioUrl, mimeType, storageStatus }
            // Legacy path returns { audioUrl } (data URL or direct provider URL)
            const url = data.audioUrl || data.url;
            if (url) {
                setAudioUrl(url);
                if (data.mediaSessionId) setCurrentSessionId(data.mediaSessionId);
                if (isGuest) {
                    const item: SessionItem = {
                        id: `guest_${Date.now()}`,
                        prompt: prompt.trim(),
                        url,
                        createdAt: new Date().toISOString(),
                    };
                    setSessions((prev) => [item, ...prev].slice(0, 20));
                } else {
                    await loadSessions();
                }
                await refreshUser();
            } else {
                throw new Error('No audio URL returned');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return null;

    return (
        <div className="page-container">
            <Header title="Music" />

            <div className="gen-container">
                <aside className="gen-sidebar">
                    <h2 className="form-label" style={{ marginBottom: '20px' }}>History</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sessions.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No music generated yet.
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
                                        setAudioUrl(s.url);
                                        return;
                                    }
                                    if (s.hasObject && token) {
                                        const fresh = await refreshMediaUrl(s.id, token);
                                        if (fresh?.url) setAudioUrl(fresh.url);
                                    }
                                }}
                            >
                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.prompt}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {new Date(s.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="gen-main">
                    <div style={{ width: '100%', maxWidth: '800px' }}>
                        <form className="gen-prompt-area" onSubmit={handleGenerate}>
                            <div className="form-group">
                                <label className="form-label">Style &amp; Mood</label>
                                <input
                                    className="input"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="e.g., 90s hip hop with lo-fi vibes..."
                                    disabled={loading}
                                    autoFocus
                                />
                            </div>

                            {!instrumental && (
                                <div className="form-group">
                                    <label className="form-label">Lyrics (optional)</label>
                                    <textarea
                                        className="input"
                                        style={{ height: '120px', resize: 'none' }}
                                        value={lyrics}
                                        onChange={(e) => setLyrics(e.target.value)}
                                        placeholder="Enter lyrics or leave blank for AI-generated..."
                                        disabled={loading}
                                    />
                                </div>
                            )}

                            <div className="duration-slider">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label className="form-label" style={{ margin: 0 }}>Duration: {duration}s</label>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                        Cost: {creditCost} {creditCost === 1 ? 'credit' : 'credits'}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={10}
                                    max={300}
                                    step={1}
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                    disabled={loading}
                                    className="slider"
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    <span>10s</span>
                                    <span>5m</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={instrumental}
                                        onChange={(e) => setInstrumental(e.target.checked)}
                                        disabled={loading}
                                    />
                                    Instrumental Only
                                </label>

                                <button
                                    className="btn btn-primary"
                                    type="submit"
                                    disabled={loading || !prompt.trim()}
                                    style={{ padding: '14px 40px' }}
                                >
                                    {loading ? '...' : 'Generate Music'}
                                </button>
                            </div>
                        </form>

                        {error && <div className="gen-error" style={{ marginBottom: '20px' }}>{error}</div>}

                        <div className="gen-result-area" style={{ minHeight: '250px' }}>
                            {loading && (
                                <div className="gen-loading">
                                    <div className="gen-spinner" />
                                    <div className="gen-loading-text">{progress.message}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                                        {formatElapsed(progress.elapsedSec)} elapsed · typically 30–60s
                                    </div>
                                </div>
                            )}

                            {!loading && audioUrl && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%', padding: '24px' }}>
                                    <audio
                                        src={audioUrl}
                                        controls
                                        preload="metadata"
                                        onError={refreshMainUrl}
                                        style={{ width: '100%', maxWidth: '600px' }}
                                    />
                                    <a
                                        href={audioUrl}
                                        download="generated-track.mp3"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn"
                                    >
                                        Download Audio
                                    </a>
                                </div>
                            )}

                            {!loading && !audioUrl && !error && (
                                <div className="gen-empty">
                                    <div className="gen-empty-icon">🎵</div>
                                    <div className="gen-empty-text">Your audio track will appear here</div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
