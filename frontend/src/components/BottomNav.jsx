import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Car, CalendarDays, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Übersicht', icon: LayoutDashboard, end: true },
  { to: '/vehicles', label: 'Fahrzeuge', icon: Car },
  { to: '/reservations', label: 'Fahrten', icon: CalendarDays },
];

export default function BottomNav() {
  const { user } = useAuth();
  const items = user?.role === 'admin'
    ? [...navItems, { to: '/admin', label: 'Admin', icon: ShieldCheck }]
    : navItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 max-w-lg mx-auto safe-bottom">
      <div className="flex">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-indigo-600' : 'text-gray-500 active:text-indigo-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
