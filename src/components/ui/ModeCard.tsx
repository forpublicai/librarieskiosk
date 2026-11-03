import type { MouseEventHandler } from 'react';
import ToolShape, { type ToolName } from './ToolShape';
import { cx } from './cx';

interface ModeCardProps {
    /** Sets the tint and the shape. */
    tool: ToolName;
    /** One word: Chat, Image, Music, Video, Code. */
    title: string;
    /** One plain sentence. */
    description: string;
    /** Cost of one use, e.g. from formatModeCost. */
    cost?: string;
    /** Solid red-strong field for the first, most-used tool. */
    hero?: boolean;
    /** Renders a link when set. */
    href?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
    className?: string;
}

/** A big tappable color field that opens one tool, with the tool's shape in its corner. */
export default function ModeCard({ tool, title, description, cost, hero, href, onClick, className }: ModeCardProps) {
    const classes = cx('lk-mode', `lk-tool--${tool}`, hero && 'lk-mode--hero', className);
    const content = (
        <>
            <span className="lk-mode__text">
                <span className="lk-mode__title">{title}</span>
                <span className="lk-mode__desc">{description}</span>
                {cost && <span className="lk-mode__cost">{cost}</span>}
            </span>
            <ToolShape tool={tool} size={hero ? 240 : 100} className="lk-mode__shape" />
        </>
    );

    if (href) {
        return <a className={classes} href={href} onClick={onClick}>{content}</a>;
    }
    return <button type="button" className={classes} onClick={onClick}>{content}</button>;
}
