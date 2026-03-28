import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setUnauthorizedHandler } from '../api/client';
import type { TenantMembership, User } from '../types/api';
import {
  clearSession,
  getStoredTenants,
  getStoredUser,
  getToken,
  setStoredTenants,
  setStoredUser,
  setToken,
} from './storage';

type AuthContextValue = {
  token: string | null;
  user: User | null;
  availableTenants: TenantMembership[];
  activeTenantId: number | null;
  isAdmin: boolean;
  switchingTenant: boolean;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  switchTenant: (tenantId: number) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantMembership[]>([]);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [isReady, setIsReady] = useState(false);

  function normalizeUser(nextUser: User, tenants: TenantMembership[]) {
    const activeTenant = tenants.find((tenant) => tenant.id === nextUser.active_tenant_id) || null;
    const tenantRole = activeTenant?.role || null;
    return {
      ...nextUser,
      tenant_role: tenantRole,
      is_admin: Boolean(nextUser.super_admin || nextUser.role === 'admin' || tenantRole === 'admin'),
    };
  }

  useEffect(() => {
    async function bootstrap() {
      const [storedToken, storedUser, storedTenants] = await Promise.all([
        getToken(),
        getStoredUser(),
        getStoredTenants(),
      ]);
      setTokenState(storedToken);
      setUserState(storedUser);
      setAvailableTenants(storedTenants);
      setIsReady(true);
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearSession();
      setTokenState(null);
      setUserState(null);
      setAvailableTenants([]);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      availableTenants,
      activeTenantId: user?.active_tenant_id ?? null,
      isAdmin: Boolean(user?.is_admin),
      switchingTenant,
      isReady,
      async login(email, password) {
        const res = await authApi.login(email.trim(), password);
        const tenants = res.available_tenants || [];
        const normalizedUser = normalizeUser(res.user, tenants);
        await Promise.all([setToken(res.token), setStoredUser(normalizedUser), setStoredTenants(tenants)]);
        setTokenState(res.token);
        setUserState(normalizedUser);
        setAvailableTenants(tenants);
      },
      async switchTenant(tenantId: number) {
        if (!token) return;
        setSwitchingTenant(true);
        try {
          const res = await authApi.switchTenant(token, tenantId);
          const normalizedUser = normalizeUser(res.user, availableTenants);
          await Promise.all([setToken(res.token), setStoredUser(normalizedUser)]);
          setTokenState(res.token);
          setUserState(normalizedUser);
        } finally {
          setSwitchingTenant(false);
        }
      },
      async logout() {
        await clearSession();
        setTokenState(null);
        setUserState(null);
        setAvailableTenants([]);
      },
    }),
    [availableTenants, isReady, switchingTenant, token, user]
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
