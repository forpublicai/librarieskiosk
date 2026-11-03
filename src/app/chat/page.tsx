'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import GuidePanel from '@/components/GuidePanel';
import AssistantReply from '@/components/AssistantReply';
import CoachmarkTour from '@/components/CoachmarkTour';
import HistoryList from '@/components/HistoryList';
import ToolLayout from '@/components/ToolLayout';
import Button from '@/components/ui/Button';
import ChatMessage from '@/components/ui/ChatMessage';
import Chip from '@/components/ui/Chip';
import Composer from '@/components/ui/Composer';
import { loadGuestState, saveGuestState } from '@/lib/guestSession';
import modelConfig from '@/config/models.json';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ConversationSummary {
    id: string;
    title: string;
    updatedAt: string;
}

const GUEST_KEY = 'chat';

const CHAT_CHIPS = [
    'What can you help me with?',
    'Write me a short poem about nature',
];

interface GuestChatState {
    messages: Message[];
    activeConvId: string | null;
}

export default function ChatPage() {
    const { user, token, refreshUser, isLoading } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    // Error replies this page made in this visit, so only they show as a failure notice.
    const [errorReplies, setErrorReplies] = useState<string[]>([]);
    const isGuest = user?.role === 'GUEST';
    const hydratedRef = useRef(false);

    useEffect(() => {
        if (!isLoading && !user) router.push('/');
    }, [user, isLoading, router]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (token && !isGuest) loadConversations();
    }, [token, isGuest]);

    useEffect(() => {
        if (!user || hydratedRef.current) return;
        hydratedRef.current = true;
        if (user.role === 'GUEST') {
            const saved = loadGuestState<GuestChatState>(GUEST_KEY);
            if (saved) {
                if (saved.messages?.length) setMessages(saved.messages);
                if (saved.activeConvId) setActiveConvId(saved.activeConvId);
            }
        }
    }, [user]);

    useEffect(() => {
        if (!isGuest || !hydratedRef.current) return;
        saveGuestState<GuestChatState>(GUEST_KEY, { messages, activeConvId });
    }, [isGuest, messages, activeConvId]);

    const loadConversations = async () => {
        try {
            const res = await fetch('/api/conversations?mode=chat', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setConversations(data.conversations);
            }
        } catch { /* ignore */ }
    };

    const loadConversation = async (id: string) => {
        try {
            const res = await fetch(`/api/conversations/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setMessages(data.conversation.messages as Message[]);
                setActiveConvId(id);
            }
        } catch { /* ignore */ }
    };

    const saveConversation = useCallback(async (msgs: Message[], convId: string | null) => {
        if (msgs.length === 0) return;
        if (isGuest) return; // Guests persist via sessionStorage, not the DB.
        const title = msgs[0]?.content.slice(0, 60) || 'New Chat';
        try {
            if (convId) {
                await fetch(`/api/conversations/${convId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ messages: msgs, title }),
                });
            } else {
                const res = await fetch('/api/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ mode: 'chat', title, messages: msgs }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setActiveConvId(data.conversation.id);
                    loadConversations();
                }
            }
        } catch { /* ignore */ }
    }, [token, isGuest]);

    const scheduleSave = useCallback((msgs: Message[], convId: string | null) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => saveConversation(msgs, convId), 500);
    }, [saveConversation]);

    const handleNewChat = () => {
        setMessages([]);
        setActiveConvId(null);
    };

    const handleDeleteConversation = async (id: string) => {
        try {
            await fetch(`/api/conversations/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            setConversations((prev) => prev.filter((c) => c.id !== id));
            if (activeConvId === id) handleNewChat();
        } catch { /* ignore */ }
    };

    const handleExport = (format: 'text' | 'json') => {
        if (messages.length === 0) return;
        let content: string, filename: string, mime: string;
        if (format === 'json') {
            content = JSON.stringify(messages, null, 2);
            filename = 'chat-export.json';
            mime = 'application/json';
        } else {
            content = messages.map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`).join('\n\n---\n\n');
            filename = 'chat-export.txt';
            mime = 'text/plain';
        }
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    };

    const sendMessage = async (content: string) => {
        if (!content.trim() || isStreaming) return;

        const userMessage: Message = { role: 'user', content: content.trim() };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setIsStreaming(true);

        const controller = new AbortController();
        abortRef.current = controller;
        let assistantContent = '';

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ messages: newMessages }),
                signal: controller.signal,
            });

            if (!res.ok) {
                let errMessage = 'Chat failed';
                try { const errData = await res.json(); errMessage = errData.error || errMessage; } catch { }
                throw new Error(errMessage);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream reader');

            const decoder = new TextDecoder();
            // SSE events can be split across network chunks; buffer until we see a
            // newline so a `data:` line straddling a chunk boundary isn't dropped
            // (which previously left the assistant reply blank).
            let sseBuffer = '';
            let streamDone = false;
            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

            // Parse one SSE line. `.trim()` also strips the trailing \r of CRLF
            // line endings. Returns true once the terminating [DONE] is seen.
            const processSseLine = (rawLine: string): boolean => {
                const line = rawLine.trim();
                if (!line.startsWith('data:')) return false;
                const data = line.slice(5).trim();
                if (data === '[DONE]') return true;
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        assistantContent += content;
                        setMessages((prev) => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                            return updated;
                        });
                    }
                } catch { /* incomplete or non-JSON data line — ignore */ }
                return false;
            };

            while (!streamDone) {
                const { done, value } = await reader.read();
                if (done) break;
                sseBuffer += decoder.decode(value, { stream: true });

                let newlineIdx: number;
                while ((newlineIdx = sseBuffer.indexOf('\n')) !== -1) {
                    const line = sseBuffer.slice(0, newlineIdx);
                    sseBuffer = sseBuffer.slice(newlineIdx + 1);
                    if (processSseLine(line)) { streamDone = true; break; }
                }
            }

            // Flush the decoder and process a final line that arrived without a
            // trailing newline, so a valid one-line stream isn't lost to the
            // blank-response fallback below.
            if (!streamDone) {
                sseBuffer += decoder.decode();
                if (sseBuffer.trim().length > 0) processSseLine(sseBuffer);
            }

            // Surface a clear message instead of a blank bubble when the model
            // returns no text (empty stream / reasoning-only / upstream cutoff).
            const finalContent = assistantContent.trim().length > 0
                ? assistantContent
                : 'The assistant didn’t return a response. Please try sending your message again.';
            const finalMessages = [...newMessages, { role: 'assistant' as const, content: finalContent }];
            setMessages(finalMessages);
            scheduleSave(finalMessages, activeConvId);
            await refreshUser();
        } catch (err) {
            if (controller.signal.aborted) {
                // Stopped by the patron: keep what arrived so far.
                const stoppedMessages = assistantContent.trim()
                    ? [...newMessages, { role: 'assistant' as const, content: assistantContent }]
                    : newMessages;
                setMessages(stoppedMessages);
                scheduleSave(stoppedMessages, activeConvId);
                await refreshUser();
            } else {
                const errorContent = `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`;
                setErrorReplies((prev) => [...prev, errorContent]);
                setMessages((prev) => [...prev.filter((m) => m.role !== 'assistant' || m.content !== ''), {
                    role: 'assistant',
                    content: errorContent,
                }]);
            }
        } finally {
            abortRef.current = null;
            setIsStreaming(false);
        }
    };

    if (isLoading || !user) return null;

    const last = messages[messages.length - 1];
    const waitingForFirstToken = isStreaming && (last?.role !== 'assistant' || last.content === '');
    const shownMessages = waitingForFirstToken && last?.role === 'assistant' ? messages.slice(0, -1) : messages;

    return (
        <div className="page-container">
            <Header title="Chat" tool="chat" actions={
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
                sidebarLabel="Conversations"
                sidebarTour="chat-sidebar"
                sidebar={
                    <>
                        <Button variant="secondary" icon="plus" block onClick={handleNewChat} data-drawer-close>
                            Start a new chat
                        </Button>
                        {isGuest ? (
                            <p className="lk-tool__note">Guest chats are not saved after you leave.</p>
                        ) : conversations.length === 0 ? (
                            <p className="lk-tool__note">Your past chats will show here.</p>
                        ) : (
                            <HistoryList
                                items={conversations}
                                activeId={activeConvId}
                                icon="chat"
                                noun="chat"
                                onSelect={loadConversation}
                                onDelete={handleDeleteConversation}
                            />
                        )}
                        {messages.length > 0 && (
                            <div className="lk-tool__footer">
                                <p className="lk-tool__footer-label">Download this chat</p>
                                <Button variant="quiet" icon="download" onClick={() => handleExport('text')}>As a text file</Button>
                                <Button variant="quiet" icon="download" onClick={() => handleExport('json')}>As a JSON file</Button>
                            </div>
                        )}
                    </>
                }
                after={<GuidePanel tool="chat" isOpen={guideOpen} />}
            >
                <div className="lk-thread" data-tour="chat-messages">
                    <div className="lk-thread__inner">
                        {messages.length === 0 && (
                            <div className="lk-empty">
                                <h1 className="lk-display">What would you like to ask?</h1>
                                <p>Ask a question, get help writing, or plan something. Chat is free.</p>
                            </div>
                        )}
                        {shownMessages.map((msg, i) => (
                            msg.role === 'assistant' ? (
                                <AssistantReply
                                    key={i}
                                    content={msg.content}
                                    failed={errorReplies.includes(msg.content)}
                                    streaming={isStreaming && i === shownMessages.length - 1}
                                />
                            ) : (
                                <ChatMessage key={i} role="user">{msg.content}</ChatMessage>
                            )
                        ))}
                        {waitingForFirstToken && <ChatMessage thinking />}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className="lk-dock" data-tour="chat-input">
                    <div className="lk-dock__inner">
                        {messages.length === 0 && !input && (
                            <div className="lk-chips" aria-label="Example questions">
                                {CHAT_CHIPS.map(p => (
                                    <Chip key={p} onClick={() => { setInput(p); document.getElementById('lk-composer')?.focus(); }}>{p}</Chip>
                                ))}
                            </div>
                        )}
                        <Composer
                            value={input}
                            onChange={setInput}
                            onSend={sendMessage}
                            busy={isStreaming}
                            onStop={() => abortRef.current?.abort()}
                            placeholder="Ask anything…"
                            hint={`Using ${modelConfig.chat.label}. Press Enter to send. Shift + Enter for a new line.`}
                            autoFocus
                        />
                    </div>
                </div>
            </ToolLayout>
            <CoachmarkTour tool="chat" />
        </div>
    );
}
