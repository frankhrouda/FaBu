import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Car, User, Mail, Lock, UserPlus } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', invitation_code: '' });
  const [requestForm, setRequestForm] = useState({ name: '', email: '', tenant_name: '', password: '', message: '' });
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
      };

      const response = form.invitation_code.trim()
        ? await api.post('/auth/register-with-invite', {
          ...payload,
          code: form.invitation_code.trim(),
        })
        : await api.post('/auth/register', payload);

      const { token, user, available_tenants } = response;
      login(token, user, available_tenants || []);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const setRequest = (k) => (e) => setRequestForm((f) => ({ ...f, [k]: e.target.value }));

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setRequestError('');
    setRequestSuccess('');
    setRequestLoading(true);
    try {
      await api.post('/auth/tenant-admin-requests', requestForm);
      setRequestSuccess('Anfrage wurde gesendet. Der Super-Admin prüft sie zeitnah.');
      setRequestForm({ name: '', email: '', tenant_name: '', password: '', message: '' });
    } catch (err) {
      setRequestError(err.message);
    } finally {
      setRequestLoading(false);
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
          <h2 className="text-xl font-bold text-gray-900 mb-6">Konto erstellen</h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4 border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  required
                  autoComplete="name"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Max Mustermann"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="name@beispiel.de"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Mindestens 6 Zeichen"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Einladungscode (optional)</label>
              <input
                type="text"
                value={form.invitation_code}
                onChange={set('invitation_code')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent uppercase"
                placeholder="z. B. ABC123XYZ"
              />
              <p className="text-xs text-gray-500 mt-1">Wenn ein Code vorhanden ist, wirst du direkt diesem Mandanten zugeordnet.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Registrieren
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Bereits ein Konto?{' '}
            <Link to="/login" className="text-indigo-600 font-medium hover:underline">
              Anmelden
            </Link>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 mt-4">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Anfrage: Tenant-Admin werden</h3>

          {requestError && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4 border border-red-100">
              {requestError}
            </div>
          )}
          {requestSuccess && (
            <div className="bg-emerald-50 text-emerald-700 text-sm px-3 py-2 rounded-lg mb-4 border border-emerald-100">
              {requestSuccess}
            </div>
          )}

          <form onSubmit={handleRequestSubmit} className="space-y-3">
            <input value={requestForm.name} onChange={setRequest('name')} required className="input" placeholder="Name" />
            <input type="email" value={requestForm.email} onChange={setRequest('email')} required className="input" placeholder="E-Mail" />
            <input value={requestForm.tenant_name} onChange={setRequest('tenant_name')} required className="input" placeholder="Gewünschter Tenant-Name" />
            <input type="password" minLength={6} value={requestForm.password} onChange={setRequest('password')} className="input" placeholder="Passwort (für neues Konto, falls noch nicht registriert)" />
            <textarea value={requestForm.message} onChange={setRequest('message')} rows={2} className="input resize-none" placeholder="Nachricht (optional)" />

            <button
              type="submit"
              disabled={requestLoading}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-2.5 rounded-xl hover:bg-black transition-colors disabled:opacity-60"
            >
              {requestLoading ? 'Wird gesendet...' : 'Admin-Anfrage senden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
