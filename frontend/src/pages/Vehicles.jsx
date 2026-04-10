import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Plus, Pencil, PowerOff, Power, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';
import { vehicleImageUrl, vehicleTypeIcon } from '../utils/helpers';

const VEHICLE_TYPES = ['PKW', 'LKW', 'Transporter', 'Motorrad', 'Sonstiges'];

const emptyForm = {
  name: '',
  license_plate: '',
  type: 'PKW',
  description: '',
  price_per_km: '0',
  flat_fee: '',
};

export default function Vehicles() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { toasts, show, dismiss } = useToast();

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | vehicle object
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.get('/vehicles').then(setVehicles).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setImageFile(null);
    setImagePreviewUrl('');
    setModal('add');
  };
  const openEdit = (v) => {
    setForm({
      name: v.name,
      license_plate: v.license_plate,
      type: v.type,
      description: v.description || '',
      price_per_km: String(v.price_per_km ?? 0),
      flat_fee: v.flat_fee == null ? '' : String(v.flat_fee),
    });
    setImageFile(null);
    setImagePreviewUrl(vehicleImageUrl(v.image_path) || '');
    setModal(v);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setImage = (e) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);

    if (file) {
      setImagePreviewUrl(URL.createObjectURL(file));
      return;
    }

    if (modal && modal !== 'add') {
      setImagePreviewUrl(vehicleImageUrl(modal.image_path) || '');
    } else {
      setImagePreviewUrl('');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      price_per_km: form.price_per_km,
      flat_fee: form.flat_fee,
    };

    try {
      let savedVehicle;
      if (modal === 'add') {
        savedVehicle = await api.post('/vehicles', payload);
        show('Fahrzeug wurde hinzugefügt');
      } else {
        savedVehicle = await api.put(`/vehicles/${modal.id}`, { ...payload, active: modal.active });
        show('Fahrzeug wurde aktualisiert');
      }

      const uploadVehicleId = modal === 'add' ? savedVehicle?.id : modal.id;
      if (imageFile && uploadVehicleId) {
        await api.uploadVehicleImage(uploadVehicleId, imageFile);
        show('Fahrzeugbild wurde hochgeladen');
      }

      setModal(null);
      setImageFile(null);
      setImagePreviewUrl('');
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (v) => {
    try {
      await api.put(`/vehicles/${v.id}`, {
        name: v.name, license_plate: v.license_plate,
        type: v.type,
        description: v.description,
        price_per_km: v.price_per_km,
        flat_fee: v.flat_fee,
        active: v.active ? 0 : 1,
      });
      show(v.active ? 'Fahrzeug deaktiviert' : 'Fahrzeug aktiviert');
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const permanentDelete = async (v) => {
    if (v.active) {
      show('Fahrzeug zuerst deaktivieren', 'error');
      return;
    }

    const confirmed = confirm(`Fahrzeug "${v.name}" dauerhaft loeschen? Dieser Schritt ist unwiderruflich.`);
    if (!confirmed) return;

    try {
      await api.delete(`/vehicles/${v.id}/permanent`);
      show('Fahrzeug wurde permanent geloescht');
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const startReservation = (vehicleId) => {
    navigate(`/reservations/new?vehicleId=${vehicleId}`);
  };

  return (
    <div className="p-4 space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-gray-900">Fahrzeuge</h1>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-indigo-700 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" /> Hinzufügen
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-gray-200 animate-pulse h-28 rounded-xl" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Noch keine Fahrzeuge vorhanden</p>
          {isAdmin && (
            <button onClick={openAdd} className="mt-3 text-sm text-indigo-600 font-medium">
              Erstes Fahrzeug hinzufügen →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className={`bg-white rounded-xl border shadow-sm p-4 ${!v.active ? 'opacity-60 border-gray-100' : 'border-gray-100'}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{vehicleTypeIcon(v.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{v.name}</p>
                    {!v.active && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inaktiv</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 font-mono">{v.license_plate}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{v.type}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {Number(v.price_per_km || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR/km
                    {v.flat_fee != null && Number(v.flat_fee) > 0
                      ? ` + ${Number(v.flat_fee).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR Pauschale`
                      : ''}
                  </p>
                  {v.description && <p className="text-xs text-gray-500 mt-1">{v.description}</p>}
                  {v.image_path && (
                    <div className="mt-2 w-full max-w-xs h-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                      <img
                        src={vehicleImageUrl(v.image_path)}
                        alt={`Fahrzeug ${v.name}`}
                        className="w-full h-full object-contain p-1"
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => startReservation(v.id)}
                    disabled={!v.active}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      v.active
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'cursor-not-allowed bg-gray-100 text-gray-400'
                    }`}
                  >
                    Auswaehlen
                  </button>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(v)}
                        className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Bearbeiten"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(v)}
                        className={`p-2 rounded-lg transition-colors ${
                          v.active
                            ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={v.active ? 'Deaktivieren' : 'Aktivieren'}
                      >
                        {v.active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      </button>
                      {!v.active && (
                        <button
                          onClick={() => permanentDelete(v)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Permanent loeschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={modal === 'add' ? 'Fahrzeug hinzufügen' : 'Fahrzeug bearbeiten'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Bezeichnung" required>
              <input
                value={form.name}
                onChange={set('name')}
                required
                className="input"
                placeholder="z. B. VW Golf"
              />
            </Field>
            <Field label="Kennzeichen" required>
              <input
                value={form.license_plate}
                onChange={set('license_plate')}
                required
                className="input uppercase"
                placeholder="z. B. M-AB 1234"
              />
            </Field>
            <Field label="Fahrzeugtyp">
              <select value={form.type} onChange={set('type')} className="input">
                {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Preis pro km (EUR)" required>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price_per_km}
                onChange={set('price_per_km')}
                required
                className="input"
                placeholder="z. B. 0.35"
              />
            </Field>
            <Field label="Pauschale pro Fahrt (EUR, optional)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.flat_fee}
                onChange={set('flat_fee')}
                className="input"
                placeholder="z. B. 2.50"
              />
            </Field>
            <Field label="Beschreibung">
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={2}
                className="input resize-none"
                placeholder="Optional..."
              />
            </Field>
            <Field label="Fahrzeugbild (JPG/PNG/WEBP, max. 5 MB)">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={setImage}
                className="input"
              />
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt="Vorschau"
                  className="mt-2 w-full h-32 rounded-lg object-cover border border-gray-200"
                />
              ) : null}
            </Field>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 btn-secondary">
                Abbrechen
              </button>
              <button type="submit" disabled={saving} className="flex-1 btn-primary">
                {saving ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto block" /> : 'Speichern'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
