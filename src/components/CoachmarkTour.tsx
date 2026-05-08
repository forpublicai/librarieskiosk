'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';

const PAD = 10;
const TIP_W = 300;

interface Step {
  target: string;
  title: string;
  body: string;
  pos: 'top' | 'bottom' | 'left' | 'right';
}

const TOURS: Record<string, Step[]> = {
  chat: [
    { target: 'chat-sidebar',  title: 'Chat history',        body: 'Your conversations are saved here. Click any to pick up where you left off.',                                                                       pos: 'right'  },
    { target: 'chat-messages', title: 'Conversation area',   body: 'Messages from you and the AI appear here. Scroll up to review earlier in the chat.',                                                               pos: 'right'  },
    { target: 'chat-input',    title: 'Type here',           body: 'Ask a question or make a request. Press Enter or click the arrow to send.',                                                                        pos: 'top'    },
    { target: 'guide-btn',     title: 'Learning Guide',      body: 'Click here for guided support — prompts, examples, tips, and FAQs tailored to this tool.',                                                       pos: 'bottom' },
  ],
  image: [
    { target: 'image-sidebar', title: 'Image history',       body: 'Every image you generate is saved here. Click one to view it again.',                                                                              pos: 'right'  },
    { target: 'image-prompt',  title: 'Describe your image', body: 'Type what you want to see. The more specific your description, the better the result.',                                                            pos: 'bottom' },
    { target: 'image-result',  title: 'Generated image',     body: 'Your result appears here once ready. Use the Download button beneath it to save the file.',                                                        pos: 'top'    },
    { target: 'guide-btn',     title: 'Learning Guide',      body: 'Click here for guided support — prompts, examples, art style suggestions, tips, and FAQs.',                                                        pos: 'bottom' },
  ],
  video: [
    { target: 'video-sidebar',  title: 'Video history',      body: 'Your generated clips are saved here.',                                                                                                             pos: 'right'  },
    { target: 'video-prompt',   title: 'Describe your scene',body: "Describe what's happening, the setting, and the mood. Including movement gives better results.",                                                   pos: 'bottom' },
    { target: 'video-duration', title: 'Duration slider',    body: 'Choose clip length (3–15 seconds). Start short — shorter clips use fewer credits and generate faster.',                                            pos: 'top'    },
    { target: 'video-result',   title: 'Generated clip',     body: 'Your video appears here once ready. Generation usually takes 1–4 minutes.',                                                                        pos: 'top'    },
    { target: 'guide-btn',      title: 'Learning Guide',     body: 'Click here for guided support — prompts, examples, tips, and FAQs.',                                                                               pos: 'bottom' },
  ],
  music: [
    { target: 'music-sidebar',      title: 'Track history',     body: 'Your generated tracks are saved here.',                                                                                                         pos: 'right'  },
    { target: 'music-form',         title: 'Create your track', body: 'Describe the style, mood, or genre. Optionally add lyrics and adjust the duration before generating.',                                          pos: 'bottom' },
    { target: 'music-instrumental', title: 'Instrumental only', body: 'Check this to generate a track without vocals. When unchecked, you can add your own lyrics above — or leave it blank for AI-generated lyrics.', pos: 'top'    },
    { target: 'music-result',       title: 'Generated track',   body: 'Your audio appears here once ready. You can listen or download the track from here.',                                                           pos: 'top'    },
    { target: 'guide-btn',          title: 'Learning Guide',    body: 'Click here for guided support — prompts, examples, tips, and music FAQs.',                                                                      pos: 'bottom' },
  ],
  code: [
    { target: 'code-sidebar', title: 'Projects',              body: 'Your coding sessions are saved here. Start a new project or continue one from the list.',                                                         pos: 'right'  },
    { target: 'code-chat',    title: 'Chat panel',            body: 'Describe what you want to build or ask a coding question. No coding knowledge needed.',                                                           pos: 'right'  },
    { target: 'code-output',  title: 'Code output',           body: 'Generated code appears here. Copy it or ask follow-up questions in the chat to refine it.',                                                       pos: 'left'   },
    { target: 'guide-btn',    title: 'Learning Guide',        body: 'Click here for guided support — prompts, examples, tips, and coding FAQs for creating websites, apps and scripts.',                               pos: 'bottom' },
  ],
};

interface Rect { top: number; left: number; width: number; height: number; }

function getRect(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tipPos(rect: Rect, pos: Step['pos']): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const clampX = (x: number) => Math.max(16, Math.min(x, vw - TIP_W - 16));
  switch (pos) {
    case 'bottom': return { top: rect.top + rect.height + PAD + 14,                                                   left: clampX(cx - TIP_W / 2) };
    case 'top':    return { top: Math.max(16, rect.top - PAD - 14 - 180),                                             left: clampX(cx - TIP_W / 2) };
    case 'right':  return { top: Math.max(16, Math.min(rect.top + rect.height / 2 - 80, vh - 220)), left: Math.min(rect.left + rect.width + PAD + 14, vw - TIP_W - 16) };
    case 'left':   return { top: Math.max(16, Math.min(rect.top + rect.height / 2 - 80, vh - 220)), left: Math.max(16, rect.left - PAD - 14 - TIP_W) };
  }
}

export default function CoachmarkTour({ tool }: { tool: string }) {
  const { user } = useAuth();
  const steps = TOURS[tool] ?? [];
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState(false);

  // Key by username so each patron gets their own tour state, persists across sessions
  const storageKey = `cm_${user?.username ?? 'anon'}_${tool}`;

  useEffect(() => {
    if (!steps.length || !user) return;
    if (localStorage.getItem(storageKey)) return;
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, [tool, steps.length, user, storageKey]);

  const step = steps[stepIdx];

  useEffect(() => {
    if (!visible || !step) return;
    const update = () => setRect(getRect(step.target));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [visible, step]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tool !== tool) return;
      setStepIdx(0);
      setRect(null);
      setVisible(true);
    };
    window.addEventListener('cm-restart', handler);
    return () => window.removeEventListener('cm-restart', handler);
  }, [tool]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(storageKey, 'true');
  }, [storageKey]);

  const next = useCallback(() => {
    if (stepIdx >= steps.length - 1) { dismiss(); return; }
    setStepIdx(i => i + 1);
  }, [stepIdx, steps.length, dismiss]);

  const back = useCallback(() => {
    setStepIdx(i => Math.max(0, i - 1));
  }, []);

  if (!visible || !step || !rect) return null;

  const ts = tipPos(rect, step.pos);

  return (
    <div className="cm-root">
      <div className="cm-backdrop" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) }} />
      <div className="cm-backdrop" style={{ top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
      <div className="cm-backdrop" style={{ top: rect.top - PAD, left: rect.left + rect.width + PAD, right: 0, height: rect.height + PAD * 2 }} />
      <div className="cm-backdrop" style={{ top: rect.top + rect.height + PAD, left: 0, right: 0, bottom: 0 }} />
      <div className="cm-ring" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      <div key={stepIdx} className="cm-tooltip" style={{ position: 'fixed', width: TIP_W, ...ts }}>
        <div className="cm-counter">{stepIdx + 1} / {steps.length}</div>
        <div className="cm-title">{step.title}</div>
        <p className="cm-body">{step.body}</p>
        <div className="cm-actions">
          <button className="cm-skip" onClick={dismiss}>Skip tour</button>
          <div style={{ display: 'flex', gap: '6px' }}>
            {stepIdx > 0 && (
              <button className="cm-back" onClick={back}>← Back</button>
            )}
            <button className="cm-next" onClick={next}>
              {stepIdx >= steps.length - 1 ? 'Got it!' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
