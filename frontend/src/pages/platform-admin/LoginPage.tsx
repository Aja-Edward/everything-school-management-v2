import React, { useState } from 'react';
import { Eye, EyeOff, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE_URL } from '@/services/api';
import { supabase } from '@/services/supabaseClient';
import type { HydratedUserData } from '@/hooks/useAuth';

// ─── helpers ──────────────────────────────────────────────────────────────────

// Only Django superusers are true platform admins.
// Tenant admins may have role='superadmin' but is_superuser=False — they must NOT pass.
const isPlatformAdminUser = (user: any): boolean => !!user?.is_superuser;

async function djangoSupabaseLogin(token: string): Promise<HydratedUserData> {
  const res = await fetch(`${API_BASE_URL}/auth/supabase-login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || d.message || `Auth failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.user) throw new Error('No user data returned');
  return data.user as HydratedUserData;
}

// ─── component ────────────────────────────────────────────────────────────────

const PlatformAdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, updateUser } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    setError(null);

    // ── 1. Try Supabase → Django JWT flow ────────────────────────────────────
    let succeeded = false;
    try {
      const { data: sbData, error: sbError } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      });

      if (!sbError && sbData?.session?.access_token) {
        try {
          const user = await djangoSupabaseLogin(sbData.session.access_token);

          if (!isPlatformAdminUser(user)) {
            await supabase.auth.signOut();
            setError('This portal is for platform administrators only.');
            setLoading(false);
            return;
          }

          updateUser(user);
          localStorage.setItem('userData', JSON.stringify(user));
          succeeded = true;
          navigate('/super-admin/dashboard', { replace: true });
          return;
        } catch {
          // Django rejected the JWT — fall through to session login
        }
      }
    } catch {
      // Supabase unreachable — fall through
    }

    // ── 2. Django session login fallback ─────────────────────────────────────
    if (!succeeded) {
      try {
        const user = await login({ email: username, username, password, role: 'admin' as any, rememberMe: false });

        if (!user) throw new Error('No user data returned');

        if (!isPlatformAdminUser(user)) {
          setError('This portal is for platform administrators only.');
          setLoading(false);
          return;
        }

        navigate('/super-admin/dashboard', { replace: true });
      } catch (err: any) {
        const msg =
          err?.response?.data?.detail ||
          err?.response?.data?.non_field_errors?.[0] ||
          err?.message ||
          'Invalid credentials. Please try again.';
        setError(msg);
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-black" />
          </div>
          <span className="text-white font-bold text-sm tracking-wide">
            Platform Admin Portal
          </span>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Restricted access
            </p>
            <h1 className="text-4xl font-black text-white leading-tight">
              Central control<br />for your platform.
            </h1>
            <p className="text-white/60 text-sm leading-relaxed max-w-sm">
              Manage all tenants, generate result tokens, monitor the system,
              and configure platform-wide settings from one secure place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Token generation', desc: 'Issue result access tokens' },
              { label: 'Tenant oversight', desc: 'View all school accounts' },
              { label: 'System health', desc: 'Monitor uptime & errors' },
              { label: 'Global settings', desc: 'Platform configuration' },
            ].map((item) => (
              <div
                key={item.label}
                className="border border-white/10 rounded-xl p-4 space-y-1"
              >
                <p className="text-white text-xs font-semibold">{item.label}</p>
                <p className="text-white/40 text-xs">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/20 text-xs">
          Unauthorised access is prohibited and monitored.
        </p>
      </div>

      {/* ── Right panel — login form ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm space-y-8">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm text-gray-900">Platform Admin</span>
          </div>

          {/* Heading */}
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-gray-900">Sign in</h2>
            <p className="text-sm text-gray-500">
              Platform administrators only.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3.5 text-sm text-gray-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Username or Email
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                placeholder="admin@example.com"
                disabled={loading}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black disabled:opacity-50 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="••••••••••"
                  disabled={loading}
                  required
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black disabled:opacity-50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Back link */}
          <p className="text-center text-xs text-gray-400">
            Not a platform admin?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-gray-700 font-semibold hover:underline"
            >
              Go to school login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlatformAdminLoginPage;
