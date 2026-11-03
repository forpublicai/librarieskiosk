import { cx } from './cx';

// 24px grid, 2px stroke, round caps. p = path, c = circle, r = rect.
type IconPart = ['p', string] | ['c', number, number, number] | ['r', number, number, number, number, number];

const ICONS = {
    chat: [['p', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z']],
    image: [['r', 3, 3, 18, 18, 3], ['c', 9, 9, 2], ['p', 'M21 15l-5-5L5 21']],
    music: [['p', 'M9 18V5l12-2v13'], ['c', 6, 18, 3], ['c', 18, 16, 3]],
    video: [['r', 2, 6, 14, 12, 2], ['p', 'M16 10l6-4v12l-6-4z']],
    code: [['p', 'M8 6l-6 6 6 6'], ['p', 'M16 6l6 6-6 6']],
    send: [['p', 'M12 19V5'], ['p', 'M5 12l7-7 7 7']],
    stop: [['r', 6, 6, 12, 12, 2]],
    plus: [['p', 'M12 5v14'], ['p', 'M5 12h14']],
    back: [['p', 'M19 12H5'], ['p', 'M12 19l-7-7 7-7']],
    home: [['p', 'M3 11l9-8 9 8'], ['p', 'M5 10v10h14V10']],
    user: [['c', 12, 8, 4], ['p', 'M4 21a8 8 0 0 1 16 0']],
    credits: [['c', 12, 12, 9], ['c', 12, 12, 4]],
    sun: [['c', 12, 12, 4], ['p', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4']],
    moon: [['p', 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z']],
    signout: [['p', 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'], ['p', 'M16 17l5-5-5-5'], ['p', 'M21 12H9']],
    copy: [['r', 9, 9, 12, 12, 2], ['p', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1']],
    download: [['p', 'M12 3v12'], ['p', 'M7 10l5 5 5-5'], ['p', 'M5 21h14']],
    help: [['c', 12, 12, 9], ['p', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3'], ['p', 'M12 17h.01']],
    check: [['p', 'M5 12.5l4.5 4.5L19 7']],
    alert: [['c', 12, 12, 9], ['p', 'M12 7v6'], ['p', 'M12 16.5h.01']],
    menu: [['p', 'M4 6h16M4 12h16M4 18h16']],
    close: [['p', 'M6 6l12 12M18 6L6 18']],
} satisfies Record<string, IconPart[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
    /** Which icon to draw. */
    name: IconName;
    /** Pixel size. Default 24. */
    size?: number;
    /** Accessible name. Only when the icon stands alone and carries meaning. */
    label?: string;
    className?: string;
}

export default function Icon({ name, size = 24, label, className }: IconProps) {
    const parts: IconPart[] = ICONS[name] ?? [];
    return (
        <svg
            className={cx('lk-icon', className)}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden={label ? undefined : true}
            aria-label={label}
            role={label ? 'img' : undefined}
        >
            {parts.map((part, i) => {
                if (part[0] === 'p') return <path key={i} d={part[1]} />;
                if (part[0] === 'c') return <circle key={i} cx={part[1]} cy={part[2]} r={part[3]} />;
                return <rect key={i} x={part[1]} y={part[2]} width={part[3]} height={part[4]} rx={part[5]} />;
            })}
        </svg>
    );
}
