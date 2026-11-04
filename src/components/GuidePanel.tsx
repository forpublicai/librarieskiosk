'use client';

import { useState, useEffect, useRef, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import CopyButton from '@/components/CopyButton';
import Button from '@/components/ui/Button';
import ChatMessage from '@/components/ui/ChatMessage';
import Icon, { type IconName } from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';
import Notice from '@/components/ui/Notice';
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
  fuzzyMatchFaqs,
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
  onClose: () => void;
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
          ? <a key={idx} href={part.href} target="_blank" rel="noopener noreferrer" className="lk-guide__link">{part.text}</a>
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

// Selector for anything Tab can reach inside the panel.
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DRAWER_QUERY = '(max-width: 900px)';

function subscribeDrawer(onChange: () => void) {
  const mq = window.matchMedia(DRAWER_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** True while the panel shows as a drawer (narrow screens and high zoom). */
function useDrawerMode() {
  return useSyncExternalStore(subscribeDrawer, () => window.matchMedia(DRAWER_QUERY).matches, () => false);
}

// After the panel closes, focus goes back to a visible guide button, or to
// the header menu button when the guide button sits in the closed menu.
function focusGuideButton() {
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-tour="guide-btn"], .lk-header__menu-btn'))
    .find((el) => el.offsetParent !== null);
  target?.focus();
}

/**
 * The panel frame: a column beside the thread on wide screens, a drawer over
 * the page below 900px. It is hidden (and out of the tab order) while closed.
 * In drawer mode focus moves in, Tab stays inside and Escape closes it.
 */
function GuideFrame({ isOpen, onClose, headerExtra, children }: {
  isOpen: boolean;
  onClose: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // Pages pass a new onClose each render; keep the latest one without re-running the effect.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const drawer = useDrawerMode();

  useEffect(() => {
    if (!isOpen) return;
    const panel = ref.current;
    if (window.matchMedia(DRAWER_QUERY).matches) panel?.querySelector<HTMLElement>('.lk-guide__close')?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Read the width on each key press: zoom can turn the column into a drawer while it is open.
      const drawer = window.matchMedia(DRAWER_QUERY).matches;
      if (e.key === 'Escape' && (drawer || panel?.contains(document.activeElement))) {
        onCloseRef.current();
        focusGuideButton();
        return;
      }
      if (!drawer || e.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const close = () => {
    onClose();
    focusGuideButton();
  };

  return (
    <>
      {isOpen && <div className="lk-guide__scrim" onClick={close} aria-hidden="true" />}
      <section
        ref={ref}
        className="lk-guide"
        aria-labelledby="lk-guide-title"
        hidden={!isOpen}
        role={drawer ? 'dialog' : undefined}
        aria-modal={drawer && isOpen ? true : undefined}
      >
        <div className="lk-guide__head">
          <h2 id="lk-guide-title" className="lk-heading">Learning guide</h2>
          <IconButton icon="close" label="Close the learning guide" className="lk-guide__close" onClick={close} />
        </div>
        {headerExtra}
        {children}
      </section>
    </>
  );
}

function GuideContentError({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <GuideFrame isOpen={isOpen} onClose={onClose}>
      <div className="lk-guide__body">
        <Notice tone="warning" title="The guide did not load">
          Please close it and try again, or ask a librarian.
        </Notice>
      </div>
    </GuideFrame>
  );
}


// Outer wrapper: lazy-loads the JSON for `tool` on first open, then delegates
// to the implementation component once content is available. Splitting it
// this way lets the implementation rely on `content: GuideContent` (non-null)
// without sprinkling guards through every handler.
export default function GuidePanel({ tool, isOpen, onClose }: GuidePanelProps) {
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
    return <GuideContentError isOpen={isOpen} onClose={onClose} />;
  }
  if (loadFailed) return <GuideContentError isOpen={isOpen} onClose={onClose} />;
  if (!content) return null;
  return <GuidePanelInner content={content} tool={tool} isOpen={isOpen} onClose={onClose} />;
}

function GuidePanelInner({ content, tool, isOpen, onClose }: GuidePanelProps & { content: GuideContent }) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [screen, setScreen] = useState<Screen>('tier-select');
  const [tier, setTier] = useState<GuideTier | null>(null);
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<FaqCategory | null>(null);
  const [visitedUseCases, setVisitedUseCases] = useState<Set<string>>(new Set());
  const [freeInput, setFreeInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [liveLimitReached, setLiveLimitReached] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const tierStorageKey = guideTierKey(user, token);
  const drawer = useDrawerMode();

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
      { role: 'bot', content: "Got it — I'll tailor explanations to your need. You can change this anytime with Change level at the top." },
      { role: 'bot', content: "What would you like help with?" }
    );
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
    const faqMatch = fuzzyMatchFaqs(q, allFaqs);
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

  // One choice in the options list. `back` is the quiet "Main menu" style.
  function option(key: string, label: ReactNode, onClick: () => void, kind: 'choice' | 'back' = 'choice', icon?: IconName) {
    return (
      <Button
        key={key}
        variant={kind === 'back' ? 'quiet' : 'secondary'}
        icon={kind === 'back' ? 'back' : icon}
        block
        className="lk-guide__option"
        onClick={onClick}
      >
        {label}
      </Button>
    );
  }

  function renderOptions() {
    const otherUseCase = content.useCases.find(uc => !uc.gettingStarted);
    const mainMenu = option('main-menu', 'Main menu', handleMainMenu, 'back');

    switch (screen) {
      case 'tier-select':
        return ([1, 2, 3] as GuideTier[]).map(t => option(`tier-${t}`, TIER_LABELS[t], () => handleTierSelect(t)));

      case 'entry-point':
        return (
          <>
            {option('what', 'What is this tool?', handleWhatIsIt)}
            {option('can', 'What can I do with this tool?', handleWhatCanIDo)}
            {option('faqs', 'Other key questions (FAQs)', handleGoToFaqs)}
          </>
        );

      case 'what-is-it':
        return (
          <>
            {option('can', 'What can I do with this tool?', handleWhatCanIDo)}
            {option('faqs', 'Other key questions (FAQs)', handleGoToFaqs)}
            {mainMenu}
          </>
        );

      case 'use-cases':
        return (
          <>
            {content.useCases.map(uc => option(
              uc.id,
              visitedUseCases.has(uc.id)
                ? <>{uc.label}<span className="lk-sr"> (seen)</span></>
                : uc.label,
              () => handleUseCaseSelect(uc),
              'choice',
              visitedUseCases.has(uc.id) ? 'check' : undefined,
            ))}
            {mainMenu}
          </>
        );

      case 'open-question':
        return mainMenu;

      case 'getting-started':
        return (
          <>
            {option('another', 'Explore another use', handleWhatCanIDo)}
            {option('faqs', 'Other key questions (FAQs)', handleGoToFaqs)}
            {otherUseCase && option('other', 'I have something else in mind', () => handleUseCaseSelect(otherUseCase))}
            {mainMenu}
          </>
        );

      case 'faq-categories':
        return (
          <>
            {(['criticalUse', 'practical', 'concept'] as FaqCategory[]).map(cat => (
              option(cat, FAQ_CATEGORY_LABELS[cat], () => handleFaqCategorySelect(cat))
            ))}
            {option('else', 'Something else? Type your question', handleSomethingElse, 'choice', 'chat')}
            {mainMenu}
          </>
        );

      case 'faq-list':
        return (
          <>
            {selectedFaqCategory && content.faqs[selectedFaqCategory].map((faq, i) => (
              option(`faq-${i}`, faq.q, () => handleFaqSelect(faq))
            ))}
            {option('else', 'Something else? Type your question', handleSomethingElse, 'choice', 'chat')}
            {option('back', 'Back to topics', handleGoToFaqs, 'back')}
          </>
        );

      case 'faq-answer':
        return (
          <>
            {option('more', 'More questions (FAQs)', handleGoToFaqs)}
            {mainMenu}
          </>
        );

      default:
        return null;
    }
  }

  const wordCount = countWords(freeInput);
  const tooLong = wordCount > MAX_INPUT_WORDS;
  const nearLimit = wordCount >= SOFT_WARN_WORDS && !tooLong;

  return (
    <GuideFrame
      isOpen={isOpen}
      onClose={onClose}
      headerExtra={
        <div className="lk-guide__tools">
          {tier && (
            <span className="lk-guide__level">
              <span className="lk-fine">Level: <strong>{TIER_SHORT_LABELS[tier]}</strong></span>
              <Button variant="quiet" onClick={resetTier}>Change level</Button>
            </span>
          )}
          <Button
            variant="quiet"
            onClick={() => {
              // As a drawer the guide covers the page and traps focus: close it so the tour can run.
              if (drawer) onClose();
              const key = `cm_${user?.username ?? 'anon'}_${tool}`;
              localStorage.removeItem(key);
              window.dispatchEvent(new CustomEvent('cm-restart', { detail: { tool } }));
            }}
          >
            Show the page tour again
          </Button>
        </div>
      }
    >
      <div className="lk-guide__body">
        <div className="lk-guide__messages" aria-live="polite">
          {messages.map((msg, i) => (
            msg.role === 'user' ? (
              <ChatMessage key={i} role="user">{msg.content}</ChatMessage>
            ) : (
              <ChatMessage
                key={i}
                actions={msg.copyable ? <CopyButton text={msg.copyable} label="Copy prompt" /> : undefined}
              >
                <p className="lk-guide__text">{renderText(msg.content)}</p>
                {msg.copyable && <p className="lk-guide__prompt">“{msg.copyable}”</p>}
              </ChatMessage>
            )
          ))}
          {isThinking && <ChatMessage thinking />}
          <div ref={messagesEndRef} />
        </div>

        <div className="lk-guide__options">
          {renderOptions()}
        </div>
      </div>

      {screen !== 'tier-select' && (
        <div className="lk-guide__ask">
          {liveLimitReached && (
            <Notice tone="info">{LIBRARIAN_REDIRECT}</Notice>
          )}
          <form className="lk-guide__form" onSubmit={(e: FormEvent) => handleFreeInputSubmit(e)}>
            <label className="lk-field__label" htmlFor={`lk-guide-input-${tool}`}>
              {screen === 'open-question' ? 'Describe what you have in mind' : 'Ask your own question'}
            </label>
            <div className="lk-guide__row">
              <input
                id={`lk-guide-input-${tool}`}
                ref={inputRef}
                className="lk-field__control"
                value={freeInput}
                onChange={e => setFreeInput(e.target.value)}
                aria-invalid={tooLong ? true : undefined}
                aria-describedby={nearLimit || tooLong ? `lk-guide-count-${tool}` : undefined}
              />
              <IconButton icon="send" label="Ask the guide" variant="primary" type="submit" disabled={!freeInput.trim() || tooLong} />
            </div>
            {(nearLimit || tooLong) && (
              <p
                id={`lk-guide-count-${tool}`}
                className={tooLong ? 'lk-field__error' : 'lk-field__hint'}
              >
                {tooLong && <Icon name="alert" size={20} />}
                {tooLong
                  ? `That is ${wordCount} words. Please keep it under ${MAX_INPUT_WORDS}.`
                  : `${wordCount} of ${MAX_INPUT_WORDS} words. Keep it short.`}
              </p>
            )}
          </form>
        </div>
      )}
    </GuideFrame>
  );
}
