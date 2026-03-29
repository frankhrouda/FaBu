import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BottomNav from './BottomNav';
import { Car, LogOut } from 'lucide-react';

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-indigo-600 text-white shadow-lg max-w-lg mx-auto">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5" />
            <span className="font-bold text-lg tracking-tight">FaBu</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-indigo-200 truncate max-w-[140px]">
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
      </header>

      {/* Page content */}
      <main className="flex-1 pt-14 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
