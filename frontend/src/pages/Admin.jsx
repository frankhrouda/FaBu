import { useState, useEffect } from 'react';
import { Users, ShieldCheck, User, Trash2, Crown } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/Toast';
import { formatDate, formatKm, statusBadge, statusLabel } from '../utils/helpers';

export default function Admin() {
  const { user: me } = useAuth();
  const { toasts, show, dismiss } = useToast();
  const [users, setUsers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [tab, setTab] = useState('users');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.get('/users'), api.get('/reservations')]);
      setUsers(u);
      setReservations(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (userId, newRole) => {
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      show(`Rolle auf "${newRole === 'admin' ? 'Administrator' : 'Benutzer'}" geändert`);
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const deleteUser = async (userId, name) => {
    if (!confirm(`Benutzer "${name}" wirklich löschen?`)) return;
    try {
      await api.delete(`/users/${userId}`);
      show('Benutzer gelöscht');
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  // Stats
  const stats = {
    totalUsers: users.length,
    totalReservations: reservations.length,
    completedTrips: reservations.filter((r) => r.status === 'completed').length,
    totalKm: reservations.filter((r) => r.km_driven).reduce((sum, r) => sum + Number(r.km_driven), 0),
  };

  return (
    <div className="p-4 space-y-5">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-indigo-600" /> Administration
        </h1>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Benutzer" value={stats.totalUsers} sub="registriert" color="indigo" />
        <StatCard label="Fahrten gesamt" value={stats.totalReservations} sub="Einträge" color="blue" />
        <StatCard label="Abgeschlossen" value={stats.completedTrips} sub="Fahrten" color="emerald" />
        <StatCard label="Kilometer" value={formatKm(stats.totalKm)} sub="gesamt gefahren" color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[['users', 'Benutzer'], ['log', 'Fahrtenbuch']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-200 animate-pulse h-20 rounded-xl" />)}
        </div>
      ) : tab === 'users' ? (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  u.role === 'admin' ? 'bg-indigo-600' : 'bg-gray-400'
                }`}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-gray-900 text-sm">{u.name}</p>
                    {u.role === 'admin' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                    {u.id === me?.id && <span className="text-xs text-gray-400">(ich)</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  <p className="text-xs text-gray-400">Seit {formatDate(u.created_at?.slice(0, 10))}</p>
                </div>
                {u.id !== me?.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => changeRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                      className={`p-2 rounded-lg transition-colors text-xs ${
                        u.role === 'admin'
                          ? 'text-indigo-600 hover:bg-indigo-50'
                          : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                      }`}
                      title={u.role === 'admin' ? 'Zum Benutzer machen' : 'Zum Admin machen'}
                    >
                      {u.role === 'admin' ? <User className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteUser(u.id, u.name)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Logbook view */
        <div className="space-y-3">
          {reservations.filter((r) => r.status === 'completed').length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Noch keine abgeschlossenen Fahrten</p>
            </div>
          ) : (
            reservations
              .filter((r) => r.status === 'completed')
              .map((r) => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{r.vehicle_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{r.license_plate}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">{formatDate(r.date)}</p>
                      <p className="text-xs text-gray-500">{r.time_from} – {r.time_to}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div><span className="text-gray-400">Fahrer:</span> {r.user_name}</div>
                    <div><span className="text-gray-400">Km:</span> <span className="font-semibold text-emerald-600">{formatKm(r.km_driven)}</span></div>
                    <div className="col-span-2"><span className="text-gray-400">Ziel:</span> {r.destination}</div>
                    <div className="col-span-2"><span className="text-gray-400">Grund:</span> {r.reason}</div>
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`${colors[color]} rounded-xl p-3`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs opacity-70">{sub}</p>
    </div>
  );
}
