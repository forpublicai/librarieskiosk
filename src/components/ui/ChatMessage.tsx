import type { ReactNode } from 'react';
import Spinner from './Spinner';
import { cx } from './cx';

interface ChatMessageProps {
    /** Default 'assistant'. */
    role?: 'user' | 'assistant';
    /** The message: text, paragraphs, lists, pre/code, images. */
    children?: ReactNode;
    /** Quiet Buttons under an assistant reply. */
    actions?: ReactNode;
    /** Optional timestamp. */
    time?: string;
    /** true or a status string: shows the spinner in place of a reply. */
    thinking?: boolean | string;
    className?: string;
}

/** The patron's message sits right in a cobalt bubble. The AI's reply sits left with no bubble. */
export default function ChatMessage({ role = 'assistant', children, actions, time, thinking, className }: ChatMessageProps) {
    if (thinking) {
        return (
            <div className={cx('lk-msg', 'lk-msg--assistant', className)}>
                <Spinner label={thinking === true ? 'Thinking…' : thinking} />
            </div>
        );
    }
    return (
        <div className={cx('lk-msg', `lk-msg--${role}`, className)}>
            <div className="lk-msg__body">{children}</div>
            {role === 'assistant' && actions && <div className="lk-msg__actions">{actions}</div>}
            {time && <div className="lk-msg__time">{time}</div>}
        </div>
    );
}
