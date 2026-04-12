import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Car, CalendarCheck, Clock, MapPin, Plus, CheckCircle2, XCircle, TriangleAlert } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TripCompletionModal, { emptyTripCompletionForm } from '../components/TripCompletionModal';
import { useToast, ToastContainer } from '../components/Toast';
import { statusBadge, formatDate, formatDateRange, formatKm, vehicleImageUrl } from '../utils/helpers';

export default function Dashboard() {
  const { user } = useAuth();
  const { toasts, show, dismiss } = useToast();
  const [reservations, setReservations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completeModal, setCompleteModal] = useState(null);
  const [completeForm, setCompleteForm] = useState(emptyTripCompletionForm);
  const [saving, setSaving] = useState(false);

  const load = () =>
    Promise.all([api.get('/reservations'), api.get('/vehicles')])
      .then(([res, veh]) => { setReservations(res); setVehicles(veh); })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleComplete = async (e) => {
    e.preventDefault();
    if (!completeForm.vehicle_rating) {
      show('Bitte gib eine Bewertung zwischen 1 und 5 Sternen ab.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/reservations/${completeModal.id}/complete`, {
        km_driven: Number(completeForm.km_driven),
        destination: completeForm.destination,
        vehicle_rating: Number(completeForm.vehicle_rating),
        vehicle_rating_comment: completeForm.vehicle_rating_comment,
      });
      show('Fahrt erfolgreich abgeschlossen!');
      setCompleteModal(null);
      setCompleteForm(emptyTripCompletionForm);
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
  const overdue = reservations
    .filter((r) => (r.date_to || r.date) < today)
    .filter((r) => r.status !== 'completed' && r.status !== 'cancelled');
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

      {/* Overdue warning */}
      {!loading && overdue.length > 0 && (
        <section className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <TriangleAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-amber-900">
                {overdue.length} Fahrt{overdue.length === 1 ? '' : 'en'} sind überfällig
              </h2>
              <p className="text-sm text-amber-800 mt-1">
                Diese Fahrten liegen in der Vergangenheit und sind weder abgeschlossen noch storniert. Bitte jetzt abschließen oder stornieren.
              </p>
              <div className="mt-3 space-y-2">
                {overdue.slice(0, 3).map((r) => (
                  <div key={r.id} className="bg-white/70 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-amber-950 truncate">{r.vehicle_name}</p>
                      <p className="text-xs text-amber-800">
                        {formatDateRange(r.date, r.date_to)} · {r.time_from} - {r.time_to}
                      </p>
                    </div>
                    <button
                      onClick={() => { setCompleteForm(emptyTripCompletionForm); setCompleteModal(r); }}
                      className="shrink-0 bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-amber-800 transition-colors"
                    >
                      Abschließen
                    </button>
                  </div>
                ))}
              </div>
              <Link to="/reservations" className="inline-flex mt-3 text-sm font-semibold text-amber-900 underline underline-offset-2">
                Alle überfälligen Fahrten anzeigen
              </Link>
            </div>
          </div>
        </section>
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
                onComplete={() => { setCompleteForm(emptyTripCompletionForm); setCompleteModal(r); }}
                onCancel={() => handleCancel(r)}
              />
            ))}
          </div>
        )}
      </section>

      <TripCompletionModal
        reservation={completeModal}
        form={completeForm}
        setForm={setCompleteForm}
        saving={saving}
        onClose={() => setCompleteModal(null)}
        onSubmit={handleComplete}
      />

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
            <div className="flex items-center gap-2 min-w-0">
              {r.vehicle_image_path && (
                <div className="w-9 h-9 rounded-md border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
                  <img
                    src={vehicleImageUrl(r.vehicle_image_path)}
                    alt={`Fahrzeug ${r.vehicle_name}`}
                    className="w-full h-full object-contain p-0.5"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{r.vehicle_name}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{r.license_plate}</p>
              </div>
            </div>
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
