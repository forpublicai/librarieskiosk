'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import GuidePanel from '@/components/GuidePanel';
import CoachmarkTour from '@/components/CoachmarkTour';
import GenerationWait from '@/components/GenerationWait';
import HistoryList from '@/components/HistoryList';
import ToolLayout from '@/components/ToolLayout';
import Button from '@/components/ui/Button';
import ChatMessage from '@/components/ui/ChatMessage';
import Chip from '@/components/ui/Chip';
import Composer from '@/components/ui/Composer';
import Notice from '@/components/ui/Notice';
import { calculateCredits, formatCredits } from '@/lib/creditCosts';
import { refreshMediaUrl, downloadMedia } from '@/lib/mediaClient';
import { useGenerationProgress } from '@/hooks/useGenerationProgress';
import { loadGuestState, saveGuestState } from '@/lib/guestSession';
import modelConfig from '@/config/models.json';

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

const VIDEO_CHIPS = [
    'Waves crashing on a beach at sunset',
    'A butterfly landing on a flower',
];

const VIDEO_LENGTHS = [6, 10];

interface GuestVideoState {
    videoUrl: string | null;
    sessions: SessionItem[];
}

export default function VideoPage() {
    const { user, token, refreshUser, isLoading } = useAuth();
    const router = useRouter();
    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState(6);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [error, setError] = useState('');
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [guideOpen, setGuideOpen] = useState(false);
    // The prompt behind the clip on screen, shown as the patron's bubble.
    const [resultPrompt, setResultPrompt] = useState<string | null>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isGuest = user?.role === 'GUEST';
    const hydratedRef = useRef(false);
    const lastPromptRef = useRef<string>('');
    const progress = useGenerationProgress({
        active: loading,
        messages: VIDEO_PROGRESS_MESSAGES,
        intervalSec: 5,
    });

    const creditCost = calculateCredits('video', duration);

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

    const handleDownload = useCallback(() => downloadMedia({
        sessionId: currentSessionId,
        token,
        fallbackUrl: videoUrl,
        fallbackFilename: 'generated-video.mp4',
        mode: 'video',
    }), [videoUrl, currentSessionId, token]);

    const handleDeleteSession = useCallback(async (id: string) => {
        if (id.startsWith('guest_')) {
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (currentSessionId === id) { setCurrentSessionId(null); setVideoUrl(null); setResultPrompt(null); }
            return;
        }
        await fetch(`/api/media-sessions/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (currentSessionId === id) { setCurrentSessionId(null); setVideoUrl(null); setResultPrompt(null); }
    }, [token, currentSessionId]);

    const selectSession = async (s: SessionItem) => {
        setCurrentSessionId(s.id);
        setResultPrompt(s.prompt);
        setError('');
        if (s.url) { setVideoUrl(s.url); return; }
        setVideoUrl(null);
        if (!token) return;
        const fresh = await refreshMediaUrl(s.id, token);
        if (fresh?.url) {
            setVideoUrl(fresh.url);
        } else {
            setError('This video is no longer available.');
        }
    };

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
                setStatus(`Stage: ${(normalizedStatus || 'IN_PROGRESS').toLowerCase().replace(/_/g, ' ')}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Polling failed');
            setLoading(false);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
    };

    const handleGenerate = async (text: string) => {
        if (!text.trim() || loading) return;
        setLoading(true);
        setError('');
        setVideoUrl(null);
        setCurrentSessionId(null);
        setResultPrompt(text.trim());
        setStatus('Sending your request…');
        lastPromptRef.current = text.trim();
        try {
            const res = await fetch('/api/video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ prompt: text.trim(), duration }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Video generation failed');
            }
            const data = await res.json();
            const generationId = data.runId || data.id || data.requestId;
            if (data.mediaSessionId) setCurrentSessionId(data.mediaSessionId);
            if (generationId) {
                setStatus('Your clip is in the queue.');
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

    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    return (
        <div className="page-container">
            <Header title="Video" tool="video" actions={
                <Button
                    variant="quiet"
                    icon="help"
                    aria-pressed={guideOpen}
                    onClick={() => setGuideOpen(o => !o)}
                    data-tour="guide-btn"
                >
                    Learning guide
                </Button>
            } />

            <ToolLayout
                sidebarLabel="Your videos"
                sidebarTour="video-sidebar"
                sidebar={
                    <>
                        {isGuest && <p className="lk-tool__note">Guest videos are cleared when you leave.</p>}
                        {sessions.length === 0 ? (
                            <p className="lk-tool__note">Your videos will show here.</p>
                        ) : (
                            <HistoryList
                                items={sessions.map((s) => ({ id: s.id, title: s.prompt || 'Untitled video', updatedAt: s.createdAt }))}
                                activeId={currentSessionId}
                                icon="video"
                                noun="video"
                                onSelect={(id) => { const s = sessionById.get(id); if (s) selectSession(s); }}
                                onDelete={handleDeleteSession}
                            />
                        )}
                    </>
                }
                after={<GuidePanel tool="video" isOpen={guideOpen} />}
            >
                <div className="lk-thread" data-tour="video-result">
                    <div className="lk-thread__inner">
                        {!loading && !videoUrl && !error && (
                            <div className="lk-empty">
                                <h1 className="lk-display">What should happen in your clip?</h1>
                                <p>Describe a scene and how things move. A clip takes 1 to 4 minutes to make.</p>
                            </div>
                        )}
                        {resultPrompt && (loading || videoUrl || error) && (
                            <ChatMessage role="user">{resultPrompt}</ChatMessage>
                        )}
                        {loading && (
                            <GenerationWait
                                message={progress.message}
                                elapsedSec={progress.elapsedSec}
                                typical="1 to 4 minutes"
                                detail={status || undefined}
                            />
                        )}
                        {error && (
                            <Notice tone="danger" title="The video could not be made">
                                {error} Please try again, or change your description.
                            </Notice>
                        )}
                        {!loading && videoUrl && (
                            <div className="lk-media">
                                <video
                                    src={videoUrl}
                                    controls
                                    preload="metadata"
                                    playsInline
                                    onError={refreshMainUrl}
                                    className="lk-media__video"
                                    aria-label={resultPrompt ? `Video of: ${resultPrompt}` : 'Your video'}
                                />
                                <div className="lk-media__actions">
                                    <Button variant="quiet" icon="download" onClick={handleDownload}>Download</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lk-dock">
                    <div className="lk-dock__inner">
                        {!loading && !videoUrl && !prompt && (
                            <div className="lk-chips" aria-label="Example clips">
                                {VIDEO_CHIPS.map(p => (
                                    <Chip key={p} onClick={() => { setPrompt(p); document.getElementById('lk-composer')?.focus(); }}>{p}</Chip>
                                ))}
                            </div>
                        )}
                        <div className="lk-options" data-tour="video-duration">
                            <div className="lk-options__group" role="group" aria-labelledby="video-length-label">
                                <span id="video-length-label" className="lk-options__label">Length</span>
                                {VIDEO_LENGTHS.map((sec) => (
                                    <Chip key={sec} selected={duration === sec} onClick={() => setDuration(sec)} disabled={loading}>
                                        {sec} seconds
                                    </Chip>
                                ))}
                            </div>
                            <span className="lk-options__cost">{formatCredits(creditCost)}</span>
                        </div>
                        <span data-tour="video-prompt">
                            <Composer
                                value={prompt}
                                onChange={setPrompt}
                                onSend={handleGenerate}
                                disabled={loading}
                                clearOnSend={false}
                                label="Describe the scene"
                                sendLabel="Make video"
                                placeholder="A drone shot of a tropical island…"
                                hint={`Using ${modelConfig.video.label}. Uses ${formatCredits(creditCost)}. Press Enter to make it.`}
                                autoFocus
                            />
                        </span>
                    </div>
                </div>
            </ToolLayout>
            <CoachmarkTour tool="video" />
        </div>
    );
}
