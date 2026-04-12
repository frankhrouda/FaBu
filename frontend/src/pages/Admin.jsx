import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  Star,
  User,
  Trash2,
  Crown,
  FileDown,
  FileText,
  Building2,
  Plus,
  Link as LinkIcon,
  ChevronLeft,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/Toast';
import { formatDate, formatDateRange, formatKm } from '../utils/helpers';

function RatingStars({ value }) {
  const numericValue = Number(value || 0);
  return (
    <div className="flex items-center gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((starValue) => {
        const active = numericValue >= starValue;
        return <Star key={starValue} className={`h-3 w-3 ${active ? 'fill-current' : 'text-gray-200'}`} />;
      })}
    </div>
  );
}

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

function initialTab(isSuperAdmin) {
  return 'users';
}

const ALL_TENANTS_VALUE = 'all';

export default function Admin() {
  const navigate = useNavigate();
  const {
    user: me,
    isAdmin,
    availableTenants,
    activeTenantId,
    switchTenant,
    switchingTenant,
  } = useAuth();

  const isSuperAdmin = Boolean(me?.super_admin);
  const { toasts, show, dismiss } = useToast();

  const [tab, setTab] = useState(initialTab(isSuperAdmin));
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(
    isSuperAdmin ? (activeTenantId ?? ALL_TENANTS_VALUE) : (activeTenantId ?? null)
  );
  const [members, setMembers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedUser, setSelectedUser] = useState(null);
  const [periodMonth, setPeriodMonth] = useState(getCurrentMonthValue);
  const [dateRange, setDateRange] = useState(() => getMonthDateRange(getCurrentMonthValue()));
  const [kmSummary, setKmSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [newTenantForm, setNewTenantForm] = useState({ name: '', first_admin_email: '' });
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState(null);
  const [editingTenantName, setEditingTenantName] = useState('');

  const [inviteForm, setInviteForm] = useState({ email: '', expires_in_hours: 24 });
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);
  const [requestProcessingId, setRequestProcessingId] = useState(null);

  const effectiveTenantId = selectedTenantId === ALL_TENANTS_VALUE
    ? null
    : (selectedTenantId ?? activeTenantId ?? null);

  const loadTenants = async () => {
    if (isSuperAdmin) {
      const result = await api.get('/admin/tenants');
      const tenantItems = result.tenants || [];
      setTenants(tenantItems);
      if (selectedTenantId == null) {
        setSelectedTenantId(activeTenantId ?? ALL_TENANTS_VALUE);
      }
      return;
    }

    const localTenants = availableTenants || [];
    setTenants(localTenants);
    if (!selectedTenantId && localTenants[0]?.id) {
      setSelectedTenantId(localTenants[0].id);
    }
  };

  const loadMembers = async (tenantId) => {
    if (!tenantId) {
      if (isSuperAdmin) {
        const result = await api.get('/users');
        setMembers(result || []);
        return;
      }
      setMembers([]);
      return;
    }

    const endpoint = isSuperAdmin
      ? `/admin/tenants/${tenantId}/members`
      : `/tenants/${tenantId}/members`;

    const result = await api.get(endpoint);
    setMembers(result.members || []);
  };

  const loadReservations = async () => {
    const result = await api.get('/reservations');
    setReservations(result || []);
  };

  const loadInvitations = async (tenantId) => {
    if (!tenantId) {
      setInvitations([]);
      return;
    }

    try {
      const result = await api.get(`/tenants/${tenantId}/invitations`);
      setInvitations(result.invitations || []);
    } catch {
      setInvitations([]);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadTenants(), loadReservations()]);
      if (isSuperAdmin) {
        const requestResult = await api.get('/admin/tenant-admin-requests?status=pending');
        setAdminRequests(requestResult.requests || []);
      }
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTab(initialTab(isSuperAdmin));
    setSelectedTenantId(isSuperAdmin ? (activeTenantId ?? ALL_TENANTS_VALUE) : (activeTenantId ?? null));
  }, [isSuperAdmin, activeTenantId]);

  useEffect(() => {
    void loadAll();
  }, [isSuperAdmin]);

  useEffect(() => {
    const sync = async () => {
      try {
        setSelectedUser(null);
        setKmSummary(null);
        if (isSuperAdmin && activeTenantId !== effectiveTenantId) {
          await switchTenant(effectiveTenantId);
        }
        await Promise.all([loadReservations(), loadMembers(effectiveTenantId), loadInvitations(effectiveTenantId)]);
      } catch (err) {
        show(err.message, 'error');
      }
    };

    void sync();
  }, [effectiveTenantId, isSuperAdmin, activeTenantId]);

  const loadUserKmSummary = async (user, range = dateRange) => {
    if (!user) return;
    if (!range.from || !range.to) {
      show('Bitte gueltigen Zeitraum auswaehlen', 'error');
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

  const changeRole = async (userId, currentRole) => {
    if (!effectiveTenantId) return;
    const nextRole = currentRole === 'admin' ? 'user' : 'admin';

    try {
      const endpoint = isSuperAdmin
        ? `/admin/tenants/${effectiveTenantId}/members/${userId}/role`
        : `/tenants/${effectiveTenantId}/members/${userId}/role`;
      await api.patch(endpoint, { role: nextRole });
      show(`Rolle auf "${nextRole === 'admin' ? 'Administrator' : 'Benutzer'}" geaendert`);
      await loadMembers(effectiveTenantId);
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const removeMember = async (userId, name) => {
    if (!effectiveTenantId) return;
    if (!confirm(`Mitglied "${name}" wirklich aus diesem Mandanten entfernen?`)) return;

    try {
      await api.delete(`/tenants/${effectiveTenantId}/members/${userId}`);
      show('Mitglied entfernt');
      await loadMembers(effectiveTenantId);
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const createTenant = async (e) => {
    e.preventDefault();
    if (!newTenantForm.name.trim()) {
      show('Mandantenname ist erforderlich', 'error');
      return;
    }

    setCreatingTenant(true);
    try {
      await api.post('/admin/tenants', {
        name: newTenantForm.name.trim(),
        first_admin_email: newTenantForm.first_admin_email.trim() || undefined,
      });
      setNewTenantForm({ name: '', first_admin_email: '' });
      show('Mandant erstellt');
      await loadTenants();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setCreatingTenant(false);
    }
  };

  const startTenantEdit = (tenant) => {
    setEditingTenantId(tenant.id);
    setEditingTenantName(tenant.name || '');
  };

  const saveTenantEdit = async (tenantId) => {
    if (!editingTenantName.trim()) {
      show('Mandantenname ist erforderlich', 'error');
      return;
    }
    try {
      await api.patch(`/admin/tenants/${tenantId}`, { name: editingTenantName.trim() });
      setEditingTenantId(null);
      setEditingTenantName('');
      show('Mandant aktualisiert');
      await loadTenants();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const approveAdminRequest = async (request) => {
    setRequestProcessingId(request.id);
    try {
      await api.post(`/admin/tenant-admin-requests/${request.id}/approve`, {
        tenant_name: request.tenant_name,
      });
      show('Anfrage angenommen und Tenant-Admin erstellt');
      const requestResult = await api.get('/admin/tenant-admin-requests?status=pending');
      setAdminRequests(requestResult.requests || []);
      await loadTenants();
      if (!selectedTenantId || selectedTenantId === ALL_TENANTS_VALUE) {
        const refreshed = await api.get('/admin/tenants');
        const firstTenant = refreshed.tenants?.[0];
        if (firstTenant?.id) setSelectedTenantId(firstTenant.id);
      }
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setRequestProcessingId(null);
    }
  };

  const rejectAdminRequest = async (request) => {
    const reason = window.prompt('Optionaler Ablehnungsgrund:', '') || undefined;
    setRequestProcessingId(request.id);
    try {
      await api.post(`/admin/tenant-admin-requests/${request.id}/reject`, { reason });
      show('Anfrage abgelehnt');
      const requestResult = await api.get('/admin/tenant-admin-requests?status=pending');
      setAdminRequests(requestResult.requests || []);
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setRequestProcessingId(null);
    }
  };

  const createInvitation = async (e) => {
    e.preventDefault();
    if (!effectiveTenantId) return;

    setCreatingInvite(true);
    try {
      const result = await api.post(`/tenants/${effectiveTenantId}/invitations`, {
        email: inviteForm.email.trim() || undefined,
        expires_in_hours: Number(inviteForm.expires_in_hours || 24),
      });
      const code = result?.invitation?.code;
      if (code) {
        await navigator.clipboard.writeText(code).catch(() => {});
      }
      show(code ? `Einladung erstellt: ${code} (in Zwischenablage)` : 'Einladung erstellt');
      setInviteForm((prev) => ({ ...prev, email: '' }));
      await loadInvitations(effectiveTenantId);
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setCreatingInvite(false);
    }
  };

  const selectUser = async (nextUser) => {
    setSelectedUser(nextUser);
    await loadUserKmSummary(nextUser);
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

  const stats = useMemo(() => ({
    totalUsers: members.length,
    totalReservations: reservations.length,
    completedTrips: reservations.filter((r) => r.status === 'completed').length,
    totalKm: reservations.filter((r) => r.km_driven).reduce((sum, r) => sum + Number(r.km_driven), 0),
  }), [members, reservations]);

  if (!isAdmin) {
    return <div className="p-4">Keine Berechtigung.</div>;
  }

  return (
    <div className="p-4 space-y-5">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" /> Administration
          </h1>
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/admin/tenants')}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Building2 className="w-4 h-4" />
              Mandantenverwaltung
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Benutzer" value={stats.totalUsers} sub={effectiveTenantId ? 'im Mandant' : 'gesamt sichtbar'} color="indigo" />
        <StatCard label="Fahrten gesamt" value={stats.totalReservations} sub="sichtbar" color="blue" />
        <StatCard label="Abgeschlossen" value={stats.completedTrips} sub="Fahrten" color="emerald" />
        <StatCard label="Kilometer" value={formatKm(stats.totalKm)} sub="gesamt gefahren" color="amber" />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500">Aktiver Mandant</label>
        {isSuperAdmin ? (
          <select
            className="input"
            value={selectedTenantId ?? ALL_TENANTS_VALUE}
            onChange={(e) => setSelectedTenantId(e.target.value === ALL_TENANTS_VALUE ? ALL_TENANTS_VALUE : Number(e.target.value))}
            disabled={switchingTenant}
          >
            <option value={ALL_TENANTS_VALUE}>Alle Mandanten</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : (
          <div className="input bg-gray-50 text-gray-700">{tenants.find((tenant) => tenant.id === effectiveTenantId)?.name || tenants[0]?.name || 'Kein Mandant zugewiesen'}</div>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setTab('users')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'users' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Benutzer
        </button>
        <button
          onClick={() => setTab('log')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'log' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Fahrtenbuch
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-200 animate-pulse h-20 rounded-xl" />)}
        </div>
      ) : tab === 'users' ? (
        <div className="space-y-4">
          {!effectiveTenantId ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-sm text-gray-600">
              Gesamtansicht aktiv. Benutzer sind sichtbar, aber Aenderungen und Einladungen sind nur in einem konkreten Mandanten moeglich.
            </div>
          ) : null}
          {effectiveTenantId ? (
              <form onSubmit={createInvitation} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Einladungscode erstellen</h2>
                <input
                  className="input"
                  placeholder="E-Mail (optional)"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Gueltig (Stunden)</label>
                  <input
                    type="number"
                    min="1"
                    className="input w-24"
                    value={inviteForm.expires_in_hours}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, expires_in_hours: Number(e.target.value || 24) }))}
                  />
                </div>
                <button disabled={creatingInvite || !effectiveTenantId} className="btn-primary inline-flex items-center gap-1">
                  <Plus className="w-4 h-4" /> {creatingInvite ? 'Erstelle...' : 'Einladung erstellen'}
                </button>

                {invitations.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {invitations.slice(0, 5).map((inv) => (
                      <div key={inv.id} className="text-xs text-gray-600 border border-gray-100 rounded-lg px-2 py-1.5">
                        <span className="font-mono text-gray-900">{inv.code}</span>
                        {' · '}
                        {inv.email || 'ohne E-Mail-Bindung'}
                        {' · bis '}
                        {formatDate(String(inv.expires_at).slice(0, 10))}
                        {inv.used_at ? ' · verwendet' : ''}
                      </div>
                    ))}
                  </div>
                )}
              </form>
          ) : null}

          <div className="space-y-3">
            {members.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-sm text-gray-500">
                Keine Benutzer vorhanden.
              </div>
            ) : members.map((u) => {
              const role = u.tenant_role || (u.super_admin ? 'admin' : u.role);
              return (
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
                        role === 'admin' ? 'bg-indigo-600' : 'bg-gray-400'
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
                        {role === 'admin' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                        {u.id === me?.id && <span className="text-xs text-gray-400">(ich)</span>}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      <p className="text-xs text-gray-400">Seit {formatDate(String(u.created_at || u.joined_at || '').slice(0, 10))}</p>
                    </button>
                    {u.id !== me?.id && effectiveTenantId ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeRole(u.id, role)}
                          className={`p-2 rounded-lg transition-colors text-xs ${
                            role === 'admin'
                              ? 'text-indigo-600 hover:bg-indigo-50'
                              : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                          }`}
                          title={role === 'admin' ? 'Zum Benutzer machen' : 'Zum Admin machen'}
                        >
                          {role === 'admin' ? <User className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => removeMember(u.id, u.name)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Aus Mandant entfernen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-gray-900 text-sm">Kilometer-Auswertung je Benutzer</h2>
              {selectedUser ? (
                <span className="text-xs text-gray-500">Ausgewaehlt: {selectedUser.name}</span>
              ) : (
                <span className="text-xs text-gray-400">Benutzer auswaehlen</span>
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
                        <div><span className="text-gray-400">Pauschale:</span> {item.flat_fee == null ? '-' : formatCurrency(item.flat_fee)}</div>
                        <div><span className="text-gray-400">KM-Kosten:</span> {formatCurrency(item.km_cost)}</div>
                        <div><span className="text-gray-400">Gesamt:</span> <span className="font-semibold text-indigo-700">{formatCurrency(item.total_cost)}</span></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">Fuer den gewaehlten Zeitraum wurden keine abgeschlossenen Fahrten mit Kilometern gefunden.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
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
                      <p className="text-sm font-medium text-gray-700">{formatDateRange(r.date, r.date_to)}</p>
                      <p className="text-xs text-gray-500">{r.time_from} - {r.time_to}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div><span className="text-gray-400">Fahrer:</span> {r.user_name}</div>
                    <div><span className="text-gray-400">Km:</span> <span className="font-semibold text-emerald-600">{formatKm(r.km_driven)}</span></div>
                    {r.vehicle_rating ? (
                      <div className="col-span-2 flex items-center gap-2">
                        <span className="text-gray-400">Bewertung:</span>
                        <RatingStars value={r.vehicle_rating} />
                        <span className="font-semibold text-amber-600">{r.vehicle_rating}/5</span>
                      </div>
                    ) : null}
                    <div className="col-span-2"><span className="text-gray-400">Ziel:</span> {r.destination}</div>
                    <div className="col-span-2"><span className="text-gray-400">Grund:</span> {r.reason}</div>
                    {r.vehicle_rating_comment ? (
                      <div className="col-span-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-900">
                        <span className="text-amber-700">Nachricht:</span> {r.vehicle_rating_comment}
                      </div>
                    ) : null}
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
