'use client';

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Button from '@/components/ui/Button';

const PAD = 8;
const GAP = 16;
const EDGE = 16;
const TIP_MAX_W = 380;

interface Step {
  target: string;
  title: string;
  body: string;
  pos: 'top' | 'bottom' | 'left' | 'right';
}

const GUIDE_STEP: Step = {
  target: 'guide-btn',
  title: 'Learning guide',
  body: 'Open the guide for example prompts, tips and answers to common questions.',
  pos: 'bottom',
};

const TOURS: Record<string, Step[]> = {
  chat: [
    { target: 'chat-sidebar',  title: 'Your chats',         body: 'Your past chats are saved here. Pick one to carry on where you left off.',                     pos: 'right' },
    { target: 'chat-messages', title: 'Your conversation',  body: 'Your messages and the AI’s replies show here. Scroll up to see earlier ones.',                  pos: 'left'  },
    { target: 'chat-input',    title: 'Type here',          body: 'Ask a question or ask for help. Press Enter or the arrow button to send.',                      pos: 'top'   },
    GUIDE_STEP,
  ],
  image: [
    { target: 'image-sidebar', title: 'Your pictures',        body: 'Every picture you make is saved here. Pick one to see it again.',                             pos: 'right' },
    { target: 'image-prompt',  title: 'Describe your picture', body: 'Say what you want to see. More detail gives a better picture.',                              pos: 'top'   },
    { target: 'image-result',  title: 'Your picture',         body: 'Your picture shows here when it is ready. Use Download under it to save it.',                 pos: 'left'  },
    GUIDE_STEP,
  ],
  video: [
    { target: 'video-sidebar',  title: 'Your videos',         body: 'Every clip you make is saved here.',                                                          pos: 'right' },
    { target: 'video-prompt',   title: 'Describe your scene', body: 'Say what happens, where, and the mood. Mention movement for a better clip.',                   pos: 'top'   },
    { target: 'video-duration', title: 'Clip length',         body: 'Choose how long the clip is. Shorter clips use fewer credits and are ready sooner.',           pos: 'top'   },
    { target: 'video-result',   title: 'Your video',          body: 'Your clip shows here when it is ready. This usually takes 1 to 4 minutes.',                   pos: 'left'  },
    GUIDE_STEP,
  ],
  music: [
    { target: 'music-sidebar',      title: 'Your songs',   body: 'Every song you make is saved here.',                                                                  pos: 'right' },
    { target: 'music-form',         title: 'Make a song',  body: 'Describe the style, the mood or the kind of music. You can add your own words too.',                  pos: 'top'   },
    { target: 'music-instrumental', title: 'Instrumental', body: 'Turn this on for music with no singing. Leave it off to add your own words, or let the AI write them.', pos: 'top'   },
    { target: 'music-result',       title: 'Your song',    body: 'Your song shows here when it is ready. You can play it or download it.',                              pos: 'left'  },
    GUIDE_STEP,
  ],
  code: [
    { target: 'code-sidebar', title: 'Your projects', body: 'Your coding chats are saved here. Start a new one, or carry on with one from the list.',                   pos: 'right' },
    { target: 'code-chat',    title: 'Chat',          body: 'Say what you want to build, or ask a coding question. You do not need to know how to code.',               pos: 'right' },
    { target: 'code-output',  title: 'Code',          body: 'The code shows here. Copy it, or ask in the chat to change it.',                                           pos: 'left'  },
    GUIDE_STEP,
  ],
};

interface Rect { top: number; left: number; width: number; height: number; }

/** The first visible element for a tour target. Hidden ones (a closed drawer, a folded header item) do not count. */
function findTarget(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return all.find((el) => {
    if (el.closest('[hidden], [inert]')) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  }) ?? null;
}

function getRect(target: string): Rect | null {
  const el = findTarget(target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Puts the tip on the preferred side; flips or clamps so it stays fully on screen. */
function placeTip(rect: Rect, pos: Step['pos'], w: number, h: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, max: number) => Math.max(EDGE, Math.min(v, max - EDGE));
  const cx = rect.left + rect.width / 2 - w / 2;
  const cy = rect.top + rect.height / 2 - h / 2;
  const below = rect.top + rect.height + PAD + GAP;
  const above = rect.top - PAD - GAP - h;
  const right = rect.left + rect.width + PAD + GAP;
  const left = rect.left - PAD - GAP - w;

  const fits = {
    bottom: below + h <= vh - EDGE,
    top: above >= EDGE,
    right: right + w <= vw - EDGE,
    left: left >= EDGE,
  };
  const order: Step['pos'][] = [pos, ...(['bottom', 'top', 'right', 'left'] as const).filter((p) => p !== pos)];
  const side = order.find((p) => fits[p]);

  switch (side) {
    case 'bottom': return { top: below, left: clamp(cx, vw - w) };
    case 'top': return { top: above, left: clamp(cx, vw - w) };
    case 'right': return { top: clamp(cy, vh - h), left: right };
    case 'left': return { top: clamp(cy, vh - h), left };
    // Nothing fits (a large target on a small screen): sit at the bottom edge, over the target.
    default: return { top: Math.max(EDGE, vh - h - EDGE), left: clamp(cx, vw - w) };
  }
}

export default function CoachmarkTour({ tool }: { tool: string }) {
  const { user } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const hasTour = (TOURS[tool] ?? []).length > 0;

  // Key by username so each patron gets their own tour state, persists across sessions
  const storageKey = `cm_${user?.username ?? 'anon'}_${tool}`;

  // Only steps whose target is on screen now. Hidden targets (the sidebar
  // drawer on a phone, the guide button inside the header menu) are skipped.
  const start = useCallback(() => {
    const shown = (TOURS[tool] ?? []).filter((s) => findTarget(s.target));
    if (!shown.length) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSteps(shown);
    setStepIdx(0);
    setRect(null);
    setTipPos(null);
    setVisible(true);
  }, [tool]);

  useEffect(() => {
    if (!hasTour || !user) return;
    if (localStorage.getItem(storageKey)) return;
    const t = setTimeout(start, 500);
    return () => clearTimeout(t);
  }, [hasTour, user, storageKey, start]);

  const step = steps[stepIdx];

  useEffect(() => {
    if (!visible || !step) return;
    // If the target goes away (a resize or zoom hides it), close the tour
    // so its key handler does not trap focus behind nothing. It is not marked
    // as seen; the guide can start it again.
    const update = () => {
      const next = getRect(step.target);
      if (!next) setVisible(false);
      setRect(next);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [visible, step]);

  // Measure the tip after it renders, then place it next to the target.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || !rect || !step) return;
    setTipPos(placeTip(rect, step.pos, tip.offsetWidth, tip.offsetHeight));
  }, [rect, step]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tool !== tool) return;
      start();
    };
    window.addEventListener('cm-restart', handler);
    return () => window.removeEventListener('cm-restart', handler);
  }, [tool, start]);

  // Focus goes back where it was. If that control is gone or hidden (the guide
  // drawer closed for the tour), it goes to the guide button or the header menu.
  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(storageKey, 'true');
    const previous = returnFocusRef.current;
    const target = previous && previous.isConnected && previous.offsetParent !== null && previous !== document.body
      ? previous
      : Array.from(document.querySelectorAll<HTMLElement>('[data-tour="guide-btn"], .lk-header__menu-btn')).find((el) => el.offsetParent !== null);
    target?.focus();
  }, [storageKey]);

  const next = useCallback(() => {
    if (stepIdx >= steps.length - 1) { dismiss(); return; }
    setStepIdx(i => i + 1);
  }, [stepIdx, steps.length, dismiss]);

  const back = useCallback(() => {
    setStepIdx(i => Math.max(0, i - 1));
  }, []);

  // Each step: focus the main button. Escape skips the tour; Tab stays in the tip.
  useEffect(() => {
    if (!visible || !tipPos) return;
    const tip = tipRef.current;
    tip?.querySelector<HTMLElement>('.lk-btn--primary')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { dismiss(); return; }
      if (e.key !== 'Tab' || !tip) return;
      const buttons = Array.from(tip.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || !tip.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !tip.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // tipPos changes once per step, after the tip is placed.
  }, [visible, tipPos, dismiss]);

  if (!visible || !step || !rect) return null;

  const isLast = stepIdx >= steps.length - 1;

  return (
    <div className="lk-tour">
      <div className="lk-tour__shade" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) }} />
      <div className="lk-tour__shade" style={{ top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
      <div className="lk-tour__shade" style={{ top: rect.top - PAD, left: rect.left + rect.width + PAD, right: 0, height: rect.height + PAD * 2 }} />
      <div className="lk-tour__shade" style={{ top: rect.top + rect.height + PAD, left: 0, right: 0, bottom: 0 }} />
      <div className="lk-tour__ring" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      <div
        ref={tipRef}
        className="lk-tour__tip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lk-tour-title"
        aria-describedby="lk-tour-body"
        style={{
          width: `min(${TIP_MAX_W}px, calc(100vw - ${EDGE * 2}px))`,
          top: tipPos?.top ?? 0,
          left: tipPos?.left ?? 0,
          visibility: tipPos ? 'visible' : 'hidden',
        }}
      >
        <p className="lk-tour__count">Step {stepIdx + 1} of {steps.length}</p>
        <h2 id="lk-tour-title" className="lk-heading">{step.title}</h2>
        <p id="lk-tour-body">{step.body}</p>
        <div className="lk-tour__actions">
          <Button variant="quiet" onClick={dismiss}>Skip tour</Button>
          <span className="lk-tour__nav">
            {stepIdx > 0 && <Button icon="back" onClick={back}>Back</Button>}
            <Button variant="primary" onClick={next}>{isLast ? 'Done' : 'Next'}</Button>
          </span>
        </div>
      </div>
    </div>
  );
}
