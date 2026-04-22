'use client';

import { useState, FormEvent, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import { refreshMediaUrl } from '@/lib/mediaClient';
import { useGenerationProgress, formatElapsed } from '@/hooks/useGenerationProgress';
import { loadGuestState, saveGuestState } from '@/lib/guestSession';

const VIDEO_PROGRESS_MESSAGES = [
    'Submitting to the video model…',
    'Planning the scene…',
    'Generating keyframes…',
    'Filling in motion between frames…',
    'Rendering frames…',
    'Compositing video…',
    'Encoding final output…',
    'Uploading to your library…',
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

const GUEST_KEY = 'video';

interface GuestVideoState {
    videoUrl: string | null;
    sessions: SessionItem[];
}

export default function VideoPage() {
    const { user, token, refreshUser, isLoading } = useAuth();
    const router = useRouter();
    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState(5);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [error, setError] = useState('');
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isGuest = user?.role === 'GUEST';
    const hydratedRef = useRef(false);
    const lastPromptRef = useRef<string>('');
    const progress = useGenerationProgress({
        active: loading,
        messages: VIDEO_PROGRESS_MESSAGES,
        intervalSec: 5,
    });

    const creditCost = Math.round((duration / 10) * 25);

    useEffect(() => {
        if (!isLoading && !user) router.push('/');
    }, [user, isLoading, router]);

    useEffect(() => {
        if (token && !isGuest) loadSessions();
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [token, isGuest]);

    useEffect(() => {
        if (!user || hydratedRef.current) return;
        hydratedRef.current = true;
        if (user.role === 'GUEST') {
            const saved = loadGuestState<GuestVideoState>(GUEST_KEY);
            if (saved) {
                if (saved.videoUrl) setVideoUrl(saved.videoUrl);
                if (saved.sessions?.length) setSessions(saved.sessions);
            }
        }
    }, [user]);

    useEffect(() => {
        if (!isGuest || !hydratedRef.current) return;
        saveGuestState<GuestVideoState>(GUEST_KEY, { videoUrl, sessions });
    }, [isGuest, videoUrl, sessions]);

    const loadSessions = async () => {
        try {
            const res = await fetch('/api/media-sessions?mode=video', {
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
        if (fresh?.url) setVideoUrl(fresh.url);
    }, [currentSessionId, token]);

    const pollStatus = async (id: string) => {
        try {
            const res = await fetch(`/api/video/status?runId=${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to check status');
            const data = await res.json();
            const normalizedStatus = String(data.status || '').toUpperCase();
            if (normalizedStatus === 'COMPLETED' && data.videoUrl) {
                // videoUrl here is already presigned by the server when R2 is enabled
                setVideoUrl(data.videoUrl);
                if (data.mediaSessionId) setCurrentSessionId(data.mediaSessionId);
                setLoading(false);
                setStatus('');
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                if (isGuest) {
                    const item: SessionItem = {
                        id: `guest_${Date.now()}`,
                        prompt: lastPromptRef.current || '',
                        url: data.videoUrl,
                        createdAt: new Date().toISOString(),
                    };
                    setSessions((prev) => [item, ...prev].slice(0, 20));
                } else {
                    await loadSessions();
                }
                await refreshUser();
            } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELED') {
                throw new Error(data.error || 'Video generation failed');
            } else {
                setStatus(`Generating... stage: ${normalizedStatus || 'IN_PROGRESS'}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Polling failed');
            setLoading(false);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
    };

    const handleGenerate = async (e: FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || loading) return;
        setLoading(true);
        setError('');
        setVideoUrl(null);
        setCurrentSessionId(null);
        setStatus('Submitting request...');
        lastPromptRef.current = prompt.trim();
        try {
            const res = await fetch('/api/video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ prompt: prompt.trim(), duration }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Video generation failed');
            }
            const data = await res.json();
            const generationId = data.runId || data.id || data.requestId;
            if (data.mediaSessionId) setCurrentSessionId(data.mediaSessionId);
            if (generationId) {
                setStatus('Generation started...');
                pollIntervalRef.current = setInterval(() => pollStatus(generationId), 5000);
            } else {
                throw new Error('No generation ID returned');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setLoading(false);
        }
    };

    if (isLoading || !user) return null;

    return (
        <div className="page-container">
            <Header title="Videos" />

            <div className="gen-container">
                <aside className="gen-sidebar">
                    <h2 className="form-label" style={{ marginBottom: '20px' }}>History</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sessions.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No videos generated yet.
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
                                    // Set ID immediately so refresh handler knows which session
                                    setCurrentSessionId(s.id);
                                    // Legacy rows may have a direct url; R2-backed rows need a
                                    // presigned URL fetched on-demand.
                                    if (s.url) {
                                        setVideoUrl(s.url);
                                        return;
                                    }
                                    if (s.hasObject && token) {
                                        const fresh = await refreshMediaUrl(s.id, token);
                                        if (fresh?.url) setVideoUrl(fresh.url);
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
                            <label className="form-label">Describe the video you want to create</label>
                            <div style={{ display: 'flex' }}>
                                <input
                                    className="input"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="A drone shot of a tropical island..."
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

                            <div className="duration-slider">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label className="form-label" style={{ margin: 0 }}>Duration: {duration}s</label>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                        Cost: {creditCost} {creditCost === 1 ? 'credit' : 'credits'}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={3}
                                    max={15}
                                    step={1}
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                    disabled={loading}
                                    className="slider"
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    <span>3s</span>
                                    <span>15s</span>
                                </div>
                            </div>
                        </form>

                        {error && <div className="gen-error" style={{ marginBottom: '20px' }}>{error}</div>}

                        <div className="gen-result-area">
                            {loading && (
                                <div className="gen-loading">
                                    <div className="gen-spinner" />
                                    <div className="gen-loading-text">{progress.message}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                                        {formatElapsed(progress.elapsedSec)} elapsed · typically 1–4 minutes
                                    </div>
                                    {status && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                                            {status}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!loading && videoUrl && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%', padding: '24px' }}>
                                    <video
                                        src={videoUrl}
                                        controls
                                        loop
                                        preload="metadata"
                                        playsInline
                                        onError={refreshMainUrl}
                                        style={{ maxWidth: '100%', maxHeight: '500px', border: '1px solid var(--border-color)' }}
                                    />
                                    <a
                                        href={videoUrl}
                                        download="generated-video.mp4"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn"
                                    >
                                        Download Video
                                    </a>
                                </div>
                            )}

                            {!loading && !videoUrl && !error && (
                                <div className="gen-empty">
                                    <div className="gen-empty-icon">🎬</div>
                                    <div className="gen-empty-text">Your generated video will appear here</div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
