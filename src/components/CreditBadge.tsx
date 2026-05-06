'use client';

import type { HTMLAttributes } from 'react';
import { formatCreditRenewalTitle } from '@/lib/creditRenewal';

interface CreditBadgeProps extends HTMLAttributes<HTMLSpanElement> {
    renewAt?: string | null;
}

export default function CreditBadge({
    children,
    className,
    renewAt,
    title,
    ...props
}: CreditBadgeProps) {
    const renewalTitle = title ?? formatCreditRenewalTitle(renewAt);

    return (
        <span
            {...props}
            className={className ? `credit-badge ${className}` : 'credit-badge'}
            title={renewalTitle}
        >
            {children}
        </span>
    );
}
