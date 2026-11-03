import type { ReactNode } from 'react';
import { cx } from './cx';

/** A sun marker behind one key word. Use once, in the Home greeting. */
export default function Highlight({ children, className }: { children: ReactNode; className?: string }) {
    return <span className={cx('lk-highlight', className)}>{children}</span>;
}
