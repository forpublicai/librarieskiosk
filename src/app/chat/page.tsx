'use client';

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ConversationSummary {
    id: string;
    title: string;
    updatedAt: string;
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

    useEffect(() => {
        if (!isLoading && !user) router.push('/');
    }, [user, isLoading, router]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (token) loadConversations();
    }, [token]);

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
    }, [token]);

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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;

        const userMessage: Message = { role: 'user', content: input.trim() };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setIsStreaming(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ messages: newMessages }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Chat failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream reader');

            const decoder = new TextDecoder();
            let assistantContent = '';
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
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
            }]);
        } finally {
            setIsStreaming(false);
        }
    };

    if (isLoading || !user) return null;

    return (
        <div className="page-container">
            <Header title="Chat" />

            <div className="chat-container">
                {/* Sidebar */}
                <aside className="gen-sidebar" style={{ width: '320px', minWidth: '320px' }}>
                    <button className="btn btn-primary" onClick={handleNewChat} style={{ width: '100%', marginBottom: '24px' }}>
                        + New Chat
                    </button>
                    <h2 className="form-label" style={{ marginBottom: '16px' }}>History</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {conversations.map((c) => (
                            <div
                                key={c.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '10px 12px',
                                    background: c.id === activeConvId ? 'var(--glass-bg)' : 'transparent',
                                    border: '1px solid var(--border-light)',
                                    cursor: 'pointer', transition: 'background 0.2s',
                                }}
                            >
                                <div
                                    style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', fontWeight: 'bold' }}
                                    onClick={() => loadConversation(c.id)}
                                >
                                    {c.title}
                                </div>
                                <button
                                    onClick={() => handleDeleteConversation(c.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem' }}
                                >✕</button>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Chat main */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
                        {messages.length === 0 && (
                            <div className="gen-empty" style={{ margin: 'auto' }}>
                                <div className="gen-empty-icon">💬</div>
                                <div className="gen-empty-text">Start a conversation with AI</div>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`chat-message ${msg.role}`}>
                                {msg.role === 'assistant' ? (
                                    <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                                ) : (
                                    msg.content
                                )}
                            </div>
                        ))}
                        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
                            <div className="chat-message assistant">
                                <div className="typing-indicator">
                                    <div className="typing-dot" />
                                    <div className="typing-dot" />
                                    <div className="typing-dot" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="chat-input-area">
                        <form className="chat-input-wrapper" onSubmit={handleSubmit}>
                            <input
                                className="chat-input"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Type your message..."
                                disabled={isStreaming}
                                autoFocus
                            />
                            <button
                                className="chat-send-btn"
                                type="submit"
                                disabled={isStreaming || !input.trim()}
                            >
                                ➤
                            </button>
                        </form>
                        {messages.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <button className="back-btn" onClick={() => handleExport('text')} style={{ fontSize: '0.7rem', padding: '4px 10px' }}>Export TXT</button>
                                <button className="back-btn" onClick={() => handleExport('json')} style={{ fontSize: '0.7rem', padding: '4px 10px' }}>Export JSON</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatMessage(text: string): string {
    return text
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--bg-secondary); padding:16px; border:1px solid var(--border-color); margin:12px 0; font-family:\'NB Mono\', monospace; font-size:0.85rem; overflow-x:auto;"><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code style="background:var(--bg-secondary); padding:2px 6px; font-family:\'NB Mono\', monospace; font-size:0.9em;">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');
}
