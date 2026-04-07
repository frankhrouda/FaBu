import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Mail, ArrowLeft } from 'lucide-react';
import { api } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Fehler beim Senden der Anfrage');
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
          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">E-Mail gesendet</h2>
              <p className="text-gray-500 text-sm mb-6">
                Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum
                Zurücksetzen des Passworts versendet. Bitte prüfe auch deinen Spam-Ordner.
              </p>
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-indigo-600 text-sm font-medium hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Zurück zur Anmeldung
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Passwort vergessen?</h2>
              <p className="text-gray-500 text-sm mb-6">
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen deines Passworts.
              </p>

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
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="name@beispiel.de"
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
                    'Link senden'
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-4">
                <Link to="/login" className="flex items-center justify-center gap-1 text-indigo-600 font-medium hover:underline">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Zurück zur Anmeldung
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
