import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Car } from 'lucide-react';
import { api } from '../api/client';

export default function TenantAdminRequest() {
  const [form, setForm] = useState({ name: '', email: '', tenant_name: '', password: '', message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/auth/tenant-admin-requests', form);
      setSuccess('Anfrage wurde gesendet. Der Super-Admin prüft sie zeitnah.');
      setForm({ name: '', email: '', tenant_name: '', password: '', message: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-indigo-800 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white/20 backdrop-blur p-4 rounded-2xl mb-4">
            <Car className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">FaBu</h1>
          <p className="text-indigo-200 mt-1 text-sm">Digitales Fahrtenbuch</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-5">
            Anfrage: Ich möchte auch Autos zur Reservierung anbieten
          </h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4 border border-red-100">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 text-emerald-700 text-sm px-3 py-2 rounded-lg mb-4 border border-emerald-100">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={form.name}
              onChange={set('name')}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Name"
            />
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="E-Mail"
            />
            <input
              value={form.tenant_name}
              onChange={set('tenant_name')}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Gewünschter Name Ihres Angebots"
            />
            <input
              type="password"
              minLength={6}
              value={form.password}
              onChange={set('password')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Passwort (falls noch nicht registriert)"
            />
            <textarea
              value={form.message}
              onChange={set('message')}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder="Nachricht (optional)"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : 'Anfrage senden'}
            </button>
          </form>

          <div className="mt-5 border-t pt-4 space-y-2 text-sm text-center text-gray-500">
            <p>
              <Link to="/login" className="text-indigo-600 font-medium hover:underline">
                Zurück zur Anmeldung
              </Link>
            </p>
            <p>
              Noch kein Konto?{' '}
              <Link to="/register" className="text-indigo-600 font-medium hover:underline">
                Registrieren
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
