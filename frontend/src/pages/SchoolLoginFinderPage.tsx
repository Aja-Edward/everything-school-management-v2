import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import api from '@/services/api';

/**
 * "School login" on the main marketing site. Admins, teachers, students and
 * parents all log in on their own school's address, not here, so this asks
 * which school and sends them there.
 */

const PLATFORM_DOMAIN = 'nuventacloud.com';

/** "bright-stars", "bright-stars.nuventacloud.com" or a pasted URL -> "bright-stars". */
const toSlug = (input: string) =>
  input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(new RegExp(`\\.${PLATFORM_DOMAIN.replace('.', '\\.')}$`), '')
    .replace(/\.localhost(:\d+)?$/, '');

const loginUrlFor = (slug: string) =>
  import.meta.env.DEV
    ? `${window.location.protocol}//${slug}.localhost:${window.location.port}/login`
    : `https://${slug}.${PLATFORM_DOMAIN}/login`;

const SchoolLoginFinderPage: React.FC = () => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = toSlug(value);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError('Enter the first part of your school’s web address, e.g. brightstars.');
      return;
    }
    setChecking(true);
    setError('');
    try {
      const res = await api.get(`/api/tenants/public/${slug}/`);
      if (res?.tenant && res.tenant.is_active === false) {
        setError('That school’s portal is not active at the moment. Please contact your school.');
        return;
      }
      window.location.href = loginUrlFor(slug);
    } catch (err: any) {
      setError(err?.response?.status === 404
        ? `We couldn’t find a school at ${slug}.${PLATFORM_DOMAIN}. Check the address your school gave you.`
        : 'We couldn’t check that just now. Check your connection and try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <section className="bg-gray-900 pt-28 pb-14">
        <div className="max-w-xl mx-auto px-4 sm:px-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">Log in to your school</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-300">
            Admins, teachers, students and parents log in on their school’s own web address.
          </p>
        </div>
      </section>

      <section className="max-w-xl mx-auto px-4 sm:px-6 -mt-6 pb-16">
        <form onSubmit={onSubmit} noValidate className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          <label htmlFor="school-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Your school’s web address
          </label>
          <div className={`flex items-stretch rounded-lg border overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'
          }`}>
            <input
              id="school-address"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              placeholder="yourschool"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!error}
              aria-describedby={error ? 'school-address-error' : 'school-address-hint'}
              className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
            />
            <span className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-l border-gray-300 dark:border-gray-700 whitespace-nowrap">
              .{PLATFORM_DOMAIN}
            </span>
          </div>
          {error ? (
            <p id="school-address-error" role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            <p id="school-address-hint" className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              If your school uses its own domain, go straight to it instead.
            </p>
          )}

          <button
            type="submit"
            disabled={checking || !value.trim()}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LogIn className="w-4 h-4" aria-hidden="true" />}
            {checking ? 'Finding your school…' : 'Go to my school’s login'}
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-600 dark:text-gray-400 space-y-2">
          <p>
            Not on Nuventa Cloud yet?{' '}
            <Link to="/book-demo" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">Book a free demo</Link>
            {' '}or{' '}
            <Link to="/onboarding/register" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">register your school</Link>.
          </p>
          <p>
            Nuventa Cloud staff:{' '}
            <Link to="/platform-admin/login" className="hover:underline">platform login</Link>
          </p>
        </div>
      </section>
    </main>
  );
};

export default SchoolLoginFinderPage;
