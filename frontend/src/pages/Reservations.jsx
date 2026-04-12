import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MapPin, Clock, CheckCircle2, XCircle, Car, Gauge, Star, TriangleAlert } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TripCompletionModal, { emptyTripCompletionForm } from '../components/TripCompletionModal';
import { useToast, ToastContainer } from '../components/Toast';
import { statusBadge, statusLabel, formatDate, formatDateRange, formatKm, vehicleImageUrl } from '../utils/helpers';

const FILTERS = ['Alle', 'Reserviert', 'Abgeschlossen', 'Storniert'];
const filterMap = { 'Alle': null, 'Reserviert': 'reserved', 'Abgeschlossen': 'completed', 'Storniert': 'cancelled' };

export default function Reservations() {
  const { user, isAdmin } = useAuth();
  const { toasts, show, dismiss } = useToast();

  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Reserviert');
  const [sortBy, setSortBy] = useState('trip_start');
  const [sortDirection, setSortDirection] = useState('asc');
  const [completeModal, setCompleteModal] = useState(null);
  const [completeForm, setCompleteForm] = useState(emptyTripCompletionForm);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.get('/reservations').then(setReservations).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const toTimestamp = (value) => {
    if (!value) return 0;
    const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getTripStartTimestamp = (reservation) => toTimestamp(`${reservation.date}T${reservation.time_from}`);
  const getCreatedTimestamp = (reservation) => toTimestamp(reservation.created_at);

  const filtered = filter === 'Alle'
    ? reservations
    : reservations.filter((r) => r.status === filterMap[filter]);

  const sortedReservations = [...filtered].sort((a, b) => {
    const valueA = sortBy === 'created_at' ? getCreatedTimestamp(a) : getTripStartTimestamp(a);
    const valueB = sortBy === 'created_at' ? getCreatedTimestamp(b) : getTripStartTimestamp(b);
    const diff = valueA - valueB;
    if (diff !== 0) {
      return sortDirection === 'asc' ? diff : -diff;
    }
    return sortDirection === 'asc' ? a.id - b.id : b.id - a.id;
  });

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

  return (
    <div className="p-4 space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? 'Alle Fahrten' : 'Meine Fahrten'}
        </h1>
        <Link
          to="/reservations/new"
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-indigo-700 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Neu
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
          <span className="shrink-0">Sortierung:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white min-w-0"
          >
            <option value="trip_start">nach Datum/Zeit der reservierten Fahrt</option>
            <option value="created_at">nach Anlagedatum der Reservierung</option>
          </select>
        </label>

        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
          <button
            onClick={() => setSortDirection('desc')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              sortDirection === 'desc' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            absteigend
          </button>
          <button
            onClick={() => setSortDirection('asc')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              sortDirection === 'asc' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            aufsteigend
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-200 animate-pulse h-32 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Keine Einträge gefunden</p>
          <Link to="/reservations/new" className="mt-3 inline-block text-sm text-indigo-600 font-medium">
            Neue Reservierung →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReservations.map((r) => (
            <ReservationCard
              key={r.id}
              reservation={r}
              showUser={isAdmin}
              onComplete={() => { setCompleteForm(emptyTripCompletionForm); setCompleteModal(r); }}
              onCancel={() => handleCancel(r)}
            />
          ))}
        </div>
      )}

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
        className="fixed bottom-24 right-4 bg-indigo-600 text-white rounded-full p-4 shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all z-30"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}

function ReservationCard({ reservation: r, showUser, onComplete, onCancel }) {
  const isPast = (r.date_to || r.date) < new Date().toISOString().slice(0, 10);
  const needsAction = isPast && r.status !== 'completed' && r.status !== 'cancelled';

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${needsAction ? 'border-amber-300 ring-2 ring-amber-200' : 'border-gray-100'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                {statusLabel(r.status)}
              </span>
              {showUser && (
                <span className="text-xs text-gray-500">{r.user_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              {r.vehicle_image_path && (
                <div className="w-10 h-10 rounded-md border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
                  <img
                    src={vehicleImageUrl(r.vehicle_image_path)}
                    alt={`Fahrzeug ${r.vehicle_name}`}
                    className="w-full h-full object-contain p-0.5"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{r.vehicle_name}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{r.license_plate}</p>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium text-gray-700">{formatDateRange(r.date, r.date_to)}</p>
            <p className="text-xs text-gray-500">{r.time_from} – {r.time_to}</p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {needsAction && (
            <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Vergangene Fahrt: Bitte abschließen oder stornieren.</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            <span className="truncate">Grund: {r.reason}</span>
          </div>
          {r.status === 'completed' && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <Gauge className="w-3.5 h-3.5 shrink-0" />
                <span>{formatKm(r.km_driven)} gefahren</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                <span className="truncate">{r.destination}</span>
              </div>
              {r.vehicle_rating ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-600">
                  <Star className="w-3.5 h-3.5 shrink-0 fill-current" />
                  <span>{r.vehicle_rating}/5 Sterne</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {r.status === 'reserved' && (
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
      )}
    </div>
  );
}
