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

export default function CodePage() {
    const { user, token, refreshUser, isLoading } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [codeBlocks, setCodeBlocks] = useState<Array<{ lang: string; code: string }>>([]);
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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;

        const userMessage: Message = { role: 'user', content: input.trim() };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setIsStreaming(true);

        try {
            const res = await fetch('/api/code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ messages: newMessages }),
            });

            if (!res.ok) throw new Error('Code generation failed');

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
            setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong.' }]);
        } finally {
            setIsStreaming(false);
        }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
    };

    if (isLoading || !user) return null;

    const latestCode = codeBlocks.length > 0 ? codeBlocks[codeBlocks.length - 1] : null;

    return (
        <div className="page-container">
            <Header title="Code Assistant" />

            <div className="code-container" style={{ gridTemplateColumns: '260px 1fr 1fr' }}>
                {/* History sidebar */}
                <aside className="gen-sidebar" style={{ width: 'auto', minWidth: 0 }}>
                    <button className="btn btn-primary" onClick={handleNewChat} style={{ width: '100%', marginBottom: '24px', fontSize: '0.8rem' }}>
                        + New Project
                    </button>
                    <h2 className="form-label" style={{ marginBottom: '12px' }}>Projects</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {conversations.map((c) => (
                            <div
                                key={c.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 10px',
                                    background: c.id === activeConvId ? 'var(--glass-bg)' : 'transparent',
                                    border: '1px solid var(--border-light)',
                                    cursor: 'pointer',
                                }}
                            >
                                <div
                                    style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', fontWeight: 'bold' }}
                                    onClick={() => loadConversation(c.id)}
                                >
                                    {c.title}
                                </div>
                                <button
                                    onClick={() => handleDeleteConversation(c.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}
                                >✕</button>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Chat pane */}
                <div className="code-chat-pane">
                    <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
                        {messages.length === 0 && (
                            <div className="gen-empty" style={{ margin: 'auto' }}>
                                <div className="gen-empty-icon">💻</div>
                                <div className="gen-empty-text">Ask me to write, debug, or explain code</div>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`chat-message ${msg.role}`}>
                                {msg.role === 'assistant' ? (
                                    <div dangerouslySetInnerHTML={{ __html: formatCodeMessage(msg.content) }} />
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
                                placeholder="Write a Python function to..."
                                disabled={isStreaming}
                                autoFocus
                            />
                            <button className="chat-send-btn" type="submit" disabled={isStreaming || !input.trim()}>
                                ➤
                            </button>
                        </form>
                    </div>
                </div>

                {/* Code output pane */}
                <div className="code-editor-pane">
                    <div className="code-editor-header">
                        <span>{latestCode ? `// ${latestCode.lang}` : '// Code Output'}</span>
                        {latestCode && (
                            <button className="back-btn" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => copyCode(latestCode.code)}>
                                Copy
                            </button>
                        )}
                    </div>
                    <div className="code-editor-content">
                        {latestCode ? (
                            latestCode.code.split('\n').map((line, i) => (
                                <div key={i}>
                                    <span className="line-number">{i + 1}</span>
                                    {line}
                                </div>
                            ))
                        ) : (
                            <div className="gen-empty" style={{ height: '100%', justifyContent: 'center' }}>
                                <div className="gen-empty-icon">📝</div>
                                <div className="gen-empty-text">Generated code will appear here</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatCodeMessage(text: string): string {
    return text
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--bg-secondary); padding:12px; border:1px solid var(--border-color); margin:8px 0; font-family:\'NB Mono\', monospace; font-size:0.8rem; overflow-x:auto;"><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code style="background:var(--bg-secondary); padding:2px 4px; font-family:\'NB Mono\', monospace;">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');
}
