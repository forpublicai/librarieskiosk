'use client';

import { useEffect, useState } from 'react';

function readInitialTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'dark';
    const saved = window.localStorage.getItem('theme');
    return saved === 'light' ? 'light' : 'dark';
}

export default function ThemeToggle() {
    const [theme, setTheme] = useState<'dark' | 'light'>(readInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggle = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
    };

    return (
        <button
            onClick={toggle}
            className="theme-toggle"
            aria-label="Toggle theme"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {theme === 'dark' ? '☀️' : '🌙'}
        </button>
    );
}
