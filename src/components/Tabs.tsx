'use client';

import { useRef, type KeyboardEvent } from 'react';
import Icon, { type IconName } from '@/components/ui/Icon';

export interface TabItem<T extends string> {
    id: T;
    label: string;
    icon?: IconName;
}

interface TabsProps<T extends string> {
    items: TabItem<T>[];
    value: T;
    onChange: (id: T) => void;
    /** Accessible name of the tab list. */
    label: string;
}

/**
 * A row of tabs drawn as chips (the system styles tabs with `label` type and
 * the chip shape). Arrow keys move between tabs.
 */
export default function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
    const listRef = useRef<HTMLDivElement>(null);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const index = items.findIndex((t) => t.id === value);
        const next = items[(index + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
        onChange(next.id);
        listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
    };

    return (
        <div ref={listRef} className="lk-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
            {items.map((t) => {
                const selected = t.id === value;
                return (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`tab-${t.id}`}
                        data-tab={t.id}
                        aria-selected={selected}
                        aria-controls={`panel-${t.id}`}
                        tabIndex={selected ? 0 : -1}
                        className={selected ? 'lk-chip lk-chip--selected' : 'lk-chip'}
                        onClick={() => onChange(t.id)}
                    >
                        {t.icon && <Icon name={t.icon} size={20} />}
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}
