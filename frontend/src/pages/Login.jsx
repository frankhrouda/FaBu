import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Car, Mail, Lock, LogIn } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.post('/auth/login', form);
      login(token, user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-indigo-800 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white/20 backdrop-blur p-4 rounded-2xl mb-4">
            <Car className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">FaBu</h1>
          <p className="text-indigo-200 mt-1 text-sm">Digitales Fahrtenbuch</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Anmelden</h2>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-lg mb-4 border border-red-200">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
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
                  <LogIn className="w-4 h-4" />
                  Anmelden
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Noch kein Konto?{' '}
            <Link to="/register" className="text-indigo-600 font-medium hover:underline">
              Registrieren
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
