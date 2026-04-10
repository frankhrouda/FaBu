import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BottomNav from './BottomNav';
import { Car, LogOut } from 'lucide-react';
import { FRONTEND_VERSION } from '../version';

export default function Layout() {
  const { user, logout, isAdmin, availableTenants, activeTenantId } = useAuth();
  const navigate = useNavigate();
  const [backendVersion, setBackendVersion] = useState('-');
  
  const activeTenant = availableTenants?.find(t => t.id === activeTenantId);
  const tenantName = activeTenant?.name;

  useEffect(() => {
    let active = true;

    fetch('/api/version')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setBackendVersion(data?.backend_version || '-');
      })
      .catch(() => {
        if (!active) return;
        setBackendVersion('-');
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-indigo-600 text-white shadow-lg max-w-lg mx-auto">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5" />
            <span className="font-bold text-lg tracking-tight">FaBu</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            {tenantName && (
              <div className="text-xs text-indigo-200">
                Mandant: <span className="font-semibold">{tenantName}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="text-sm text-indigo-200 truncate max-w-[120px]">
                {user?.name}
                {isAdmin && (
                  <span className="ml-1 text-xs bg-indigo-500 text-white px-1.5 py-0.5 rounded-full">Admin</span>
                )}
              </div>
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="p-1 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors"
                title="Abmelden"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 pt-16 pb-24 overflow-y-auto">
        <Outlet />
      </main>

      <div className="fixed bottom-14 left-0 right-0 z-30 text-center text-[11px] text-gray-400 max-w-lg mx-auto pointer-events-none">
        Frontend v{FRONTEND_VERSION} | Backend v{backendVersion}
      </div>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
