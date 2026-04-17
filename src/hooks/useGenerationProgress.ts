'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Drives the waiting-state UX for generation flows.
 *
 * When `active` is true it exposes:
 *   - `elapsedSec`: seconds since activation, updated every second.
 *   - `message`: a rotating status message drawn from `messages`, advancing
 *     every `intervalSec` seconds so the user sees motion instead of a
 *     frozen spinner.
 *
 * When `active` flips to false the state resets, so the same hook can be
 * re-used across multiple generations without remounting the component.
 *
 * No network calls — this is purely client-driven "progress theater" that
 * gives the user something to look at while the real work completes
 * server-side. The messages are intentionally specific to each stage of the
 * pipeline (queueing, composing, rendering, finalizing) so it doesn't feel
 * like a generic "loading" placeholder.
 */
export interface UseGenerationProgressOptions {
    active: boolean;
    messages: string[];
    /** Seconds between message rotations. Default 2.5s. */
    intervalSec?: number;
}

export interface GenerationProgress {
    elapsedSec: number;
    message: string;
}

export function useGenerationProgress({
    active,
    messages,
    intervalSec = 2.5,
}: UseGenerationProgressOptions): GenerationProgress {
    const [elapsedSec, setElapsedSec] = useState(0);
    const [messageIndex, setMessageIndex] = useState(0);
    const startedAtRef = useRef<number | null>(null);

    useEffect(() => {
        if (!active) {
            setElapsedSec(0);
            setMessageIndex(0);
            startedAtRef.current = null;
            return;
        }

        startedAtRef.current = Date.now();
        setElapsedSec(0);
        setMessageIndex(0);

        const elapsedTick = setInterval(() => {
            if (startedAtRef.current == null) return;
            setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }, 1000);

        const messageTick = setInterval(() => {
            setMessageIndex((i) => (i + 1) % Math.max(messages.length, 1));
        }, Math.max(intervalSec * 1000, 500));

        return () => {
            clearInterval(elapsedTick);
            clearInterval(messageTick);
        };
    }, [active, messages.length, intervalSec]);

    return {
        elapsedSec,
        message: messages.length > 0 ? messages[messageIndex % messages.length] : '',
    };
}

export function formatElapsed(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}
