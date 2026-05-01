import React, { useState } from 'react';
import { KeyRound, ArrowRight, AlertCircle, CheckCircle, Loader2, HelpCircle } from 'lucide-react';
import api from '@/services/api';

interface TokenVerificationData {
  is_valid: boolean;
  message: string;
  school_term: string;
  expires_at: string;
  student_id?: string | number;
  student_name?: string;
  education_level?: string;
  current_class?: string;
}

interface PortalLoginProps {
  onSuccess: (tokenData: TokenVerificationData) => void;
}

const PortalLogin: React.FC<PortalLoginProps> = ({ onSuccess }) => {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError('Please enter your result token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data: TokenVerificationData = await api.post(
        '/students/verify-result-token/',
        { token: trimmed }
      );

      if (!data.is_valid) {
        setError(data.message || 'Token is not valid.');
        return;
      }

      setSuccess(true);
      setTimeout(() => onSuccess(data), 400);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Token verification failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && token.trim() && !loading) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 backdrop-blur rounded-2xl mb-4">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Result Portal</h2>
          <p className="text-white/75 text-sm mt-1">
            Enter your result token to access your academic results
          </p>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-300 font-medium">
                Token verified — loading results…
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="result-token"
                className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Result Token
              </label>
              <input
                id="result-token"
                type="text"
                value={token}
                onChange={e => setToken(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                placeholder="e.g. ABC-123-XYZ-456"
                spellCheck={false}
                autoComplete="off"
                disabled={loading || success}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white
                  font-mono text-base tracking-wider placeholder-gray-400 dark:placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                  disabled:opacity-60 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={!token.trim() || loading || success}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white
                bg-gradient-to-r from-blue-600 to-indigo-600
                hover:from-blue-700 hover:to-indigo-700
                disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-2 transition-all duration-200"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
              ) : success ? (
                <><CheckCircle className="w-4 h-4" /> Verified</>
              ) : (
                <>View My Results <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Help note */}
          <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
            <HelpCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              Your result token is issued by your school each term. If you don't have one,
              contact your class teacher or school office.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalLogin;
