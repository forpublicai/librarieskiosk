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
import { formatModeCost } from '@/lib/creditCosts';
import { refreshMediaUrl, downloadMedia } from '@/lib/mediaClient';
import { useGenerationProgress } from '@/hooks/useGenerationProgress';
import { loadGuestState, saveGuestState } from '@/lib/guestSession';
import modelConfig from '@/config/models.json';

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

const GUEST_KEY = 'image';

const IMAGE_CHIPS = [
    'A peaceful sunset over the ocean',
    'A friendly robot exploring a forest',
];

interface GuestImageState {
    imageUrl: string | null;
    sessions: SessionItem[];
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
    const [guideOpen, setGuideOpen] = useState(false);
    // The prompt behind the picture on screen, shown as the patron's bubble.
    const [resultPrompt, setResultPrompt] = useState<string | null>(null);
    const isGuest = user?.role === 'GUEST';
    const hydratedRef = useRef(false);
    const progress = useGenerationProgress({
        active: loading,
        messages: IMAGE_PROGRESS_MESSAGES,
    });

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
            const saved = loadGuestState<GuestImageState>(GUEST_KEY);
            if (saved) {
                if (saved.imageUrl) setImageUrl(saved.imageUrl);
                if (saved.sessions?.length) setSessions(saved.sessions);
            }
        }
    }, [user]);

    useEffect(() => {
        if (!isGuest || !hydratedRef.current) return;
        saveGuestState<GuestImageState>(GUEST_KEY, { imageUrl, sessions });
    }, [isGuest, imageUrl, sessions]);

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

    const handleDownload = useCallback(() => downloadMedia({
        sessionId: currentSessionId,
        token,
        fallbackUrl: imageUrl,
        fallbackFilename: 'generated-image.png',
        mode: 'image',
    }), [imageUrl, currentSessionId, token]);

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

    const handleDeleteSession = useCallback(async (id: string) => {
        if (id.startsWith('guest_')) {
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (currentSessionId === id) { setCurrentSessionId(null); setImageUrl(null); setResultPrompt(null); }
            return;
        }
        await fetch(`/api/media-sessions/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (currentSessionId === id) { setCurrentSessionId(null); setImageUrl(null); setResultPrompt(null); }
    }, [token, currentSessionId]);

    const selectSession = async (s: SessionItem) => {
        setCurrentSessionId(s.id);
        setResultPrompt(s.prompt);
        setError('');
        if (s.url) { setImageUrl(s.url); return; }
        if (s.hasObject && token) {
            const fresh = await refreshMediaUrl(s.id, token);
            if (fresh?.url) setImageUrl(fresh.url);
        }
    };

    const handleGenerate = async (text: string) => {
        if (!text.trim() || loading) return;

        setLoading(true);
        setError('');
        setImageUrl(null);
        setCurrentSessionId(null);
        setResultPrompt(text.trim());

        try {
            const res = await fetch('/api/image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ prompt: text.trim() }),
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

            if (isGuest) {
                const finalUrl = data.url
                    ? data.url
                    : data.b64_json
                        ? `data:image/png;base64,${data.b64_json}`
                        : null;
                if (finalUrl) {
                    const item: SessionItem = {
                        id: `guest_${Date.now()}`,
                        prompt: text.trim(),
                        url: finalUrl,
                        thumbnailUrl: finalUrl,
                        createdAt: new Date().toISOString(),
                    };
                    setSessions((prev) => [item, ...prev].slice(0, 20));
                }
            } else {
                await loadSessions();
            }
            await refreshUser();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return null;

    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    return (
        <div className="page-container">
            <Header title="Image" tool="image" actions={
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
                sidebarLabel="Your images"
                sidebarTour="image-sidebar"
                sidebar={
                    <>
                        {isGuest && <p className="lk-tool__note">Guest images are cleared when you leave.</p>}
                        {sessions.length === 0 ? (
                            <p className="lk-tool__note">Your images will show here.</p>
                        ) : (
                            <HistoryList
                                items={sessions.map((s) => ({
                                    id: s.id,
                                    title: s.prompt || 'Untitled image',
                                    updatedAt: s.createdAt,
                                    thumbnailUrl: s.thumbnailUrl || s.url,
                                }))}
                                activeId={currentSessionId}
                                icon="image"
                                noun="image"
                                onSelect={(id) => { const s = sessionById.get(id); if (s) selectSession(s); }}
                                onDelete={handleDeleteSession}
                                onThumbnailError={refreshSessionItemUrl}
                            />
                        )}
                    </>
                }
                after={<GuidePanel tool="image" isOpen={guideOpen} />}
            >
                <div className="lk-thread" data-tour="image-result">
                    <div className="lk-thread__inner">
                        {!loading && !imageUrl && !error && (
                            <div className="lk-empty">
                                <h1 className="lk-display">What should the picture show?</h1>
                                <p>Describe a picture. The AI draws it.</p>
                            </div>
                        )}
                        {resultPrompt && (loading || imageUrl || error) && (
                            <ChatMessage role="user">{resultPrompt}</ChatMessage>
                        )}
                        {loading && (
                            <GenerationWait message={progress.message} elapsedSec={progress.elapsedSec} typical="10 to 30 seconds" />
                        )}
                        {error && (
                            <Notice tone="danger" title="The image could not be made">
                                {error} Please try again, or change your description.
                            </Notice>
                        )}
                        {!loading && imageUrl && (
                            <div className="lk-media">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={imageUrl}
                                    alt={resultPrompt ? `Image of: ${resultPrompt}` : 'Your image'}
                                    className="lk-media__image"
                                    onError={refreshMainUrl}
                                />
                                <div className="lk-media__actions">
                                    <Button variant="quiet" icon="download" onClick={handleDownload}>Download</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lk-dock" data-tour="image-prompt">
                    <div className="lk-dock__inner">
                        {!loading && !imageUrl && !prompt && (
                            <div className="lk-chips" aria-label="Example pictures">
                                {IMAGE_CHIPS.map(p => (
                                    <Chip key={p} onClick={() => { setPrompt(p); document.getElementById('lk-composer')?.focus(); }}>{p}</Chip>
                                ))}
                            </div>
                        )}
                        <Composer
                            value={prompt}
                            onChange={setPrompt}
                            onSend={handleGenerate}
                            disabled={loading}
                            clearOnSend={false}
                            label="Describe the picture"
                            sendLabel="Make image"
                            placeholder="A calm lake at sunset with mountains…"
                            hint={`Using ${modelConfig.image.label}. Uses ${formatModeCost('image')} per image. Press Enter to make it.`}
                            autoFocus
                        />
                    </div>
                </div>
            </ToolLayout>
            <CoachmarkTour tool="image" />
        </div>
    );
}
