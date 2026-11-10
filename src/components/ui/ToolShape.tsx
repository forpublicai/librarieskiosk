import type { ReactNode } from 'react';
import { cx } from './cx';

export type ToolName = 'chat' | 'image' | 'music' | 'video' | 'code';

// Solid shape art for each tool, drawn on a 120 grid.
const TOOL_SHAPES: Record<ToolName, () => ReactNode> = {
    chat: () => (
        <path className="lk-fill-main" d="M24 12h76a16 16 0 0 1 16 16v46a16 16 0 0 1-16 16H54l-28 24V90h-2A16 16 0 0 1 8 74V28a16 16 0 0 1 16-16z" />
    ),
    image: () => (
        <>
            <circle className="lk-fill-main" cx={80} cy={40} r={24} />
            <path className="lk-fill-ink" d="M0 120a60 60 0 0 1 120 0z" />
        </>
    ),
    music: () => (
        <>
            <circle className="lk-fill-main" cx={0} cy={120} r={30} />
            <circle className="lk-stroke-main" cx={0} cy={120} r={62} strokeWidth={16} fill="none" />
            <circle className="lk-stroke-main" cx={0} cy={120} r={98} strokeWidth={16} fill="none" />
        </>
    ),
    video: () => (
        <path className="lk-fill-main lk-stroke-main" d="M36 22L100 60L36 98Z" strokeWidth={18} strokeLinejoin="round" />
    ),
    code: () => (
        <>
            <path className="lk-fill-main" d="M14 14l92 30v20l-92 30V74l62-20-62-20z" />
            <rect className="lk-fill-main" x={14} y={100} width={92} height={18} />
        </>
    ),
};

interface ToolShapeProps {
    tool: ToolName;
    /** Pixel size. Default 120. */
    size?: number;
    className?: string;
}

export default function ToolShape({ tool, size = 120, className }: ToolShapeProps) {
    return (
        <svg
            className={cx('lk-shape', `lk-tool--${tool}`, className)}
            width={size}
            height={size}
            viewBox="0 0 120 120"
            aria-hidden="true"
        >
            {TOOL_SHAPES[tool]()}
        </svg>
    );
}
