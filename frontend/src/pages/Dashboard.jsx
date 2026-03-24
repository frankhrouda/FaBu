import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Car, CalendarCheck, Clock, MapPin, Plus, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';
import { statusBadge, formatDate, formatDateRange, formatKm } from '../utils/helpers';

export default function Dashboard() {
  const { user } = useAuth();
  const { toasts, show, dismiss } = useToast();
  const [reservations, setReservations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completeModal, setCompleteModal] = useState(null);
  const [completeForm, setCompleteForm] = useState({ km_driven: '', destination: '' });
  const [saving, setSaving] = useState(false);

  const load = () =>
    Promise.all([api.get('/reservations'), api.get('/vehicles')])
      .then(([res, veh]) => { setReservations(res); setVehicles(veh); })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleComplete = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/reservations/${completeModal.id}/complete`, {
        km_driven: Number(completeForm.km_driven),
        destination: completeForm.destination,
      });
      show('Fahrt erfolgreich abgeschlossen!');
      setCompleteModal(null);
      setCompleteForm({ km_driven: '', destination: '' });
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (reservation) => {
    if (!confirm('Reservierung wirklich stornieren?')) return;
    try {
      await api.patch(`/reservations/${reservation.id}/cancel`, {});
      show('Reservierung storniert');
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = reservations
    .filter((r) => r.status === 'reserved' && (r.date_to || r.date) >= today)
    .slice(0, 3);
  const stats = {
    reserved: reservations.filter((r) => r.status === 'reserved').length,
    completed: reservations.filter((r) => r.status === 'completed').length,
    activeVehicles: vehicles.filter((v) => v.active).length,
  };

  return (
    <div className="p-4 space-y-6">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      {/* Greeting */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">Hallo, {user?.name.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm mt-0.5">{formatDate(today)}</p>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 animate-pulse h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<CalendarCheck className="w-5 h-5 text-indigo-600" />} label="Aktiv" value={stats.reserved} bg="bg-indigo-50" />
          <StatCard icon={<Clock className="w-5 h-5 text-emerald-600" />} label="Abgeschl." value={stats.completed} bg="bg-emerald-50" />
          <StatCard icon={<Car className="w-5 h-5 text-amber-600" />} label="Fahrzeuge" value={stats.activeVehicles} bg="bg-amber-50" />
        </div>
      )}

      {/* Upcoming */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Kommende Reservierungen</h2>
          <Link to="/reservations" className="text-sm text-indigo-600 font-medium">Alle →</Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="bg-gray-200 animate-pulse h-24 rounded-xl" />)}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <CalendarPlus className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Keine Reservierungen geplant</p>
            <Link
              to="/reservations/new"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium"
            >
              <Plus className="w-4 h-4" /> Jetzt reservieren
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((r) => (
              <ReservationPreview
                key={r.id}
                reservation={r}
                onComplete={() => { setCompleteForm({ km_driven: '', destination: '' }); setCompleteModal(r); }}
                onCancel={() => handleCancel(r)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Complete trip modal */}
      {completeModal && (
        <Modal title="Fahrt abschließen" onClose={() => setCompleteModal(null)}>
          <div className="mb-4 p-3 bg-indigo-50 rounded-xl text-sm text-indigo-700">
            <p className="font-semibold">{completeModal.vehicle_name}</p>
            <p className="text-indigo-500">
              {completeModal.date_to && completeModal.date_to !== completeModal.date
                ? `${formatDate(completeModal.date)} – ${formatDate(completeModal.date_to)}`
                : formatDate(completeModal.date)}
              {' · '}{completeModal.time_from} – {completeModal.time_to}
            </p>
          </div>
          <form onSubmit={handleComplete} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gefahrene Kilometer <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  min="1"
                  value={completeForm.km_driven}
                  onChange={(e) => setCompleteForm((f) => ({ ...f, km_driven: e.target.value }))}
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="z. B. 45"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zielort / Reisezweck <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <textarea
                  value={completeForm.destination}
                  onChange={(e) => setCompleteForm((f) => ({ ...f, destination: e.target.value }))}
                  required
                  rows={2}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="z. B. Kunde Mustermann, Musterstr. 1, München"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setCompleteModal(null)} className="flex-1 btn-secondary">
                Abbrechen
              </button>
              <button type="submit" disabled={saving} className="flex-1 btn-primary">
                {saving ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto block" /> : 'Abschließen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* FAB */}
      <Link
        to="/reservations/new"
        className="fixed bottom-24 right-4 bg-indigo-600 text-white rounded-full p-4 shadow-lg shadow-indigo-200 flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all z-30"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}

function StatCard({ icon, label, value, bg }) {
  return (
    <div className={`${bg} rounded-xl p-3 flex flex-col gap-1`}>
      {icon}
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function ReservationPreview({ reservation: r, onComplete, onCancel }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                Reserviert
              </span>
            </div>
            <p className="font-semibold text-gray-900 truncate">{r.vehicle_name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{r.license_plate}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium text-gray-700">{formatDateRange(r.date, r.date_to)}</p>
            <p className="text-xs text-gray-500">{r.time_from} – {r.time_to}</p>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{r.reason}</span>
        </div>
      </div>
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={onComplete}
          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 text-sm font-medium py-2 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all"
        >
          <CheckCircle2 className="w-4 h-4" /> Abschließen
        </button>
        <button
          onClick={onCancel}
          className="flex items-center justify-center gap-1.5 bg-red-50 text-red-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-100 active:scale-95 transition-all"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
