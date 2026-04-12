import { Gauge, MapPin, MessageSquareText, Star } from 'lucide-react';
import Modal from './Modal';
import { formatDate } from '../utils/helpers';

export const emptyTripCompletionForm = {
  km_driven: '',
  destination: '',
  vehicle_rating: 0,
  vehicle_rating_comment: '',
};

export default function TripCompletionModal({ reservation, form, setForm, saving, onClose, onSubmit }) {
  if (!reservation) return null;

  return (
    <Modal title="Fahrt abschließen" onClose={onClose}>
      <div className="mb-4 p-3 bg-indigo-50 rounded-xl text-sm text-indigo-700">
        <p className="font-semibold">{reservation.vehicle_name}</p>
        <p className="text-indigo-500">
          {reservation.date_to && reservation.date_to !== reservation.date
            ? `${formatDate(reservation.date)} – ${formatDate(reservation.date_to)}`
            : formatDate(reservation.date)}
          {' · '}{reservation.time_from} – {reservation.time_to}
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Gefahrene Kilometer <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              min="1"
              value={form.km_driven}
              onChange={(e) => setForm((current) => ({ ...current, km_driven: e.target.value }))}
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
              value={form.destination}
              onChange={(e) => setForm((current) => ({ ...current, destination: e.target.value }))}
              required
              rows={2}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="z. B. Kunde Mustermann, Musterstr. 1, München"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fahrzeugbewertung <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => {
              const active = Number(form.vehicle_rating) >= value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, vehicle_rating: value }))}
                  className={`rounded-lg p-2 transition-colors ${active ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
                  aria-label={`${value} Sterne vergeben`}
                >
                  <Star className={`h-6 w-6 ${active ? 'fill-current' : ''}`} />
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-500">Pflichtfeld nach dem 5-Sterne-Modell.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nachricht an den Vermieter <span className="text-gray-400">(optional)</span>
          </label>
          <div className="relative">
            <MessageSquareText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <textarea
              value={form.vehicle_rating_comment}
              onChange={(e) => setForm((current) => ({ ...current, vehicle_rating_comment: e.target.value }))}
              rows={3}
              maxLength={2000}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Optionales Feedback zum Fahrzeug oder zur Fahrt"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 btn-secondary">
            Abbrechen
          </button>
          <button type="submit" disabled={saving} className="flex-1 btn-primary">
            {saving ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto block" /> : 'Abschließen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}