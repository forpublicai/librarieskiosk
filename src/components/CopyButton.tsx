'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

/** Quiet Copy button that confirms with "Copied" for two seconds. */
export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <Button
            variant="quiet"
            icon={copied ? 'check' : 'copy'}
            onClick={() => {
                navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => {});
            }}
        >
            {copied ? 'Copied' : label}
        </Button>
    );
}
