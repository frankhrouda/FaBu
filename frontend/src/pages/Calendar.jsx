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

const VEHICLE_COLOR_PALETTE = [
  { dot: 'bg-sky-500', soft: 'bg-sky-50 border-sky-200 text-sky-700', label: 'bg-sky-100 text-sky-700 border-sky-200' },
  { dot: 'bg-emerald-500', soft: 'bg-emerald-50 border-emerald-200 text-emerald-700', label: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { dot: 'bg-amber-500', soft: 'bg-amber-50 border-amber-200 text-amber-700', label: 'bg-amber-100 text-amber-700 border-amber-200' },
  { dot: 'bg-rose-500', soft: 'bg-rose-50 border-rose-200 text-rose-700', label: 'bg-rose-100 text-rose-700 border-rose-200' },
  { dot: 'bg-violet-500', soft: 'bg-violet-50 border-violet-200 text-violet-700', label: 'bg-violet-100 text-violet-700 border-violet-200' },
  { dot: 'bg-cyan-500', soft: 'bg-cyan-50 border-cyan-200 text-cyan-700', label: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { dot: 'bg-lime-500', soft: 'bg-lime-50 border-lime-200 text-lime-700', label: 'bg-lime-100 text-lime-700 border-lime-200' },
  { dot: 'bg-orange-500', soft: 'bg-orange-50 border-orange-200 text-orange-700', label: 'bg-orange-100 text-orange-700 border-orange-200' },
];

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

  const activeReservations = reservations.filter((r) => r.status !== 'cancelled');

  const hours = buildReservationHours();

  const parseDecimalTime = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h + (m / 60);
  };

  const vehicleColorMap = vehicles.reduce((acc, vehicle, index) => {
    acc[vehicle.id] = VEHICLE_COLOR_PALETTE[index % VEHICLE_COLOR_PALETTE.length];
    return acc;
  }, {});

  const getOverlappingReservations = (day, hour) => {
    return activeReservations.filter((r) => {
      if (r.date !== day) return false;
      const from = parseDecimalTime(r.time_from);
      const to = parseDecimalTime(r.time_to);
      const slotStart = hour;
      const slotEnd = hour + 1;
      return from < slotEnd && to > slotStart;
    }).sort((a, b) => a.time_from.localeCompare(b.time_from));
  };

  const hourIsBooked = (day, hour) => {
    return getOverlappingReservations(day, hour).length > 0;
  };

  const buildCellTitle = (items) => {
    if (items.length === 0) return 'Frei';
    return items
      .map((res) => {
        const vehicle = vehicles.find((v) => v.id === res.vehicle_id);
        const vehicleLabel = vehicle ? `${vehicle.name} (${vehicle.license_plate})` : `Fahrzeug ${res.vehicle_id}`;
        const userLabel = res.user_name || 'Nutzer';
        return `${res.time_from}-${res.time_to} | ${vehicleLabel} | ${userLabel}`;
      })
      .join('\n');
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
                        const overlappingReservations = getOverlappingReservations(day, hour);
                        const booked = overlappingReservations.length > 0;
                        const showVehicleColors = isAdmin && selectedVehicleId === 'all';

                        const cellClass = booked
                          ? (showVehicleColors ? 'bg-red-100 text-red-900' : 'bg-red-100 text-red-700')
                          : 'bg-emerald-50 text-emerald-700';

                        const cellTitle = buildCellTitle(overlappingReservations);

                        return (
                          <div
                            key={`${day}-${hour}`}
                            title={cellTitle}
                            className={`h-8 px-1 border-t border-l border-gray-100 text-xs ${cellClass}`}
                          >
                            {booked ? (
                              isAdmin ? (
                                showVehicleColors ? (
                                  <div className="h-full flex items-center justify-center gap-1.5 flex-wrap">
                                    {overlappingReservations.map((res) => {
                                      const color = vehicleColorMap[res.vehicle_id] || VEHICLE_COLOR_PALETTE[0];
                                      return (
                                        <span
                                          key={`dot-${day}-${hour}-${res.id}`}
                                          className={`w-3.5 h-3.5 rounded-full ring-1 ring-white ${color.dot}`}
                                        />
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="h-full flex items-center justify-center px-1">
                                    <span className="truncate text-[10px] font-medium">
                                      {overlappingReservations[0]?.user_name || 'Nutzer'}
                                    </span>
                                  </div>
                                )
                              ) : (
                                <div className="h-full flex items-center justify-center">X</div>
                              )
                            ) : (
                              <div className="h-full flex items-center justify-center">OK</div>
                            )}
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
                {isAdmin && selectedVehicleId === 'all' && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md">Farbpunkte = Fahrzeug</span>
                )}
              </div>

              {isAdmin && selectedVehicleId === 'all' && (
                <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
                  {filteredVehicles.map((vehicle) => {
                    const color = vehicleColorMap[vehicle.id] || VEHICLE_COLOR_PALETTE[0];
                    return (
                      <span
                        key={`legend-${vehicle.id}`}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${color.label}`}
                      >
                        <span className={`w-3 h-3 rounded-full ${color.dot}`} />
                        {vehicle.name}
                      </span>
                    );
                  })}
                </div>
              )}
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
                          <div
                            key={res.id}
                            className={`flex items-start justify-between rounded-lg p-2 border ${selectedVehicleId === 'all' ? (vehicleColorMap[res.vehicle_id]?.soft || 'bg-gray-50 border-gray-200 text-gray-700') : 'bg-gray-50 border-gray-100'}`}
                          >
                            <div>
                              <p className="text-xs font-medium text-gray-700">{res.time_from} - {res.time_to}</p>
                              <p className="text-xs text-gray-500" title={res.reason}>{res.reason}</p>
                              {selectedVehicleId === 'all' && (
                                <p className="text-[11px] text-gray-500">{res.vehicle_name || `Fahrzeug ${res.vehicle_id}`}</p>
                              )}
                              {isAdmin && (
                                <p className="text-[11px] text-gray-400">{res.user_name || 'Nutzer'} • {statusLabel(res.status)}</p>
                              )}
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
