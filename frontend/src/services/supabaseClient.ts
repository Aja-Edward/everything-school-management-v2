/**
 * Supabase client — identity only (Option A)
 *
 * Uses the publishable key (formerly "anon key").
 * The secret/service_role key must NEVER appear here.
 *
 * Install: npm install @supabase/supabase-js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase env vars. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    /**
     * persistSession: true  — Supabase stores the JWT in localStorage so it
     * survives page reloads.  Your Django session cookie does the same for the
     * Django side, so both layers stay in sync.
     */
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // we handle redirects ourselves
  },
});