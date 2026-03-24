import { useState, useEffect } from 'react';
import { Users, ShieldCheck, User, Trash2, Crown, FileDown, FileText } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/Toast';
import { formatDate, formatKm } from '../utils/helpers';

function getMonthDateRange(monthValue) {
  if (!monthValue) return { from: '', to: '' };
  const [year, month] = monthValue.split('-').map(Number);
  const fromDate = new Date(year, month - 1, 1);
  const toDate = new Date(year, month, 0);

  const toIso = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return {
    from: toIso(fromDate),
    to: toIso(toDate),
  };
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function toCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function buildBillingCsv(summary) {
  const head = [
    ['Benutzer', summary.user?.name || ''],
    ['E-Mail', summary.user?.email || ''],
    ['Zeitraum von', summary.period?.from || ''],
    ['Zeitraum bis', summary.period?.to || ''],
    ['Fahrten gesamt', summary.totals?.total_trips ?? 0],
    ['Kilometer gesamt', summary.totals?.total_km ?? 0],
    ['KM-Kosten gesamt (EUR)', summary.totals?.total_km_cost ?? 0],
    ['Pauschalen gesamt (EUR)', summary.totals?.total_flat_cost ?? 0],
    ['Gesamtkosten (EUR)', summary.totals?.total_cost ?? 0],
    [],
  ];

  const tableHeader = [
    'Fahrzeug',
    'Kennzeichen',
    'Fahrten',
    'Kilometer',
    'Preis pro km (EUR)',
    'Pauschale (EUR/Fahrt)',
    'KM-Kosten (EUR)',
    'Pauschal-Kosten (EUR)',
    'Gesamt (EUR)',
  ];

  const tableRows = (summary.byVehicle || []).map((row) => ([
    row.vehicle_name,
    row.license_plate,
    row.trips,
    row.total_km,
    row.price_per_km,
    row.flat_fee ?? '',
    row.km_cost,
    row.flat_cost,
    row.total_cost,
  ]));

  return [...head, tableHeader, ...tableRows]
    .map((line) => line.map(toCsvValue).join(';'))
    .join('\n');
}

export default function Admin() {
  const { user: me } = useAuth();
  const { toasts, show, dismiss } = useToast();
  const [users, setUsers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [tab, setTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [periodMonth, setPeriodMonth] = useState(getCurrentMonthValue);
  const [dateRange, setDateRange] = useState(() => getMonthDateRange(getCurrentMonthValue()));
  const [kmSummary, setKmSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

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

  const loadUserKmSummary = async (user, range = dateRange) => {
    if (!user) return;
    if (!range.from || !range.to) {
      show('Bitte gültigen Zeitraum auswählen', 'error');
      return;
    }

    setSummaryLoading(true);
    try {
      const summary = await api.get(`/users/${user.id}/km-summary?from=${range.from}&to=${range.to}`);
      setKmSummary(summary);
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSummaryLoading(false);
    }
  };

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

  const selectUser = async (user) => {
    setSelectedUser(user);
    await loadUserKmSummary(user);
  };

  const applyMonth = async (monthValue) => {
    const nextRange = getMonthDateRange(monthValue);
    setDateRange(nextRange);
    if (selectedUser) {
      await loadUserKmSummary(selectedUser, nextRange);
    }
  };

  const applyCustomRange = async () => {
    if (selectedUser) {
      await loadUserKmSummary(selectedUser, dateRange);
    }
  };

  const exportCsv = () => {
    if (!kmSummary) return;

    const csv = buildBillingCsv(kmSummary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const userName = (kmSummary.user?.name || 'user').replaceAll(/\s+/g, '_').toLowerCase();
    link.href = url;
    link.download = `abrechnung_${userName}_${kmSummary.period?.from || 'from'}_${kmSummary.period?.to || 'to'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!kmSummary) return;

    const popup = window.open('', '_blank');
    if (!popup) {
      show('Popup blockiert. Bitte Popups erlauben, um PDF zu exportieren.', 'error');
      return;
    }

    const rows = (kmSummary.byVehicle || [])
      .map((item) => `
        <tr>
          <td>${item.vehicle_name}</td>
          <td>${item.license_plate}</td>
          <td>${item.trips}</td>
          <td>${Number(item.total_km).toLocaleString('de-DE')} km</td>
          <td>${Number(item.price_per_km || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} EUR</td>
          <td>${item.flat_fee == null ? '-' : Number(item.flat_fee).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'}</td>
          <td>${formatCurrency(item.km_cost)}</td>
          <td>${formatCurrency(item.flat_cost)}</td>
          <td><strong>${formatCurrency(item.total_cost)}</strong></td>
        </tr>
      `)
      .join('');

    popup.document.write(`
      <!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8" />
          <title>Abrechnung ${kmSummary.user?.name || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 12px; font-size: 22px; }
            .meta { margin-bottom: 16px; font-size: 14px; }
            .totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
            .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; }
            .label { font-size: 12px; color: #6b7280; }
            .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
            table { border-collapse: collapse; width: 100%; font-size: 13px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Abrechnung Fahrtkosten</h1>
          <div class="meta">
            <div><strong>Benutzer:</strong> ${kmSummary.user?.name || ''} (${kmSummary.user?.email || ''})</div>
            <div><strong>Zeitraum:</strong> ${kmSummary.period?.from || ''} bis ${kmSummary.period?.to || ''}</div>
          </div>

          <div class="totals">
            <div class="card"><div class="label">Fahrten</div><div class="value">${kmSummary.totals?.total_trips || 0}</div></div>
            <div class="card"><div class="label">Kilometer</div><div class="value">${Number(kmSummary.totals?.total_km || 0).toLocaleString('de-DE')} km</div></div>
            <div class="card"><div class="label">Gesamtkosten</div><div class="value">${formatCurrency(kmSummary.totals?.total_cost || 0)}</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Fahrzeug</th>
                <th>Kennzeichen</th>
                <th>Fahrten</th>
                <th>Kilometer</th>
                <th>Preis/km</th>
                <th>Pauschale</th>
                <th>KM-Kosten</th>
                <th>Pauschal-Kosten</th>
                <th>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="9">Keine Daten im Zeitraum</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
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
        <div className="space-y-4">
          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className={`bg-white rounded-xl border shadow-sm p-4 transition-colors ${
                  selectedUser?.id === u.id ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => selectUser(u)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      u.role === 'admin' ? 'bg-indigo-600' : 'bg-gray-400'
                    }`}
                    title="Benutzer-Statistik anzeigen"
                  >
                    {u.name.charAt(0).toUpperCase()}
                  </button>
                  <button
                    onClick={() => selectUser(u)}
                    className="flex-1 min-w-0 text-left"
                    title="Benutzer-Statistik anzeigen"
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-gray-900 text-sm">{u.name}</p>
                      {u.role === 'admin' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                      {u.id === me?.id && <span className="text-xs text-gray-400">(ich)</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400">Seit {formatDate(u.created_at?.slice(0, 10))}</p>
                  </button>
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

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-gray-900 text-sm">Kilometer-Auswertung je Benutzer</h2>
              {selectedUser ? (
                <span className="text-xs text-gray-500">Ausgewählt: {selectedUser.name}</span>
              ) : (
                <span className="text-xs text-gray-400">Benutzer auswählen</span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-gray-600">
                Monat (Voreinstellung)
                <input
                  type="month"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex items-end">
                <button
                  onClick={() => applyMonth(periodMonth)}
                  className="w-full sm:w-auto rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700"
                >
                  Monat laden
                </button>
              </div>
              <label className="text-xs text-gray-600">
                Von
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600">
                Bis
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={applyCustomRange}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Benutzerdefinierten Zeitraum laden
              </button>
            </div>

            {!selectedUser ? (
              <p className="mt-4 text-sm text-gray-500">Klicke oben auf einen Benutzer, um die gefahrenen Kilometer pro Fahrzeug zu sehen.</p>
            ) : summaryLoading ? (
              <div className="mt-4 space-y-2">
                {[...Array(2)].map((_, i) => <div key={i} className="bg-gray-200 animate-pulse h-14 rounded-lg" />)}
              </div>
            ) : kmSummary ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatCard label="Fahrten" value={kmSummary.totals?.total_trips || 0} sub="im Zeitraum" color="blue" />
                  <StatCard label="Kilometer" value={formatKm(kmSummary.totals?.total_km || 0)} sub="im Zeitraum" color="emerald" />
                  <StatCard label="KM-Kosten" value={formatCurrency(kmSummary.totals?.total_km_cost || 0)} sub="variabel" color="indigo" />
                  <StatCard label="Gesamt" value={formatCurrency(kmSummary.totals?.total_cost || 0)} sub="inkl. Pauschalen" color="amber" />
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={exportCsv}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <FileDown className="w-4 h-4" /> CSV Export
                  </button>
                  <button
                    onClick={exportPdf}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4" /> PDF Export
                  </button>
                </div>

                {kmSummary.byVehicle?.length ? (
                  kmSummary.byVehicle.map((item) => (
                    <div key={item.vehicle_id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm text-gray-900">{item.vehicle_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{item.license_plate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-emerald-600">{formatKm(item.total_km)}</p>
                          <p className="text-xs text-gray-500">{item.trips} Fahrten</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600">
                        <div><span className="text-gray-400">Preis/km:</span> {formatCurrency(item.price_per_km)}</div>
                        <div><span className="text-gray-400">Pauschale:</span> {item.flat_fee == null ? '—' : formatCurrency(item.flat_fee)}</div>
                        <div><span className="text-gray-400">KM-Kosten:</span> {formatCurrency(item.km_cost)}</div>
                        <div><span className="text-gray-400">Gesamt:</span> <span className="font-semibold text-indigo-700">{formatCurrency(item.total_cost)}</span></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">Für den gewählten Zeitraum wurden keine abgeschlossenen Fahrten mit Kilometern gefunden.</p>
                )}
              </div>
            ) : null}
          </div>
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
