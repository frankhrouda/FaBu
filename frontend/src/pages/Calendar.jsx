import { useState, useEffect, Fragment } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Car, CalendarDays, Clock, CheckCircle2, XCircle } from 'lucide-react';
import {
  buildReservationHours,
  formatDate,
  formatHourValue,
  formatReservationHourRange,
  statusBadge,
  statusLabel,
} from '../utils/helpers';
import { Link } from 'react-router-dom';

function getNextDays(days = 14) {
  const result = [];
  const start = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    result.push(date.toISOString().slice(0, 10));
  }
  return result;
}

export default function Calendar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('all');
  const [reservations, setReservations] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const days = getNextDays(14);

  useEffect(() => {
    setLoadingVehicles(true);
    api.get('/vehicles')
      .then((data) => {
        setVehicles(data);

        if (isAdmin) {
          setSelectedVehicleId('all');
        } else {
          const activeVehicle = data.find((v) => v.active === 1);
          setSelectedVehicleId(activeVehicle?.id ?? data[0]?.id ?? null);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingVehicles(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedVehicleId && selectedVehicleId !== 'all') return;

    setLoadingReservations(true);

    const endpoint =
      selectedVehicleId === 'all'
        ? '/reservations'
        : `/reservations/vehicle/${selectedVehicleId}`;

    api.get(endpoint)
      .then(setReservations)
      .catch(console.error)
      .finally(() => setLoadingReservations(false));
  }, [selectedVehicleId]);

  const daysWithBookings = days.map((day) => {
    const dayRes = reservations.filter((r) => r.date === day);
    return { day, reservations: dayRes };
  });

  const reservedByDate = (day) => {
    const items = reservations.filter((r) => r.date === day);
    return items.sort((a, b) => a.time_from.localeCompare(b.time_from));
  };

  const hours = buildReservationHours();

  const parseDecimalTime = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h + (m / 60);
  };

  const hourIsBooked = (day, hour) => {
    return reservations.some((r) => {
      if (r.date !== day) return false;
      if (r.status === 'cancelled') return false;
      const from = parseDecimalTime(r.time_from);
      const to = parseDecimalTime(r.time_to);
      const slotStart = hour;
      const slotEnd = hour + 1;
      return from < slotEnd && to > slotStart;
    });
  };

  const filteredVehicles = isAdmin
    ? vehicles.filter((v) => (showInactive ? true : v.active === 1))
    : vehicles.filter((v) => v.active === 1);


  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-gray-900">Verfügbarkeits-Kalender</h1>
        <Link
          to="/vehicles"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          Zurück zu Fahrzeuge
        </Link>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-gray-500">
          Zeigt gebuchte Zeitfenster für die nächsten 14 Tage. {isAdmin ? 'Admin sieht alle Fahrzeuge, Nutzer nur eigene Sicht.' : 'Hier siehst du alle aktiven Fahrzeuge.'}
        </p>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 text-gray-600">
              <span>Fahrzeug:</span>
              <select
                className="input py-1 px-2 text-xs"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">Alle Fahrzeuge</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Inaktive Fahrzeuge anzeigen
            </label>
          </div>
        )}
      </div>

      {loadingVehicles ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-200 animate-pulse h-16 rounded-xl" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Keine Fahrzeuge verfügbar</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredVehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVehicleId(v.id)}
                className={`text-left p-3 rounded-xl border ${selectedVehicleId == v.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'} transition`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{v.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{v.license_plate} • {v.type}</p>
                  </div>
                  <CalendarDays className="w-5 h-5 text-indigo-500" />
                </div>
                <p className="text-xs text-gray-400 mt-1 truncate">{v.description || 'Keine Beschreibung'}</p>
              </button>
            ))}
          </div>

          {/* Stunden-Gitter */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                {selectedVehicleId === 'all'
                  ? 'Alle Fahrzeuge'
                  : vehicles.find((v) => v.id === Number(selectedVehicleId))?.name || 'Kein Fahrzeug ausgewählt'}
              </h2>
              <span className="text-xs text-gray-500">Stunden: {formatReservationHourRange()}</span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="overflow-auto border border-gray-100 rounded-lg">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `72px repeat(${days.length}, minmax(130px, 1fr))`,
                    minWidth: `${72 + days.length * 130}px`,
                  }}
                >
                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-50">Datum</div>
                  {days.map((day) => (
                    <div key={day} className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-50 text-center border-l border-gray-100">
                      {new Date(day).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </div>
                  ))}

                  {hours.map((hour) => (
                    <Fragment key={`row-${hour}`}>
                      <div className="px-2 py-1 text-xs text-gray-500 bg-gray-50 border-t border-gray-200">{formatHourValue(hour)}</div>
                      {days.map((day) => {
                        const booked = hourIsBooked(day, hour);
                        return (
                          <div
                            key={`${day}-${hour}`}
                            className={`h-8 px-1 border-t border-l border-gray-100 text-xs text-center ${booked ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
                          >
                            {booked ? 'X' : 'OK'}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
              <div className="text-xs text-gray-500 flex gap-3">
                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md">OK = frei</span>
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md">X = gebucht</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold mb-2">Ähnliche Buchungen (Detail)</h3>
            {loadingReservations ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {daysWithBookings.map(({ day, reservations: dayRes }) => (
                  <div key={day} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{formatDate(day)}</span>
                      <span className="text-xs text-gray-500">{dayRes?.length ?? 0} Buchung(en)</span>
                    </div>

                    {dayRes.length === 0 ? (
                      <div className="text-xs text-green-600">✅ Frei</div>
                    ) : (
                      <div className="space-y-1">
                        {reservedByDate(day).map((res) => (
                          <div key={res.id} className="flex items-start justify-between bg-gray-50 border border-gray-100 rounded-lg p-2">
                            <div>
                              <p className="text-xs font-medium text-gray-700">{res.time_from} - {res.time_to}</p>
                              <p className="text-xs text-gray-500" title={res.reason}>{res.reason}</p>
                              <p className="text-[11px] text-gray-400">{res.user_name || 'Nutzer'} • {statusLabel(res.status)}</p>
                            </div>
                            <span className={`text-[11px] ${statusBadge(res.status)} px-1.5 py-0.5 rounded-full`}>{statusLabel(res.status)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
