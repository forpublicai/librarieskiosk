'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';

type Tier = 1 | 2 | 3;
type FaqCategory = 'concept' | 'practical' | 'criticalUse';
type Screen =
  | 'tier-select'
  | 'entry-point'
  | 'what-is-it'
  | 'use-cases'
  | 'getting-started'
  | 'open-question'
  | 'faq-categories'
  | 'faq-list'
  | 'faq-answer';

interface FAQ { q: string; a: string; }

interface UseCase {
  id: string;
  label: string;
  gettingStarted: {
    intro: string;
    examplePrompt: string;
    tips: string[];
    cautions: string[];
  } | null;
}

interface GuideContent {
  whatIsIt: { tier1: string; tier2: string; tier3: string };
  useCases: UseCase[];
  faqs: { concept: FAQ[]; practical: FAQ[]; criticalUse: FAQ[] };
}

interface Message {
  role: 'bot' | 'user';
  content: string;
  copyable?: string;
}

interface GuidePanelProps {
  tool: string;
  isOpen: boolean;
}

// Dynamic-import loaders, one per tool. Each is a separate code-split chunk
// the bundler emits lazily — the JSON for a tool only ships to the browser
// after the user opens the guide panel on that tool's page. Avoids bundling
// ~30KB of guide content into every page that just imports `GuidePanel`.
const CONTENT_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  chat: () => import('../../config/guide/chat.json'),
  music: () => import('../../config/guide/music.json'),
  image: () => import('../../config/guide/image.json'),
  video: () => import('../../config/guide/video.json'),
  code: () => import('../../config/guide/code.json'),
};

const TIER_LS_KEY = 'guide_tier';

const TIER_LABELS: Record<Tier, string> = {
  1: "I'm new to technology and AI tools",
  2: "I use technology regularly but haven't explored AI tools yet",
  3: "I've tried AI tools and want to learn how to use them more effectively",
};

const TIER_SHORT_LABELS: Record<Tier, string> = {
  1: "New to tech",
  2: "Tech-savvy",
  3: "AI Explorer",
};

const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  concept: 'What is this and how does it work?',
  practical: 'How do I use it?',
  criticalUse: 'What should I know about safety and trust?',
};

function splitIntoBubbles(text: string): string[] {
  return text.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
}

const URL_RE = /\bhttps?:\/\/[^\s,)]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:org|com|edu|gov|net|io|ai)(?:\/[^\s,)]*)?/g;

function renderText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    const href = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    parts.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer" className="guide-link">{raw}</a>);
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : <>{parts}</>;
}

const FUZZY_STOP = new Set([
  // structural / grammatical
  'the','a','an','is','it','i','do','can','my','me','to','of','in','for',
  'what','how','why','when','does','should','will','are','be','have','this',
  'that','with','get','use','if','but','not','and','or','as','at','about',
  'could','would','might','also','even','still','already','yet','too','its',
  // intent framing — common in questions but topically meaningless
  'know','understand','think','want','need','help','tell','find','learn',
  'try','figure','explain','show','describe','mean','means','define','said',
  'dont','cant','wont','doesnt','isnt','arent','didnt','wasnt','havent',
  // filler / softeners
  'just','really','maybe','perhaps','like','sort','kind','bit','way',
  'please','hi','hello','hey','okay','yeah','yes','sure','right','actually',
]);

function tokenize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !FUZZY_STOP.has(w));
}

// Strip common intent-framing wrappers so "I don't know what X is" → "X"
function normalizeQuery(q: string): string {
  return q
    .replace(/i\s+don'?t\s+know\s+(what|how|why|if|whether)\s+/gi, '')
    .replace(/i\s+(don'?t|do\s+not)\s+understand\s+/gi, '')
    .replace(/can\s+you\s+\w+\s+(me\s+)?(about\s+)?/gi, '')
    .replace(/help\s+me\s+\w+\s+/gi, '')
    .replace(/tell\s+me\s+(about\s+)?/gi, '')
    .replace(/what\s+does\s+(.+?)\s+mean\??$/gi, '$1')
    .replace(/explain\s+(.+?)\s+to\s+me\??$/gi, '$1')
    .replace(/how\s+do\s+i\s+/gi, '')
    .replace(/i\s+want\s+to\s+(know|learn|understand)\s+(about\s+)?/gi, '')
    .trim();
}

function fuzzyMatch(query: string, faqs: FAQ[]): FAQ | null {
  const qTokens = tokenize(normalizeQuery(query));
  if (!qTokens.length) return null;

  // If the query contains a token that doesn't appear anywhere in the FAQ corpus,
  // the question references something beyond the static content — let the live guide handle it.
  const corpusTokens = new Set(faqs.flatMap(f => [...tokenize(f.q), ...tokenize(f.a)]));
  if (qTokens.some(t => !corpusTokens.has(t))) return null;

  // Pass 1: match against question text only — prefers the FAQ the user is asking about
  let best: { faq: FAQ; score: number } | null = null;
  for (const faq of faqs) {
    const faqQTokenSet = new Set(tokenize(faq.q));
    const hits = qTokens.filter(t => faqQTokenSet.has(t)).length;
    const score = hits / qTokens.length;
    if (!best || score > best.score) best = { faq, score };
  }
  if (best && best.score >= 0.35) return best.faq;

  // Pass 2: fall back to combined question + answer matching
  best = null;
  for (const faq of faqs) {
    const faqTokenSet = new Set(tokenize(faq.q + ' ' + faq.a));
    const hits = qTokens.filter(t => faqTokenSet.has(t)).length;
    const score = hits / qTokens.length;
    if (!best || score > best.score) best = { faq, score };
  }
  return best && best.score >= 0.35 ? best.faq : null;
}

const MAX_INPUT_WORDS = 25;
const SOFT_WARN_WORDS = 20;

function countWords(s: string): number {
    const trimmed = s.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
}

function fuzzyMatchUseCase(query: string, useCases: UseCase[]): UseCase | null {
  const qTokens = tokenize(normalizeQuery(query));
  if (!qTokens.length) return null;
  let best: { uc: UseCase; score: number; hits: number } | null = null;
  for (const uc of useCases) {
    if (!uc.gettingStarted) continue;
    const gs = uc.gettingStarted;
    const text = [uc.label, gs.intro, gs.examplePrompt, ...gs.tips, ...gs.cautions].join(' ');
    const ucTokenSet = new Set(tokenize(text));
    const hits = qTokens.filter(t => ucTokenSet.has(t)).length;
    const score = hits / qTokens.length;
    if (!best || score > best.score) best = { uc, score, hits };
  }
  if (!best || best.score < 0.25) return null;
  // Require at least 2 overlapping tokens for multi-token queries — a single
  // common word like "image" or "code" coincidentally hitting a use-case body
  // is not a real match. Single-token queries get a free pass since they have
  // only one possible hit.
  if (qTokens.length > 1 && best.hits < 2) return null;
  return best.uc;
}


// Outer wrapper: lazy-loads the JSON for `tool` on first open, then delegates
// to the implementation component once content is available. Splitting it
// this way lets the implementation rely on `content: GuideContent` (non-null)
// without sprinkling guards through every handler.
export default function GuidePanel({ tool, isOpen }: GuidePanelProps) {
  const [content, setContent] = useState<GuideContent | null>(null);

  useEffect(() => {
    if (!isOpen || content) return;
    const load = CONTENT_LOADERS[tool];
    if (!load) return;
    let cancelled = false;
    load()
      .then((mod) => { if (!cancelled) setContent(mod.default as GuideContent); })
      .catch((err) => console.error(`Failed to load guide content for tool="${tool}"`, err));
    return () => { cancelled = true; };
  }, [isOpen, tool, content]);

  if (!content) return null;
  return <GuidePanelInner content={content} tool={tool} isOpen={isOpen} />;
}

function GuidePanelInner({ content, tool, isOpen }: GuidePanelProps & { content: GuideContent }) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [screen, setScreen] = useState<Screen>('tier-select');
  const [tier, setTier] = useState<Tier | null>(null);
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<FaqCategory | null>(null);
  const [visitedUseCases, setVisitedUseCases] = useState<Set<string>>(new Set());
  const [freeInput, setFreeInput] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [highlightBadge, setHighlightBadge] = useState(false);
  const [highlightInput, setHighlightInput] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [liveLimitReached, setLiveLimitReached] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  const allFaqs = content
    ? [...content.faqs.concept, ...content.faqs.practical, ...content.faqs.criticalUse]
    : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    if (!isOpen || initializedRef.current || !content) return;
    initializedRef.current = true;
    const saved = localStorage.getItem(TIER_LS_KEY);
    const t = saved && ['1', '2', '3'].includes(saved) ? (Number(saved) as Tier) : null;
    if (t) {
      setTier(t);
      setMessages([{ role: 'bot', content: 'Welcome back! What would you like help with today?' }]);
      setScreen('entry-point');
    } else {
      setMessages([{ role: 'bot', content: "Hi! Before we start, which of these best describes you?" }]);
      setScreen('tier-select');
    }
  }, [isOpen, content]);

  function add(...msgs: Message[]): Promise<void> {
    const userMsgs = msgs.filter(m => m?.role === 'user');
    const botMsgs = msgs.filter(m => m?.role === 'bot');
    if (userMsgs.length) {
      setMessages(prev => [...prev, ...userMsgs]);
    }
    if (!botMsgs.length) return Promise.resolve();
    setIsThinking(true);
    return new Promise<void>(resolve => {
      const deliver = (idx: number) => {
        setTimeout(() => {
          setIsThinking(false);
          const msg = botMsgs[idx];
          if (!msg) { resolve(); return; }
          setMessages(prev => [...prev, msg]);
          if (idx < botMsgs.length - 1) {
            setIsThinking(true);
            deliver(idx + 1);
          } else {
            resolve();
          }
        }, 500);
      };
      deliver(0);
    });
  }

  async function handleTierSelect(t: Tier) {
    localStorage.setItem(TIER_LS_KEY, String(t));
    setTier(t);
    await add(
      { role: 'user', content: TIER_LABELS[t] },
      { role: 'bot', content: "Got it — I'll tailor explanations to your need. You can change this anytime using the badge at the top." },
      { role: 'bot', content: "What would you like help with?" }
    );
    setHighlightBadge(true);
    setTimeout(() => setHighlightBadge(false), 2800);
    setScreen('entry-point');
  }

  async function handleWhatIsIt() {
    const key = `tier${tier}` as keyof GuideContent['whatIsIt'];
    const segments = splitIntoBubbles(content.whatIsIt[key]);
    await add(
      { role: 'user', content: 'What is this tool?' },
      ...segments.map(s => ({ role: 'bot' as const, content: s }))
    );
    setScreen('what-is-it');
  }

  async function handleWhatCanIDo() {
    await add(
      { role: 'user', content: 'What can I do with this tool?' },
      { role: 'bot', content: "Here's what you can do with this tool. Pick one and I'll help you get started:" }
    );
    setScreen('use-cases');
  }

  async function handleGoToFaqs() {
    await add(
      { role: 'user', content: 'Other key questions (FAQs)' },
      { role: 'bot', content: 'Choose a topic to browse related questions:' }
    );
    setScreen('faq-categories');
    setSelectedFaqCategory(null);
  }

  async function handleMainMenu() {
    await add(
      { role: 'user', content: 'Main menu' },
      { role: 'bot', content: 'What would you like help with?' }
    );
    setScreen('entry-point');
  }

  // Render a use-case's "getting started" bundle (intro, copyable prompt,
  // tips, cautions). Shared by `handleUseCaseSelect` (button click) and
  // `handleFreeInputSubmit` (fuzzy match on typed text).
  async function renderUseCase(uc: UseCase, userText: string) {
    setVisitedUseCases(prev => { const s = new Set(prev); s.add(uc.id); return s; });
    const gs = uc.gettingStarted!;
    const msgs: Message[] = [
      { role: 'user', content: userText },
      { role: 'bot', content: gs.intro },
      { role: 'bot', content: 'Try this prompt in the tool:', copyable: gs.examplePrompt },
    ];
    if (gs.tips.length) msgs.push({ role: 'bot', content: 'Tips:\n' + gs.tips.map(t => `• ${t}`).join('\n') });
    if (gs.cautions.length) msgs.push({ role: 'bot', content: 'Keep in mind:\n' + gs.cautions.map(c => `• ${c}`).join('\n') });
    await add(...msgs);
  }

  // Render an FAQ answer split into bubbles. Shared by `handleFaqSelect`
  // (clicking a question in the list) and `handleFreeInputSubmit` (fuzzy
  // match on typed text).
  async function renderFaqAnswer(faq: FAQ, userText: string) {
    const segments = splitIntoBubbles(faq.a);
    await add(
      { role: 'user', content: userText },
      ...segments.map(s => ({ role: 'bot' as const, content: s }))
    );
  }

  async function handleUseCaseSelect(uc: UseCase) {
    if (!uc.gettingStarted) {
      setVisitedUseCases(prev => { const s = new Set(prev); s.add(uc.id); return s; });
      await add(
        { role: 'user', content: uc.label },
        { role: 'bot', content: "Describe what you have in mind in the text box below, and I'll guide you." }
      );
      setScreen('open-question');
      setHighlightInput(true);
      setTimeout(() => setHighlightInput(false), 2800);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    await renderUseCase(uc, uc.label);
    setScreen('getting-started');
  }

  async function handleFaqCategorySelect(cat: FaqCategory) {
    setSelectedFaqCategory(cat);
    await add(
      { role: 'user', content: FAQ_CATEGORY_LABELS[cat] },
      { role: 'bot', content: 'Pick a question:' }
    );
    setScreen('faq-list');
  }

  async function handleFaqSelect(faq: FAQ) {
    await renderFaqAnswer(faq, faq.q);
    setScreen('faq-answer');
  }

  async function handleSomethingElse() {
    await add(
      { role: 'user', content: 'Something else — type my question' },
      { role: 'bot', content: 'Go ahead — type your question below.' }
    );
    setScreen('faq-answer');
  }

  async function callLiveGuide(question: string) {
    setIsThinking(true);
    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, tool, tier }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'Guide request failed');
      }
      const data = await res.json();
      if (data.limitReached) setLiveLimitReached(true);
      const segments = splitIntoBubbles(data.response || '');
      setIsThinking(false);
      for (let i = 0; i < segments.length; i++) {
        setMessages(prev => [...prev, { role: 'bot', content: segments[i] }]);
        if (i < segments.length - 1) {
          setIsThinking(true);
          await new Promise<void>(resolve => setTimeout(resolve, 500));
          setIsThinking(false);
        }
      }
    } catch {
      setIsThinking(false);
      setMessages(prev => [...prev, {
        role: 'bot',
        content: "I wasn't able to answer that right now. Try rephrasing, or explore the FAQ options above.",
      }]);
    }
  }

  async function handleFreeInputSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const q = freeInput.trim();
    if (!q) return;
    if (countWords(q) > MAX_INPUT_WORDS) return;  // hard block; UI also disables submit
    setFreeInput('');

    // Match order: use-case → FAQ → live model. The `open-question` screen and
    // the other screens went through the same chain — collapsed here.
    const ucMatch = fuzzyMatchUseCase(q, content.useCases);
    if (ucMatch?.gettingStarted) {
      await renderUseCase(ucMatch, q);
      setScreen('getting-started');
      return;
    }
    const faqMatch = fuzzyMatch(q, allFaqs);
    if (faqMatch) {
      await renderFaqAnswer(faqMatch, q);
    } else {
      await routeToLiveOrLimit(q);
    }
    setScreen('faq-answer');
  }

  // Falls back to the live model — but if the per-session live-exchange limit
  // has already been reached, render the librarian-redirect locally instead of
  // hitting the API (the server would just bounce it anyway).
  async function routeToLiveOrLimit(q: string) {
    if (liveLimitReached) {
      await add(
        { role: 'user', content: q },
        { role: 'bot', content: "You've used your live questions for this session. FAQs, tips and use cases above are still available for your reference. For additional help, ask a librarian." }
      );
      return;
    }
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    await callLiveGuide(q);
  }

  function resetTier() {
    localStorage.removeItem(TIER_LS_KEY);
    setTier(null);
    setLiveLimitReached(false);
    setMessages([{ role: 'bot', content: 'Which of these best describes you?' }]);
    setScreen('tier-select');
    initializedRef.current = true;
  }

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(c => c === idx ? null : c), 2000);
  }

  function renderOptions() {
    switch (screen) {
      case 'tier-select':
        return ([1, 2, 3] as Tier[]).map(t => (
          <button key={t} className="guide-option-btn" onClick={() => handleTierSelect(t)}>
            {TIER_LABELS[t]}
          </button>
        ));

      case 'entry-point':
        return (
          <>
            <button className="guide-option-btn" onClick={handleWhatIsIt}>What is this tool?</button>
            <button className="guide-option-btn" onClick={handleWhatCanIDo}>What can I do with this tool?</button>
            <button className="guide-option-btn" onClick={handleGoToFaqs}>Other key questions (FAQs)</button>
          </>
        );

      case 'what-is-it':
        return (
          <>
            <button className="guide-option-btn" onClick={handleWhatCanIDo}>What can I do with this tool?</button>
            <button className="guide-option-btn" onClick={handleGoToFaqs}>Other key questions (FAQs)</button>
            <button className="guide-option-btn guide-option-btn--secondary" onClick={handleMainMenu}>↩ Main menu</button>
          </>
        );

      case 'use-cases':
        return (
          <>
            {content.useCases.map(uc => (
              <button
                key={uc.id}
                className="guide-option-btn"
                onClick={() => handleUseCaseSelect(uc)}
              >
                {visitedUseCases.has(uc.id) && (
                  <span style={{ color: 'var(--accent-orange)', marginRight: 6, fontSize: '0.7rem' }}>✓</span>
                )}
                {uc.label}
              </button>
            ))}
            <button className="guide-option-btn guide-option-btn--secondary" onClick={handleMainMenu}>↩ Main menu</button>
          </>
        );

      case 'open-question':
        return (
          <button className="guide-option-btn guide-option-btn--secondary" onClick={handleMainMenu}>↩ Main menu</button>
        );

      case 'getting-started':
        return (
          <>
            <button className="guide-option-btn" onClick={handleWhatCanIDo}>Explore another use</button>
            <button className="guide-option-btn" onClick={handleGoToFaqs}>Other key questions (FAQs)</button>
            <button className="guide-option-btn" onClick={() => handleUseCaseSelect(content.useCases.find(uc => !uc.gettingStarted)!)}>I have something else in mind</button>
            <button className="guide-option-btn guide-option-btn--secondary" onClick={handleMainMenu}>↩ Main menu</button>
          </>
        );

      case 'faq-categories':
        return (
          <>
            {(['concept', 'practical', 'criticalUse'] as FaqCategory[]).map(cat => (
              <button key={cat} className="guide-option-btn" onClick={() => handleFaqCategorySelect(cat)}>
                {FAQ_CATEGORY_LABELS[cat]}
              </button>
            ))}
            <button className="guide-option-btn guide-option-btn--live" onClick={handleSomethingElse}>
              Something else — type my question
            </button>
            <button className="guide-option-btn guide-option-btn--secondary" onClick={handleMainMenu}>↩ Main menu</button>
          </>
        );

      case 'faq-list':
        return (
          <>
            {selectedFaqCategory && content.faqs[selectedFaqCategory].map((faq, i) => (
              <button key={i} className="guide-option-btn" onClick={() => handleFaqSelect(faq)}>
                {faq.q}
              </button>
            ))}
            <button className="guide-option-btn guide-option-btn--live" onClick={handleSomethingElse}>
              Something else — type my question
            </button>
            <button className="guide-option-btn guide-option-btn--secondary" onClick={handleGoToFaqs}>
              ↩ Back to categories
            </button>
          </>
        );

      case 'faq-answer':
        return (
          <>
            <button className="guide-option-btn" onClick={handleGoToFaqs}>More questions (FAQs)</button>
            <button className="guide-option-btn guide-option-btn--secondary" onClick={handleMainMenu}>↩ Main menu</button>
          </>
        );

      default:
        return null;
    }
  }

  return (
    <div className={`guide-panel${isOpen ? ' guide-panel--open' : ''}`}>
      <div className="guide-panel-header">
        <span className="guide-panel-title">📖 Learning Guide</span>
        {tier && (
          <button
            className={`guide-tier-badge${highlightBadge ? ' guide-tier-badge--highlight' : ''}`}
            onClick={resetTier}
            title="Change your experience level"
          >
            {TIER_SHORT_LABELS[tier]} ✎
          </button>
        )}
      </div>
      <button
        className="cm-restart-link"
        onClick={() => {
          const key = `cm_${user?.username ?? 'anon'}_${tool}`;
          localStorage.removeItem(key);
          window.dispatchEvent(new CustomEvent('cm-restart', { detail: { tool } }));
        }}
      >
        ↺ Restart page tour
      </button>

      <div className="guide-panel-body">
        <div className="guide-panel-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`guide-message guide-message--${msg.role}`}>
              <div className="guide-message-content">
                <span className="guide-message-text">{renderText(msg.content)}</span>
                {msg.copyable && (
                  <div className="guide-copy-block">
                    <div className="guide-copy-prompt">"{msg.copyable}"</div>
                    <button
                      className={`guide-copy-btn${copiedIdx === i ? ' guide-copy-btn--copied' : ''}`}
                      onClick={() => handleCopy(msg.copyable!, i)}
                    >
                      {copiedIdx === i ? '✓ Copied!' : '⎘ Copy prompt'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="guide-message guide-message--bot">
              <div className="guide-message-content guide-message-thinking">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="guide-panel-options">
          {renderOptions()}
        </div>
      </div>

      {screen !== 'tier-select' && (() => {
        const wordCount = countWords(freeInput);
        const tooLong = wordCount > MAX_INPUT_WORDS;
        const nearLimit = wordCount >= SOFT_WARN_WORDS && !tooLong;
        return (
          <>
            {liveLimitReached && (
              <div className="guide-limit-banner">
                You've used your live questions for this session. FAQs, tips and use cases above are still available for your reference. For additional help, ask a librarian.
              </div>
            )}
            <form className="guide-panel-input" onSubmit={handleFreeInputSubmit}>
              <input
                ref={inputRef}
                className={`guide-input${highlightInput ? ' guide-input--highlight' : ''}`}
                value={freeInput}
                onChange={e => setFreeInput(e.target.value)}
                placeholder={screen === 'open-question' ? 'Describe what you have in mind...' : 'Type a question...'}
              />
              <button type="submit" className="guide-send-btn" disabled={!freeInput.trim() || tooLong}>➤</button>
            </form>
            {(nearLimit || tooLong) && (
              <div className={`guide-word-count${tooLong ? ' guide-word-count--error' : ' guide-word-count--warn'}`}>
                {tooLong
                  ? `Too long (${wordCount} words). Please shorten — ${MAX_INPUT_WORDS} word limit.`
                  : `${wordCount} / ${MAX_INPUT_WORDS} words — keep it short`}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
