'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import TextField from '@/components/ui/TextField';
import { calculateCredits, formatCredits } from '@/lib/creditCosts';
import { refreshMediaUrl, downloadMedia } from '@/lib/mediaClient';
import { useGenerationProgress } from '@/hooks/useGenerationProgress';
import { loadGuestState, saveGuestState } from '@/lib/guestSession';
import modelConfig from '@/config/models.json';

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

const MUSIC_CHIPS = [
    'Calm piano music for focus',
    'Upbeat jazz with a happy mood',
];

function formatLength(sec: number): string {
    if (sec < 60) return `${sec} sec`;
    const min = Math.floor(sec / 60);
    const rest = sec % 60;
    return rest ? `${min} min ${rest} sec` : `${min} min`;
}

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
    const [guideOpen, setGuideOpen] = useState(false);
    const [lyricsOpen, setLyricsOpen] = useState(false);
    // The prompt behind the track on screen, shown as the patron's bubble.
    const [resultPrompt, setResultPrompt] = useState<string | null>(null);
    const isGuest = user?.role === 'GUEST';
    const hydratedRef = useRef(false);
    const progress = useGenerationProgress({
        active: loading,
        messages: MUSIC_PROGRESS_MESSAGES,
        intervalSec: 3.5,
    });

    const creditCost = calculateCredits('music', duration);

    // Some models (e.g. Google Lyria) ignore the requested duration and always
    // return a full-length track, so the slider would be misleading. When the
    // model opts out of duration control we hide it and bill a flat rate (the
    // fixed `duration` default below).
    const showDurationSlider = (modelConfig.music as { durationControl?: boolean }).durationControl !== false;

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

    const handleDownload = useCallback(() => downloadMedia({
        sessionId: currentSessionId,
        token,
        fallbackUrl: audioUrl,
        fallbackFilename: 'generated-track.mp3',
        mode: 'music',
    }), [audioUrl, currentSessionId, token]);

    const handleDeleteSession = useCallback(async (id: string) => {
        if (id.startsWith('guest_')) {
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (currentSessionId === id) { setCurrentSessionId(null); setAudioUrl(null); setResultPrompt(null); }
            return;
        }
        await fetch(`/api/media-sessions/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (currentSessionId === id) { setCurrentSessionId(null); setAudioUrl(null); setResultPrompt(null); }
    }, [token, currentSessionId]);

    const selectSession = async (s: SessionItem) => {
        setCurrentSessionId(s.id);
        setResultPrompt(s.prompt);
        setError('');
        if (s.url) { setAudioUrl(s.url); return; }
        if (s.hasObject && token) {
            const fresh = await refreshMediaUrl(s.id, token);
            if (fresh?.url) setAudioUrl(fresh.url);
        }
    };

    const handleGenerate = async (text: string) => {
        if (!text.trim() || loading) return;

        setLoading(true);
        setError('');
        setAudioUrl(null);
        setCurrentSessionId(null);
        setResultPrompt(text.trim());

        try {
            const res = await fetch('/api/music', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    prompt: text.trim(),
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
                        prompt: text.trim(),
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

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const showLyrics = !instrumental && (lyricsOpen || lyrics.length > 0);

    return (
        <div className="page-container">
            <Header title="Music" tool="music" actions={
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
                sidebarLabel="Your songs"
                sidebarTour="music-sidebar"
                sidebar={
                    <>
                        {isGuest && <p className="lk-tool__note">Guest songs are cleared when you leave.</p>}
                        {sessions.length === 0 ? (
                            <p className="lk-tool__note">Your songs will show here.</p>
                        ) : (
                            <HistoryList
                                items={sessions.map((s) => ({ id: s.id, title: s.prompt || 'Untitled song', updatedAt: s.createdAt }))}
                                activeId={currentSessionId}
                                icon="music"
                                noun="song"
                                onSelect={(id) => { const s = sessionById.get(id); if (s) selectSession(s); }}
                                onDelete={handleDeleteSession}
                            />
                        )}
                    </>
                }
                after={<GuidePanel tool="music" isOpen={guideOpen} onClose={() => setGuideOpen(false)} />}
            >
                <div className="lk-thread" data-tour="music-result">
                    <div className="lk-thread__inner">
                        {!loading && !audioUrl && !error && (
                            <div className="lk-empty">
                                <h1 className="lk-display">What should your song sound like?</h1>
                                <p>Describe a style and a mood. You can add your own words, or let the AI write them.</p>
                            </div>
                        )}
                        {resultPrompt && (loading || audioUrl || error) && (
                            <ChatMessage role="user">{resultPrompt}</ChatMessage>
                        )}
                        {loading && (
                            <GenerationWait message={progress.message} elapsedSec={progress.elapsedSec} typical="30 to 60 seconds" />
                        )}
                        {error && (
                            <Notice tone="danger" title="The song could not be made">
                                {error} Please try again, or change your description.
                            </Notice>
                        )}
                        {!loading && audioUrl && (
                            <div className="lk-media">
                                <audio
                                    src={audioUrl}
                                    controls
                                    preload="metadata"
                                    onError={refreshMainUrl}
                                    className="lk-media__audio"
                                    aria-label={resultPrompt ? `Song: ${resultPrompt}` : 'Your song'}
                                />
                                <div className="lk-media__actions">
                                    <Button variant="quiet" icon="download" onClick={handleDownload}>Download</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lk-dock" data-tour="music-form">
                    <div className="lk-dock__inner">
                        {!loading && !audioUrl && !prompt && (
                            <div className="lk-chips" aria-label="Example songs">
                                {MUSIC_CHIPS.map(p => (
                                    <Chip key={p} onClick={() => { setPrompt(p); document.getElementById('lk-composer')?.focus(); }}>{p}</Chip>
                                ))}
                            </div>
                        )}
                        <div className="lk-options">
                            <span data-tour="music-instrumental">
                                <Chip
                                    icon={instrumental ? 'check' : undefined}
                                    selected={instrumental}
                                    onClick={() => setInstrumental((v) => !v)}
                                    disabled={loading}
                                >
                                    Instrumental only
                                </Chip>
                            </span>
                            {!instrumental && !showLyrics && (
                                <Button variant="quiet" icon="plus" onClick={() => setLyricsOpen(true)} disabled={loading}>
                                    Add your own words
                                </Button>
                            )}
                            {showDurationSlider ? (
                                <div className="lk-range">
                                    <div className="lk-range__row">
                                        <label className="lk-options__label" htmlFor="music-length">Length: {formatLength(duration)}</label>
                                        <span className="lk-options__cost">{formatCredits(creditCost)}</span>
                                    </div>
                                    <input
                                        id="music-length"
                                        type="range"
                                        min={10}
                                        max={300}
                                        step={1}
                                        value={duration}
                                        onChange={(e) => setDuration(Number(e.target.value))}
                                        disabled={loading}
                                        aria-valuetext={formatLength(duration)}
                                    />
                                    <div className="lk-range__ends" aria-hidden="true"><span>10 sec</span><span>5 min</span></div>
                                </div>
                            ) : (
                                <span className="lk-options__cost">Makes a full-length song for {formatCredits(creditCost)}.</span>
                            )}
                        </div>
                        {showLyrics && (
                            <TextField
                                multiline
                                label="Your words (optional)"
                                hint="Leave this empty and the AI writes the words."
                                value={lyrics}
                                onChange={(e) => setLyrics(e.target.value)}
                                placeholder="Type your words here…"
                                disabled={loading}
                            />
                        )}
                        <Composer
                            value={prompt}
                            onChange={setPrompt}
                            onSend={handleGenerate}
                            disabled={loading}
                            clearOnSend={false}
                            label="Describe the style and mood"
                            sendLabel="Make music"
                            placeholder="90s hip hop with lo-fi vibes…"
                            hint={`Using ${modelConfig.music.label}. Uses ${formatCredits(creditCost)}. Press Enter to make it.`}
                            autoFocus
                        />
                    </div>
                </div>
            </ToolLayout>
            <CoachmarkTour tool="music" />
        </div>
    );
}
