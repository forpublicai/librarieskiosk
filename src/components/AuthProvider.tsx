'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clearAllGuestState } from '@/lib/guestSession';

interface User {
    id: string;
    username: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'PATRON' | 'GUEST';
    status: 'PENDING' | 'APPROVED' | 'BANNED';
    credits: number;
    library: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    loginAsGuest: () => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
    const hadActivityRef = useRef(false);

    const logout = useCallback(() => {
        // If guest user, clean up ephemeral session data before logout
        if (user?.role === 'GUEST' && token) {
            fetch('/api/auth/cleanup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            }).catch((e) => console.error('Cleanup failed:', e));
        }

        // Release server-side session slot (no-op for roles that don't have one)
        if (token) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
        }

        setUser(null);
        setToken(null);
        localStorage.removeItem('kiosk_token');
        clearAllGuestState();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        router.push('/');
    }, [user, token, router]);

    // Inactivity timer
    const resetTimer = useCallback(() => {
        hadActivityRef.current = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (token) {
            timeoutRef.current = setTimeout(() => {
                logout();
            }, INACTIVITY_TIMEOUT_MS);
        }
    }, [token, logout]);

    useEffect(() => {
        const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
        events.forEach((e) => window.addEventListener(e, resetTimer));
        resetTimer();
        return () => {
            events.forEach((e) => window.removeEventListener(e, resetTimer));
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [resetTimer]);

    // Server-side heartbeat — only pings when the user has interacted since
    // the last tick, so idle kiosks let their server session lapse.
    useEffect(() => {
        if (!token || user?.role !== 'PATRON') return;
        hadActivityRef.current = true; // count the login itself as activity
        const tick = async () => {
            if (!hadActivityRef.current) return;
            hadActivityRef.current = false;
            try {
                const res = await fetch('/api/auth/heartbeat', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.status === 401) logout();
            } catch {
                // network hiccup — try again next interval
            }
        };
        heartbeatRef.current = setInterval(tick, HEARTBEAT_INTERVAL_MS);
        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        };
    }, [token, user?.role, logout]);

    // Restore session on mount
    useEffect(() => {
        const savedToken = localStorage.getItem('kiosk_token');
        if (savedToken) {
            setToken(savedToken);
            fetchUser(savedToken).finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchUser = async (authToken: string) => {
        try {
            const res = await fetch('/api/auth/me', {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            } else {
                logout();
            }
        } catch {
            logout();
        }
    };

    const login = async (username: string, password: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Login failed');
        }

        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('kiosk_token', data.token);
    };

    const refreshUser = async () => {
        if (token) {
            await fetchUser(token);
        }
    };

    const loginAsGuest = async () => {
        const res = await fetch('/api/auth/guest', {
            method: 'POST',
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Guest login failed');
        }

        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('kiosk_token', data.token);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, loginAsGuest, logout, refreshUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
