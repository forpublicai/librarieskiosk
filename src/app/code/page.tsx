'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import GuidePanel from '@/components/GuidePanel';
import AssistantReply from '@/components/AssistantReply';
import CoachmarkTour from '@/components/CoachmarkTour';
import CopyButton from '@/components/CopyButton';
import HistoryList from '@/components/HistoryList';
import ToolLayout from '@/components/ToolLayout';
import Button from '@/components/ui/Button';
import ChatMessage from '@/components/ui/ChatMessage';
import Chip from '@/components/ui/Chip';
import Composer from '@/components/ui/Composer';
import { formatModeCost } from '@/lib/creditCosts';
import { useGenerationProgress, formatElapsed } from '@/hooks/useGenerationProgress';
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

const CODE_PROGRESS_MESSAGES = [
    'Reading your prompt…',
    'Planning the approach…',
    'Drafting the code…',
    'Checking syntax…',
    'Adding comments…',
    'Tidying up…',
    'Almost done — final review…',
];

const GUEST_KEY = 'code';

const CODE_CHIPS = [
    'Build a simple to-do list webpage',
    'Write a function to reverse a string',
];

interface GuestCodeState {
    messages: Message[];
    activeConvId: string | null;
}

export default function CodePage() {
    const { user, token, refreshUser, isLoading } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [codeBlocks, setCodeBlocks] = useState<Array<{ lang: string; code: string }>>([]);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isGuest = user?.role === 'GUEST';
    const hydratedRef = useRef(false);

    const progress = useGenerationProgress({
        active: isStreaming,
        messages: CODE_PROGRESS_MESSAGES,
        intervalSec: 3,
    });

    useEffect(() => {
        if (!isLoading && !user) router.push('/');
    }, [user, isLoading, router]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (token && !isGuest) loadConversations();
    }, [token, isGuest]);

    // Hydrate guest state from sessionStorage once we know the role.
    useEffect(() => {
        if (!user || hydratedRef.current) return;
        hydratedRef.current = true;
        if (user.role === 'GUEST') {
            const saved = loadGuestState<GuestCodeState>(GUEST_KEY);
            if (saved) {
                if (saved.messages?.length) setMessages(saved.messages);
                if (saved.activeConvId) setActiveConvId(saved.activeConvId);
            }
        }
    }, [user]);

    // Persist guest state whenever messages/active conversation change.
    useEffect(() => {
        if (!isGuest || !hydratedRef.current) return;
        saveGuestState<GuestCodeState>(GUEST_KEY, { messages, activeConvId });
    }, [isGuest, messages, activeConvId]);

    useEffect(() => {
        const blocks: Array<{ lang: string; code: string }> = [];
        messages.forEach((msg) => {
            if (msg.role === 'assistant') {
                const regex = /```(\w*)\n([\s\S]*?)```/g;
                let match;
                while ((match = regex.exec(msg.content)) !== null) {
                    blocks.push({ lang: match[1] || 'text', code: match[2] });
                }
            }
        });
        setCodeBlocks(blocks);
    }, [messages]);

    const loadConversations = async () => {
        try {
            const res = await fetch('/api/conversations?mode=code', {
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
        const title = msgs[0]?.content.slice(0, 60) || 'New Code Chat';
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
                    body: JSON.stringify({ mode: 'code', title, messages: msgs }),
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
            const res = await fetch('/api/code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ messages: newMessages }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Code generation failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream reader');

            const decoder = new TextDecoder();
            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                for (const line of chunk.split('\n')) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;
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
                        } catch { }
                    }
                }
            }

            const finalMessages = [...newMessages, { role: 'assistant' as const, content: assistantContent }];
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
                setMessages((prev) => [...prev.filter((m) => m.role !== 'assistant' || m.content !== ''), {
                    role: 'assistant',
                    content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
                }]);
            }
        } finally {
            abortRef.current = null;
            setIsStreaming(false);
        }
    };

    if (isLoading || !user) return null;

    const latestCode = codeBlocks.length > 0 ? codeBlocks[codeBlocks.length - 1] : null;
    const last = messages[messages.length - 1];
    const waitingForFirstToken = isStreaming && (last?.role !== 'assistant' || last.content === '');
    const shownMessages = waitingForFirstToken && last?.role === 'assistant' ? messages.slice(0, -1) : messages;

    return (
        <div className="page-container">
            <Header title="Code" tool="code" actions={
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
                sidebarLabel="Projects"
                sidebarTour="code-sidebar"
                sidebar={
                    <>
                        <Button variant="secondary" icon="plus" block onClick={handleNewChat} data-drawer-close>
                            Start a new project
                        </Button>
                        {isGuest ? (
                            <p className="lk-tool__note">Guest projects are not saved after you leave.</p>
                        ) : conversations.length === 0 ? (
                            <p className="lk-tool__note">Your past projects will show here.</p>
                        ) : (
                            <HistoryList
                                items={conversations}
                                activeId={activeConvId}
                                icon="code"
                                noun="project"
                                onSelect={loadConversation}
                                onDelete={handleDeleteConversation}
                            />
                        )}
                    </>
                }
                after={
                    <>
                        <section className="lk-code-pane" data-tour="code-output" aria-label="Code output">
                            <div className="lk-code-pane__head">
                                <h2 className="lk-heading">
                                    Code
                                    {latestCode && <span className="lk-code-pane__lang">{latestCode.lang}</span>}
                                </h2>
                                {latestCode && <CopyButton text={latestCode.code} label="Copy code" />}
                            </div>
                            {latestCode ? (
                                <pre className="lk-code-pane__body">
                                    {latestCode.code.split('\n').map((line, i) => (
                                        <span key={i} className="lk-code-pane__line">
                                            <span className="lk-code-pane__num" aria-hidden="true">{i + 1}</span>
                                            {line}
                                        </span>
                                    ))}
                                </pre>
                            ) : (
                                <p className="lk-code-pane__empty">The newest code from the chat shows here.</p>
                            )}
                        </section>
                        <GuidePanel tool="code" isOpen={guideOpen} />
                    </>
                }
            >
                <div className="lk-thread" data-tour="code-chat">
                    <div className="lk-thread__inner">
                        {messages.length === 0 && (
                            <div className="lk-empty">
                                <h1 className="lk-display">What would you like to build?</h1>
                                <p>Describe a web page, a program or a fix. You do not need to know how to code.</p>
                            </div>
                        )}
                        {shownMessages.map((msg, i) => (
                            msg.role === 'assistant' ? (
                                <AssistantReply
                                    key={i}
                                    content={msg.content}
                                    streaming={isStreaming && i === shownMessages.length - 1}
                                />
                            ) : (
                                <ChatMessage key={i} role="user">{msg.content}</ChatMessage>
                            )
                        ))}
                        {waitingForFirstToken && (
                            <ChatMessage thinking={`${progress.message} ${formatElapsed(progress.elapsedSec)}`} />
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className="lk-dock">
                    <div className="lk-dock__inner">
                        {messages.length === 0 && !input && (
                            <div className="lk-chips" aria-label="Example requests">
                                {CODE_CHIPS.map(p => (
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
                            placeholder="Write a Python function to…"
                            hint={`Using ${modelConfig.coding.label}. Uses ${formatModeCost('code')} per message. Press Enter to send. Shift + Enter for a new line.`}
                            autoFocus
                        />
                    </div>
                </div>
            </ToolLayout>
            <CoachmarkTour tool="code" />
        </div>
    );
}
