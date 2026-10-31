import { createClient } from '@supabase/supabase-js'

// These env vars are set in .env (local) and in Vercel dashboard (production).
// The anon key is intentionally client-side — security is enforced by RLS.
const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[urlmgr] Missing Supabase env vars. Copy .env.example → .env and fill in your values.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
