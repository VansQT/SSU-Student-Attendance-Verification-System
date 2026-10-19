import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<{ institutionName: string; logoDataUrl: string | null }>({
    institutionName: 'Samar State University',
    logoDataUrl: null,
  });

  useEffect(() => {
    const loadBranding = () => {
      api.get<{ institutionName: string; logoDataUrl: string | null }>('/public/branding')
        .then(setBranding)
        .catch(loadError => console.error('Failed to load system branding:', loadError));
    };
    loadBranding();
    window.addEventListener('system-branding-updated', loadBranding);
    return () => window.removeEventListener('system-branding-updated', loadBranding);
  }, []);

  useEffect(() => {
    const clearAutofilledCredentials = () => {
      if (usernameInput.current?.value) usernameInput.current.value = '';
      if (passwordInput.current?.value) passwordInput.current.value = '';
    };
    const nextFrame = window.requestAnimationFrame(clearAutofilledCredentials);
    const delayedClear = window.setTimeout(clearAutofilledCredentials, 300);
    return () => {
      window.cancelAnimationFrame(nextFrame);
      window.clearTimeout(delayedClear);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* SSU University Shield Emblem */}
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 flex items-center justify-center text-white shadow-xl ring-4 ring-amber-400 mx-auto mb-4">
          {branding.logoDataUrl ? (
            <img src={branding.logoDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <GraduationCap className="w-9 h-9 text-amber-300" />
          )}
        </div>
        <span className="text-[11px] uppercase font-extrabold tracking-widest text-blue-900 bg-amber-100/90 text-amber-950 px-3 py-1 rounded-full border border-amber-300 font-sans">
          {branding.institutionName}
        </span>
        <h2 className="mt-3 text-2xl font-extrabold text-slate-900 tracking-tight">
          Student Attendance Verification System
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Printed ID QR • 1:1 Live Face Verification • Classroom Geofencing
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-200 sm:px-10 space-y-6">
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            <input
              type="text"
              name="saved-username-decoy"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute h-px w-px opacity-0"
            />
            <input
              type="password"
              name="saved-password-decoy"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute h-px w-px opacity-0"
            />
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Username, School ID, or SSU Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={usernameInput}
                  type="text"
                  name="portal-login-identifier"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-300 w-full outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={passwordInput}
                  type="password"
                  name="portal-login-secret"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-300 w-full outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              {loading ? 'Authenticating...' : 'Sign In to Portal'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};
