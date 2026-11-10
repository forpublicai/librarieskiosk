import { cx } from './cx';

interface SpinnerProps {
    /** What is happening, e.g. "Making your image…". */
    label?: string;
    /** Pixel size. Default 22. */
    size?: number;
    className?: string;
}

export default function Spinner({ label, size, className }: SpinnerProps) {
    return (
        <span className={cx('lk-spinner-wrap', className)} role="status">
            <span className="lk-spinner" aria-hidden="true" style={size ? { width: size, height: size } : undefined} />
            {label ? <span className="lk-spinner__label">{label}</span> : <span className="lk-sr">Loading</span>}
        </span>
    );
}
