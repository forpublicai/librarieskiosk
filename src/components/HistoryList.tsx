'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import ConversationItem from '@/components/ui/ConversationItem';
import IconButton from '@/components/ui/IconButton';
import type { IconName } from '@/components/ui/Icon';

export interface HistoryEntry {
    id: string;
    title: string;
    updatedAt: string;
}

interface HistoryListProps {
    items: HistoryEntry[];
    activeId: string | null;
    icon: IconName;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    /** What one item is called, e.g. "chat" or "project". */
    noun: string;
}

function isToday(iso: string): boolean {
    const date = new Date(iso);
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

/** Past conversations, grouped into Today and Earlier. Delete asks once. */
export default function HistoryList({ items, activeId, icon, onSelect, onDelete, noun }: HistoryListProps) {
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const groups = [
        { label: 'Today', items: items.filter((c) => isToday(c.updatedAt)) },
        { label: 'Earlier', items: items.filter((c) => !isToday(c.updatedAt)) },
    ].filter((g) => g.items.length > 0);

    return (
        <>
            {groups.map((group) => (
                <div key={group.label} className="lk-history">
                    <p className="lk-history__group">{group.label}</p>
                    {group.items.map((c) => (
                        confirmId === c.id ? (
                            <div key={c.id} className="lk-history__confirm" role="group" aria-label={`Delete ${noun}`}>
                                <p>Delete &ldquo;{c.title}&rdquo;? You cannot undo this.</p>
                                <div className="lk-history__confirm-actions">
                                    <Button
                                        variant="danger"
                                        onClick={() => {
                                            setConfirmId(null);
                                            onDelete(c.id);
                                        }}
                                    >
                                        Delete
                                    </Button>
                                    <Button variant="quiet" onClick={() => setConfirmId(null)}>Keep</Button>
                                </div>
                            </div>
                        ) : (
                            <div key={c.id} className="lk-history__row">
                                <ConversationItem
                                    icon={icon}
                                    title={c.title}
                                    selected={c.id === activeId}
                                    onClick={() => onSelect(c.id)}
                                />
                                <IconButton
                                    icon="close"
                                    label={`Delete ${noun}: ${c.title}`}
                                    className="lk-history__delete"
                                    onClick={() => setConfirmId(c.id)}
                                />
                            </div>
                        )
                    ))}
                </div>
            ))}
        </>
    );
}
