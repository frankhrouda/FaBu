import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Car, Calendar, Clock, FileText, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { vehicleTypeIcon } from '../utils/helpers';

export default function NewReservation() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({
    vehicle_id: '',
    date: new Date().toISOString().slice(0, 10),
    time_from: '',
    time_to: '',
    reason: '',
  });
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/vehicles').then(setVehicles); }, []);

  // Check availability when all fields are filled
  useEffect(() => {
    if (!form.vehicle_id || !form.date || !form.time_from || !form.time_to) {
      setAvailability(null);
      return;
    }
    if (form.time_from >= form.time_to) {
      setAvailability(null);
      return;
    }

    setChecking(true);
    const params = new URLSearchParams({
      vehicle_id: form.vehicle_id,
      date: form.date,
      time_from: form.time_from,
      time_to: form.time_to,
    });
    api.get(`/reservations/availability?${params}`)
      .then((r) => setAvailability(r.available))
      .catch(() => setAvailability(null))
      .finally(() => setChecking(false));
  }, [form.vehicle_id, form.date, form.time_from, form.time_to]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!availability) {
      setError('Bitte prüfen Sie die Verfügbarkeit des Fahrzeugs.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/reservations', form);
      navigate('/reservations');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link
          to="/reservations"
          className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Neue Reservierung</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Vehicle selection */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Car className="w-4 h-4 text-indigo-500" /> Fahrzeug
          </h2>
          {vehicles.length === 0 ? (
            <p className="text-sm text-gray-500">Keine Fahrzeuge verfügbar</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v) => (
                <label
                  key={v.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    form.vehicle_id === String(v.id)
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="vehicle"
                    value={v.id}
                    checked={form.vehicle_id === String(v.id)}
                    onChange={set('vehicle_id')}
                    className="accent-indigo-600"
                  />
                  <span className="text-xl">{vehicleTypeIcon(v.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{v.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{v.license_plate} · {v.type}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Date & Time */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" /> Datum & Uhrzeit
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Datum</label>
            <input
              type="date"
              value={form.date}
              min={today}
              onChange={set('date')}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Von</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={form.time_from}
                  onChange={set('time_from')}
                  required
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Bis</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={form.time_to}
                  onChange={set('time_to')}
                  required
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Availability indicator */}
          {form.vehicle_id && form.time_from && form.time_to && form.time_from < form.time_to && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
              checking ? 'bg-gray-50 text-gray-500' :
              availability ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              {checking ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : availability ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <span className="text-red-500 font-bold shrink-0">✕</span>
              )}
              {checking ? 'Verfügbarkeit wird geprüft…' : availability ? 'Fahrzeug verfügbar' : 'Fahrzeug bereits belegt!'}
            </div>
          )}
        </section>

        {/* Reason */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-500" /> Zweck der Fahrt
          </h2>
          <textarea
            value={form.reason}
            onChange={set('reason')}
            required
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="z. B. Kundentermin bei Firma XY, Lieferung Lager, Behördengang..."
          />
        </section>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !availability}
          className="w-full btn-primary py-3 text-base disabled:opacity-50"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Wird gespeichert…
            </span>
          ) : 'Reservierung erstellen'}
        </button>
      </form>
    </div>
  );
}
