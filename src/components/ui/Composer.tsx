'use client';

import { useEffect, useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import IconButton from './IconButton';
import { cx } from './cx';

const LINE_HEIGHT = 30;
const MAX_LINES = 6;
const VERTICAL_PADDING = 24;

interface ComposerProps {
    placeholder?: string;
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    /** Called with the trimmed text on Enter or the send button. */
    onSend?: (text: string) => void;
    /** The AI is working: shows Stop in place of Send. */
    busy?: boolean;
    onStop?: MouseEventHandler<HTMLButtonElement>;
    /** Blocks sending, e.g. while signed out. */
    disabled?: boolean;
    /** Line under the box. false hides it. */
    hint?: ReactNode | false;
    /** Screen-reader label. Default "Message". */
    label?: string;
    id?: string;
    className?: string;
}

/** One box that grows to six lines. Enter sends, Shift + Enter makes a new line. */
export default function Composer({
    placeholder = 'Type your message…',
    value: controlledValue,
    defaultValue = '',
    onChange,
    onSend,
    busy,
    onStop,
    disabled,
    hint,
    label = 'Message',
    id = 'lk-composer',
    className,
}: ComposerProps) {
    const [ownValue, setOwnValue] = useState(defaultValue);
    const controlled = controlledValue !== undefined;
    const value = controlled ? controlledValue : ownValue;
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_LINES * LINE_HEIGHT + VERTICAL_PADDING)}px`;
    }, [value]);

    const setValue = (next: string) => {
        if (!controlled) setOwnValue(next);
        onChange?.(next);
    };

    const send = () => {
        if (busy || disabled || !value.trim()) return;
        onSend?.(value.trim());
        setValue('');
    };

    return (
        <div className={cx('lk-composer-wrap', className)}>
            <form className="lk-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <label className="lk-sr" htmlFor={id}>{label}</label>
                <textarea
                    id={id}
                    ref={ref}
                    rows={1}
                    value={value}
                    placeholder={placeholder}
                    className="lk-composer__input"
                    disabled={disabled}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                />
                {busy ? (
                    <IconButton icon="stop" label="Stop" variant="primary" size="lg" onClick={onStop} />
                ) : (
                    <IconButton icon="send" label="Send message" variant="primary" size="lg" type="submit" disabled={disabled || !value.trim()} />
                )}
            </form>
            {hint !== false && (
                <p className="lk-composer__hint">{hint ?? 'Press Enter to send. Shift + Enter for a new line.'}</p>
            )}
        </div>
    );
}
