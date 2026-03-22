import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setUnauthorizedHandler } from '../api/client';
import type { User } from '../types/api';
import { clearSession, getStoredUser, getToken, setStoredUser, setToken } from './storage';

type AuthContextValue = {
  token: string | null;
  user: User | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      const [storedToken, storedUser] = await Promise.all([getToken(), getStoredUser()]);
      setTokenState(storedToken);
      setUserState(storedUser);
      setIsReady(true);
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearSession();
      setTokenState(null);
      setUserState(null);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isReady,
      async login(email, password) {
        const res = await authApi.login(email.trim(), password);
        await Promise.all([setToken(res.token), setStoredUser(res.user)]);
        setTokenState(res.token);
        setUserState(res.user);
      },
      async logout() {
        await clearSession();
        setTokenState(null);
        setUserState(null);
      },
    }),
    [token, user, isReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
