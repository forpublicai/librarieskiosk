'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import IconButton from '@/components/ui/IconButton';

interface DialogProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    /** Buttons at the bottom. One primary at most. */
    actions?: ReactNode;
}

/**
 * A modal dialog on the native <dialog> element: it keeps focus inside,
 * closes on Escape and gives focus back to the button that opened it.
 * Not in the locked system; it follows the brand book (radius-lg, shadow-lg).
 */
export default function Dialog({ open, title, onClose, children, actions }: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (open && !el.open) el.showModal();
        if (!open && el.open) el.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            className="lk-dialog"
            aria-labelledby={titleId}
            onCancel={(e) => { e.preventDefault(); onClose(); }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {open && (
                <div className="lk-dialog__inner">
                    <div className="lk-dialog__head">
                        <h2 id={titleId} className="lk-heading">{title}</h2>
                        <IconButton icon="close" label="Close" onClick={onClose} />
                    </div>
                    {children}
                    {actions && <div className="lk-dialog__actions">{actions}</div>}
                </div>
            )}
        </dialog>
    );
}
