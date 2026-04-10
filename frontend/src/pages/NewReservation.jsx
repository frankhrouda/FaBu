import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Car, Calendar, Clock, FileText, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import {
  buildReservationHours,
  formatDate,
  formatHourValue,
  formatReservationHourRange,
  RESERVATION_HOUR_END,
  RESERVATION_HOUR_START,
  vehicleImageUrl,
  vehicleTypeIcon,
} from '../utils/helpers';

export default function NewReservation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [form, setForm] = useState({
    vehicle_id: '',
    date: new Date().toISOString().slice(0, 10),
    date_to: new Date().toISOString().slice(0, 10),
    time_from: '',
    time_to: '',
    reason: '',
  });
  const [availability, setAvailability] = useState(null);
  const [dayReservations, setDayReservations] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragSelection, setDragSelection] = useState(null);
  const dragPointerIdRef = useRef(null);
  const preselectionAppliedRef = useRef(false);
  const reservableVehicles = vehicles.filter((v) => Boolean(v.active));

  useEffect(() => {
    api.get('/vehicles')
      .then(setVehicles)
      .finally(() => setVehiclesLoaded(true));
  }, []);

  useEffect(() => {
    if (preselectionAppliedRef.current || !vehiclesLoaded) return;

    preselectionAppliedRef.current = true;
    const preselectedVehicleId = searchParams.get('vehicleId');
    if (!preselectedVehicleId) return;

    const preselectedVehicle = reservableVehicles.find((vehicle) => String(vehicle.id) === preselectedVehicleId);
    if (!preselectedVehicle) return;

    setForm((currentForm) => ({
      ...currentForm,
      vehicle_id: String(preselectedVehicle.id),
    }));
  }, [reservableVehicles, searchParams, vehiclesLoaded]);

  useEffect(() => {
    if (!form.vehicle_id || !form.date) {
      setDayReservations([]);
      return;
    }

    setDayLoading(true);
    api.get(`/reservations/vehicle/${form.vehicle_id}`)
      .then((items) => setDayReservations(items.filter((r) => {
        const endDate = r.date_to || r.date;
        return r.date <= form.date && form.date <= endDate;
      })))
      .catch(() => setDayReservations([]))
      .finally(() => setDayLoading(false));
  }, [form.vehicle_id, form.date]);

  // Check availability when all fields are filled
  useEffect(() => {
    if (!form.vehicle_id || !form.date || !form.date_to || !form.time_from || !form.time_to) {
      setAvailability(null);
      return;
    }
    if (form.date_to < form.date) {
      setAvailability(null);
      return;
    }
    // Same-day: departure must be before return time
    if (form.date === form.date_to && form.time_from >= form.time_to) {
      setAvailability(null);
      return;
    }

    setChecking(true);
    const params = new URLSearchParams({
      vehicle_id: form.vehicle_id,
      date: form.date,
      date_to: form.date_to,
      time_from: form.time_from,
      time_to: form.time_to,
    });
    api.get(`/reservations/availability?${params}`)
      .then((r) => setAvailability(r.available))
      .catch(() => setAvailability(null))
      .finally(() => setChecking(false));
  }, [form.vehicle_id, form.date, form.date_to, form.time_from, form.time_to]);

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: value };
      // Auto-advance date_to if start date moves past it
      if (k === 'date' && value > next.date_to) {
        next.date_to = value;
      }
      return next;
    });
    if (k === 'vehicle_id' || k === 'date' || k === 'date_to' || k === 'time_from' || k === 'time_to') {
      setDragSelection(null);
    }
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

  const hours = buildReservationHours();
  const timeToDecimal = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  };

  const reservationForHour = (hour) => {
    return dayReservations.find((r) => {
      if (r.status === 'cancelled') return false;
      const endDate = r.date_to || r.date;
      // Middle day of a multi-day reservation: entire day blocked
      if (r.date < form.date && endDate > form.date) return true;
      const start = timeToDecimal(r.time_from);
      const end = timeToDecimal(r.time_to);
      // Multi-day start day: blocked from departure time to end of visible range
      if (r.date === form.date && endDate > form.date) return start < hour + 1;
      // Multi-day end day: blocked from start of visible range to return time
      if (endDate === form.date && r.date < form.date) return end > hour;
      // Same-day reservation: normal time overlap
      return start < hour + 1 && end > hour;
    });
  };

  const hourInUse = (hour) => Boolean(reservationForHour(hour));

  const selectedFrom = timeToDecimal(form.time_from);
  const selectedTo = timeToDecimal(form.time_to);
  const hasSelectedRange = selectedFrom != null && selectedTo != null && selectedFrom < selectedTo;
  const dragRangeStart = dragSelection ? Math.min(dragSelection.anchor, dragSelection.current) : null;
  const dragRangeEnd = dragSelection ? Math.max(dragSelection.anchor, dragSelection.current) + 1 : null;

  const hourInSelectedRange = (hour) => {
    if (dragRangeStart != null && dragRangeEnd != null) {
      return dragRangeStart < hour + 1 && dragRangeEnd > hour;
    }
    if (!hasSelectedRange) return false;
    return selectedFrom < hour + 1 && selectedTo > hour;
  };

  const rangeHasBookedHours = (fromHour, toHourExclusive) => {
    for (let h = fromHour; h < toHourExclusive; h += 1) {
      if (hourInUse(h)) return true;
    }
    return false;
  };

  const applyRangeSelection = (fromHour, toHourExclusive) => {
    if (rangeHasBookedHours(fromHour, toHourExclusive)) {
      setError('Der gewaehlte Zeitraum enthaelt bereits gebuchte Stunden.');
      return;
    }

    setForm((f) => ({
      ...f,
      time_from: formatHourValue(fromHour),
      time_to: formatHourValue(toHourExclusive),
    }));
  };

  const startDragSelection = (hour, pointerId) => {
    setError('');

    if (hourInUse(hour)) {
      setDragSelection(null);
      setError('Diese Stunde ist bereits belegt. Bitte waehlen Sie freie Stunden.');
      return;
    }

    dragPointerIdRef.current = pointerId;
    setDragSelection({ anchor: hour, current: hour });
  };

  const updateDragSelection = (hour) => {
    setDragSelection((currentSelection) => {
      if (!currentSelection || hourInUse(hour)) return currentSelection;
      if (currentSelection.current === hour) return currentSelection;
      return { ...currentSelection, current: hour };
    });
  };

  const finishDragSelection = () => {
    if (!dragSelection) {
      return;
    }

    const rangeStart = Math.min(dragSelection.anchor, dragSelection.current);
    const rangeEndExclusive = Math.max(dragSelection.anchor, dragSelection.current) + 1;
    applyRangeSelection(rangeStart, rangeEndExclusive);
    setDragSelection(null);
    dragPointerIdRef.current = null;
  };

  useEffect(() => {
    if (!dragSelection) return;

    const handlePointerMove = (event) => {
      if (dragPointerIdRef.current !== event.pointerId) return;

      const element = document.elementFromPoint(event.clientX, event.clientY);
      const slot = element?.closest?.('[data-hour-slot="true"]');
      const hour = Number(slot?.getAttribute?.('data-hour'));

      if (Number.isFinite(hour)) {
        updateDragSelection(hour);
      }
    };

    const handlePointerEnd = () => finishDragSelection();
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [dragSelection]);

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
          {reservableVehicles.length === 0 ? (
            <p className="text-sm text-gray-500">Keine Fahrzeuge verfügbar</p>
          ) : (
            <div className="space-y-2">
              {reservableVehicles.map((v) => (
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    {v.image_path ? (
                      <img
                        src={vehicleImageUrl(v.image_path)}
                        alt={`Fahrzeug ${v.name}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xl">{vehicleTypeIcon(v.type)}</span>
                    )}
                  </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Startdatum</label>
              <input
                type="date"
                value={form.date}
                min={today}
                onChange={set('date')}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Enddatum</label>
              <input
                type="date"
                value={form.date_to}
                min={form.date}
                onChange={set('date_to')}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          {form.date_to > form.date && (
            <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              Mehrtägige Reservierung: {formatDate(form.date)} – {formatDate(form.date_to)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Von</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={form.time_from}
                  onChange={set('time_from')}
                  min={formatHourValue(RESERVATION_HOUR_START)}
                  max={formatHourValue(RESERVATION_HOUR_END)}
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
                  min={formatHourValue(RESERVATION_HOUR_START)}
                  max={formatHourValue(RESERVATION_HOUR_END)}
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

          {/* Tageskalender nur für eintägige Reservierungen */}
          {form.vehicle_id && form.date && form.date === form.date_to && (
            <section className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Tageskalender ({formatReservationHourRange()})</h3>
                {dayLoading ? <span className="text-xs text-gray-500">Lade...</span> : <span className="text-xs text-gray-500">{dayReservations.length} Buchung(en)</span>}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Stunden klicken oder ziehen: Loslassen uebernimmt den Zeitraum.
              </p>
              <div className="grid grid-cols-12 gap-1 text-center text-xs">
                <div className="col-span-1 font-medium">Zeit</div>
                <div className="col-span-11 font-medium">Status</div>
                {hours.flatMap((hour) => {
                  const res = reservationForHour(hour);
                  const isBooked = hourInUse(hour);
                  const isSelected = hourInSelectedRange(hour);
                  const title = res
                    ? `Gebucht ${res.time_from}-${res.time_to} • ${res.user_name || 'Nutzer'} • ${res.reason || 'Kein Zweck'}`
                    : 'Frei';

                  return [
                    <div key={`label-${hour}`} className="col-span-1 py-1 bg-gray-50 border border-gray-100">{formatHourValue(hour)}</div>,
                    <button
                      key={`status-${hour}`}
                      type="button"
                      title={title}
                      data-hour-slot="true"
                      data-hour={hour}
                      onPointerDown={(event) => startDragSelection(hour, event.pointerId)}
                      onPointerEnter={() => updateDragSelection(hour)}
                      disabled={isBooked}
                      className={`col-span-11 py-1 border border-gray-100 transition-colors touch-none select-none ${
                        isBooked
                          ? 'bg-red-50 text-red-700 cursor-not-allowed'
                          : isSelected
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer'
                      }`}
                    >
                      {isBooked ? 'Gebucht' : isSelected ? 'Ausgewaehlt' : 'Frei'}
                    </button>,
                  ];
                })}
              </div>
            </section>
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
