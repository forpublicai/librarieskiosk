import { formatCreditRenewalTitle } from '@/lib/creditRenewal';
import Icon from './Icon';
import { cx } from './cx';

interface CreditBadgeProps {
    credits: number;
    /** ISO time of the next renewal. Shown as the tooltip. */
    renewAt?: string | null;
    /** At or below this the badge shows a warning. Default 5. */
    lowAt?: number;
    className?: string;
}

/** A neutral pill with one sun coin. Low credits turn the coin into a danger alert. */
export default function CreditBadge({ credits, renewAt, lowAt = 5, className }: CreditBadgeProps) {
    const low = credits <= lowAt;
    return (
        <span className={cx('lk-credits', low && 'lk-credits--low', className)} title={formatCreditRenewalTitle(renewAt)}>
            {low ? <Icon name="alert" size={20} /> : <span className="lk-coin" aria-hidden="true" />}
            <span>
                <strong>{credits}</strong> {credits === 1 ? 'credit' : 'credits'}{low ? ' left' : ''}
            </span>
        </span>
    );
}
