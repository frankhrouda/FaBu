import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [availableTenants, setAvailableTenants] = useState([]);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [loading, setLoading] = useState(true);

  const normalizeAuthState = (nextUser, nextTenants = []) => {
    const activeTenant = nextTenants.find((t) => t.id === nextUser?.active_tenant_id) || null;
    const tenantRole = activeTenant?.role || null;
    const isAdmin = Boolean(
      nextUser?.super_admin ||
      tenantRole === 'admin'
    );

    return {
      ...nextUser,
      tenant_role: tenantRole,
      is_admin: isAdmin,
    };
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('fabu_token');
    const savedUser = localStorage.getItem('fabu_user');
    const savedTenants = localStorage.getItem('fabu_tenants');
    if (savedToken && savedUser) {
      try {
        const parsedTenants = savedTenants ? JSON.parse(savedTenants) : [];
        const parsedUser = JSON.parse(savedUser);
        setToken(savedToken);
        setAvailableTenants(parsedTenants);
        setUser(normalizeAuthState(parsedUser, parsedTenants));
      } catch {
        localStorage.clear();
      }
    }
    setLoading(false);
  }, []);

  const login = (token, user, tenants = []) => {
    const normalizedUser = normalizeAuthState(user, tenants);
    localStorage.setItem('fabu_token', token);
    localStorage.setItem('fabu_user', JSON.stringify(normalizedUser));
    localStorage.setItem('fabu_tenants', JSON.stringify(tenants));
    setToken(token);
    setAvailableTenants(tenants);
    setUser(normalizedUser);
  };

  const switchTenant = async (tenantId) => {
    if (!user?.super_admin) {
      throw new Error('Nur Super-Admins duerfen den Mandanten wechseln');
    }

    setSwitchingTenant(true);
    try {
      const tenantTarget = tenantId == null ? 'all' : tenantId;
      const response = await fetch(`/api/auth/switch-tenant/${tenantTarget}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const nextUser = normalizeAuthState(data.user, availableTenants);
      localStorage.setItem('fabu_token', data.token);
      localStorage.setItem('fabu_user', JSON.stringify(nextUser));

      setToken(data.token);
      setUser(nextUser);
    } finally {
      setSwitchingTenant(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('fabu_token');
    localStorage.removeItem('fabu_user');
    localStorage.removeItem('fabu_tenants');
    setToken(null);
    setUser(null);
    setAvailableTenants([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        loading,
        availableTenants,
        activeTenantId: user?.active_tenant_id ?? null,
        isAdmin: Boolean(user?.is_admin),
        switchTenant,
        switchingTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
