import { supabase } from './supabase.js'

/**
 * Sign in with email and password.
 * Returns { data, error } — check error for auth failures.
 */
export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

/**
 * Send a magic link to the given email.
 * User clicks the link in their email → session is created automatically.
 * Returns { error } — null error means the email was sent.
 */
export async function signInWithMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false }  // only existing users can log in
  })
  return { error }
}

/**
 * Sign out the current user.
 * onAuthStateChange fires SIGNED_OUT → app returns to viewer mode.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

/**
 * Get the current session synchronously from memory.
 * Returns null if no active session.
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Register a callback that fires on every auth state change.
 * Events: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED
 * Use this in main.js to react to login/logout.
 */
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}
