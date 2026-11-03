'use client';

import Button from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';

/** Labelled light/dark switch. The label names the theme it switches to. */
export default function ThemeToggle({ className }: { className?: string }) {
    const { theme, toggleTheme } = useTheme();
    const dark = theme === 'dark';

    return (
        <Button
            variant="quiet"
            icon={dark ? 'sun' : 'moon'}
            onClick={toggleTheme}
            className={className}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {dark ? 'Light' : 'Dark'}
        </Button>
    );
}
