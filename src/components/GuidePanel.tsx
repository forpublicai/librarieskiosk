'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  countWords,
  guideTierKey,
  LEGACY_GUIDE_TIER_KEY,
  LIBRARIAN_REDIRECT,
  MAX_INPUT_WORDS,
  SOFT_WARN_WORDS,
  TIER_LABELS,
  TIER_SHORT_LABELS,
  type GuideTier,
} from '@/lib/guideConstants';
import {
  fuzzyMatch,
  fuzzyMatchUseCase,
  splitIntoBubbles,
} from '@/lib/guideMatch';
import { splitGuideTextLinks } from '@/lib/guideLinks';

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

type StartedUseCase = UseCase & { gettingStarted: NonNullable<UseCase['gettingStarted']> };

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
  chat: () => import('@/config/guide/chat.json'),
  music: () => import('@/config/guide/music.json'),
  image: () => import('@/config/guide/image.json'),
  video: () => import('@/config/guide/video.json'),
  code: () => import('@/config/guide/code.json'),
};

const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  concept: 'What is this and how does it work?',
  practical: 'How do I use it?',
  criticalUse: 'What should I know about safety and trust?',
};

function renderText(text: string): React.ReactNode {
  return (
    <>
      {splitGuideTextLinks(text).map((part, idx) => (
        part.type === 'link'
          ? <a key={idx} href={part.href} target="_blank" rel="noopener noreferrer" className="guide-link">{part.text}</a>
          : part.text
      ))}
    </>
  );
}

function hasGettingStarted(uc: UseCase): uc is StartedUseCase {
  return Boolean(uc.gettingStarted);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isFaqArray(value: unknown): value is FAQ[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.q === 'string' && typeof candidate.a === 'string';
  });
}

function isGuideContent(value: unknown): value is GuideContent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const whatIsIt = candidate.whatIsIt as Record<string, unknown> | undefined;
  const faqs = candidate.faqs as Record<string, unknown> | undefined;

  if (
    !whatIsIt ||
    typeof whatIsIt.tier1 !== 'string' ||
    typeof whatIsIt.tier2 !== 'string' ||
    typeof whatIsIt.tier3 !== 'string'
  ) {
    return false;
  }

  if (!Array.isArray(candidate.useCases)) return false;
  const useCasesValid = candidate.useCases.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const uc = item as Record<string, unknown>;
    if (typeof uc.id !== 'string' || typeof uc.label !== 'string') return false;
    if (uc.gettingStarted === null) return true;
    if (!uc.gettingStarted || typeof uc.gettingStarted !== 'object') return false;
    const gs = uc.gettingStarted as Record<string, unknown>;
    return (
      typeof gs.intro === 'string' &&
      typeof gs.examplePrompt === 'string' &&
      isStringArray(gs.tips) &&
      isStringArray(gs.cautions)
    );
  });
  if (!useCasesValid || !faqs) return false;

  return (
    isFaqArray(faqs.concept) &&
    isFaqArray(faqs.practical) &&
    isFaqArray(faqs.criticalUse)
  );
}

function GuideContentError({ isOpen }: { isOpen: boolean }) {
  return (
    <div className={`guide-panel${isOpen ? ' guide-panel--open' : ''}`}>
      <div className="guide-panel-header">
        <span className="guide-panel-title">Learning Guide</span>
      </div>
      <div className="guide-panel-body">
        <div className="guide-panel-messages">
          <div className="guide-message guide-message--bot">
            <div className="guide-message-content">
              <span className="guide-message-text">Guide content failed to load.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// Outer wrapper: lazy-loads the JSON for `tool` on first open, then delegates
// to the implementation component once content is available. Splitting it
// this way lets the implementation rely on `content: GuideContent` (non-null)
// without sprinkling guards through every handler.
export default function GuidePanel({ tool, isOpen }: GuidePanelProps) {
  const [content, setContent] = useState<GuideContent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = CONTENT_LOADERS[tool];

  useEffect(() => {
    if (!isOpen || content || loadFailed || !load) return;
    let cancelled = false;
    load()
      .then((mod) => {
        if (cancelled) return;
        if (!isGuideContent(mod.default)) {
          console.error(`Invalid guide content shape for tool="${tool}"`, mod.default);
          setLoadFailed(true);
          return;
        }
        setContent(mod.default);
      })
      .catch((err) => {
        console.error(`Failed to load guide content for tool="${tool}"`, err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [isOpen, tool, content, loadFailed, load]);

  if (!load) {
    console.error(`No guide content loader configured for tool="${tool}"`);
    return <GuideContentError isOpen={isOpen} />;
  }
  if (loadFailed) return <GuideContentError isOpen={isOpen} />;
  if (!content) return null;
  return <GuidePanelInner content={content} tool={tool} isOpen={isOpen} />;
}

function GuidePanelInner({ content, tool, isOpen }: GuidePanelProps & { content: GuideContent }) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [screen, setScreen] = useState<Screen>('tier-select');
  const [tier, setTier] = useState<GuideTier | null>(null);
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
  const tierStorageKey = guideTierKey(user, token);

  const allFaqs = content
    ? [...content.faqs.criticalUse, ...content.faqs.practical, ...content.faqs.concept]
    : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, isThinking]);

  useEffect(() => {
    if (!isOpen || initializedRef.current || !content) return;
    initializedRef.current = true;
    localStorage.removeItem(LEGACY_GUIDE_TIER_KEY);
    const saved = localStorage.getItem(tierStorageKey);
    const t = saved && ['1', '2', '3'].includes(saved) ? (Number(saved) as GuideTier) : null;
    if (t) {
      setTier(t);
      setMessages([{ role: 'bot', content: 'Welcome back! What would you like help with today?' }]);
      setScreen('entry-point');
    } else {
      setMessages([{ role: 'bot', content: "Hi! Before we start, which of these best describes you?" }]);
      setScreen('tier-select');
    }
  }, [isOpen, content, tierStorageKey]);

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

  async function handleTierSelect(t: GuideTier) {
    localStorage.setItem(tierStorageKey, String(t));
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
  async function renderUseCase(uc: StartedUseCase, userText: string) {
    setVisitedUseCases(prev => { const s = new Set(prev); s.add(uc.id); return s; });
    const gs = uc.gettingStarted;
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
    if (!hasGettingStarted(uc)) {
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
    setHighlightInput(true);
    setTimeout(() => setHighlightInput(false), 2800);
    setTimeout(() => inputRef.current?.focus(), 50);
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
      if (!segments.length) {
        console.error('Guide request returned an empty response');
        await add({
          role: 'bot',
          content: "I wasn't able to answer that right now. Try rephrasing, or explore the FAQ options above.",
        });
        return;
      }
      await add(...segments.map((segment) => ({ role: 'bot' as const, content: segment })));
    } catch (err) {
      console.error('Guide request failed:', err);
      setIsThinking(false);
      await add({
        role: 'bot',
        content: "I wasn't able to answer that right now. Try rephrasing, or explore the FAQ options above.",
      });
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
    if (ucMatch && hasGettingStarted(ucMatch)) {
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
        { role: 'bot', content: LIBRARIAN_REDIRECT }
      );
      return;
    }
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    await callLiveGuide(q);
  }

  function resetTier() {
    localStorage.removeItem(tierStorageKey);
    localStorage.removeItem(LEGACY_GUIDE_TIER_KEY);
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
    const otherUseCase = content.useCases.find(uc => !uc.gettingStarted);

    switch (screen) {
      case 'tier-select':
        return ([1, 2, 3] as GuideTier[]).map(t => (
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
            {otherUseCase && (
              <button className="guide-option-btn" onClick={() => handleUseCaseSelect(otherUseCase)}>
                I have something else in mind
              </button>
            )}
            <button className="guide-option-btn guide-option-btn--secondary" onClick={handleMainMenu}>↩ Main menu</button>
          </>
        );

      case 'faq-categories':
        return (
          <>
            {(['criticalUse', 'practical', 'concept'] as FaqCategory[]).map(cat => (
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
                    <div className="guide-copy-prompt">&quot;{msg.copyable}&quot;</div>
                    <button
                      className={`guide-copy-btn${copiedIdx === i ? ' guide-copy-btn--copied' : ''}`}
                      onClick={() => msg.copyable && handleCopy(msg.copyable, i)}
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
                {LIBRARIAN_REDIRECT}
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
