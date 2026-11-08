import { supabase, isSupabaseConfigured } from './supabase';
import { UserAccount } from '../types';
import { hashPassword } from '../utils/crypto';

/**
 * Auth abstraction layer.
 *
 * SECURITY NOTES (review these):
 *  1. When Supabase is configured (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY),
 *     credentials are verified by Supabase Auth server-side. Passwords are
 *     never stored, hashed, or persisted by this app — Supabase handles the
 *     full identity lifecycle (signup, login, session refresh, reset).
 *  2. The legacy localStorage "zero-knowledge hash" demo flow only runs when
 *     Supabase is NOT configured (local/demo mode) and logs a warning. It is
 *     NOT secure (SHA-256 hashes in localStorage are brute-forceable) and must
 *     never be used for a deployed environment.
 *  3. The Supabase session JWT returned by getAccessToken() is attached to
 *     API calls as `Authorization: Bearer <token>` and verified by the server
 *     before any state-modifying request is honored.
 *  4. Only the anon/publishable key is ever exposed to the browser. The
 *     service-role key stays server-side.
 */

/** True when real Supabase credentials are available. */
export function isSupabaseAuthEnabled(): boolean {
  return isSupabaseConfigured();
}

const DEMO_WARNING =
  '[security] Supabase not configured — using INSECURE localStorage demo auth. ' +
  'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for real authentication.';

let demoWarningLogged = false;
function logDemoWarning() {
  if (!demoWarningLogged) {
    console.warn(DEMO_WARNING);
    demoWarningLogged = true;
  }
}

// ── Centralized auth error mapping ──────────────────────────────────────────

/**
 * Maps raw Supabase/auth errors to user-friendly messages.
 * Handles rate limits, duplicate accounts, network errors, etc.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (!error) return 'An unknown error occurred. Please try again.';

  const raw = typeof error === 'string'
    ? error
    : (error as { message?: string; error_description?: string; code?: string })?.message
      || (error as { error_description?: string })?.error_description
      || '';

  const code = (error as { code?: string })?.code ?? '';
  const lower = raw.toLowerCase();

  if (lower.includes('rate limit') || lower.includes('too many') || code === 'too_many_requests') {
    return 'Too many requests. Please wait a few minutes before trying again.';
  }
  if (lower.includes('email not confirmed') || lower.includes('email not verified') || code === 'email_not_confirmed') {
    return 'EMAIL_NOT_CONFIRMED';
  }
  if (lower.includes('email already') || lower.includes('already registered') || code === 'email_already_in_use') {
    return 'An account with this email already exists.';
  }
  if (code === 'invalid_email' || lower.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (code === 'weak_password' || lower.includes('weak password')) {
    return 'Passphrase must be at least 8 characters long.';
  }
  if (code === 'user_disabled' || lower.includes('user disabled')) {
    return 'This account has been disabled. Please contact support.';
  }
  if (code === 'network_request_failed' || lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  if (code === 'operation_not_allowed') {
    return 'This sign-in method is not enabled. Please contact support.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('incorrect password')) {
    return 'Invalid email or passphrase. Please try again.';
  }

  return raw || 'An unexpected error occurred. Please try again.';
}

// ── Local profile persistence (vehicles, E2EE vault — user-owned data) ──────
const userKey = (email: string) => `parksmart_user_${email.trim().toLowerCase()}`;

export function loadProfile(email: string): UserAccount | null {
  try {
    const raw = localStorage.getItem(userKey(email));
    return raw ? (JSON.parse(raw) as UserAccount) : null;
  } catch {
    return null;
  }
}

export function saveProfile(account: UserAccount): void {
  localStorage.setItem(userKey(account.email), JSON.stringify(account));
}

/** Build a UserAccount from a Supabase session user, reusing the locally
 *  stored profile (vehicles, E2EE vault) when it exists. */
function accountFromSupabaseUser(
  email: string,
  id: string,
  fallbackName = ''
): UserAccount {
  const existing = loadProfile(email);
  if (existing) {
    return { ...existing, id, email: existing.email || email };
  }
  const now = new Date().toISOString();
  return {
    id,
    email,
    name: fallbackName || email.split('@')[0] || 'ParkPulse user',
    vehiclePlate: '',
    vehicleModel: '',
    isE2EEEnabled: false,
    createdAt: now,
  };
}

// ── Sign up ─────────────────────────────────────────────────────────────────
export interface SignUpResult {
  user: UserAccount | null;
  requiresEmailConfirmation: boolean;
  error: string | null;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  profile: { name: string; vehiclePlate: string; vehicleModel: string }
): Promise<SignUpResult> {
  const trimmedEmail = email.trim().toLowerCase();

  if (isSupabaseAuthEnabled()) {
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          name: profile.name.trim(),
          vehicle_plate: profile.vehiclePlate.trim().toUpperCase(),
          vehicle_model: profile.vehicleModel.trim(),
        },
      },
    });

    if (error) {
      return { user: null, requiresEmailConfirmation: false, error: error.message };
    }

    if (!data.user) {
      return { user: null, requiresEmailConfirmation: true, error: null };
    }

    const account: UserAccount = {
      id: data.user.id,
      email: data.user.email || trimmedEmail,
      name: profile.name.trim(),
      vehiclePlate: profile.vehiclePlate.trim().toUpperCase(),
      vehicleModel: profile.vehicleModel.trim(),
      isE2EEEnabled: false,
      createdAt: data.user.created_at || new Date().toISOString(),
    };
    saveProfile(account);

    const sessionAvailable = Boolean(data.session?.access_token);
    return { user: sessionAvailable ? account : null, requiresEmailConfirmation: !sessionAvailable, error: null };
  }

  // ── Demo fallback (INSECURE — never use in production) ──
  logDemoWarning();
  const existing = loadProfile(trimmedEmail);
  if (existing) {
    return { user: null, requiresEmailConfirmation: false, error: 'An account already exists for this email.' };
  }
  const passHash = await hashPassword(password);
  const account: UserAccount = {
    id: `usr_${Date.now()}`,
    email: trimmedEmail,
    name: profile.name.trim(),
    vehiclePlate: profile.vehiclePlate.trim().toUpperCase(),
    vehicleModel: profile.vehicleModel.trim(),
    isE2EEEnabled: false,
    createdAt: new Date().toISOString(),
  };
  saveProfile(account);
  localStorage.setItem(`parksmart_hash_${trimmedEmail}`, passHash);
  return { user: account, requiresEmailConfirmation: false, error: null };
}

// ── OAuth sign-in (Google / GitHub) ─────────────────────────────────────────
export async function signInWithOAuth(provider: 'google' | 'github'): Promise<{ error: string | null }> {
  if (!isSupabaseAuthEnabled()) {
    return { error: 'OAuth sign-in requires Supabase to be configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.' };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

// ── Sign in ─────────────────────────────────────────────────────────────────
export interface SignInResult {
  user: UserAccount | null;
  error: string | null;
}

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const trimmedEmail = email.trim().toLowerCase();

  if (isSupabaseAuthEnabled()) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }
    if (!data.user) {
      return { user: null, error: 'No user returned by the authentication provider.' };
    }

    const userMeta = data.user.user_metadata as Record<string, unknown> | undefined;
    const account = accountFromSupabaseUser(
      data.user.email || trimmedEmail,
      data.user.id,
      typeof userMeta?.name === 'string' ? userMeta.name : ''
    );
    return { user: account, error: null };
  }

  // ── Demo fallback (INSECURE — never use in production) ──
  logDemoWarning();
  const storedHash = localStorage.getItem(`parksmart_hash_${trimmedEmail}`);
  const profile = loadProfile(trimmedEmail);
  if (!storedHash || !profile) {
    return { user: null, error: 'No account found for this email. Create an account first.' };
  }
  const inputHash = await hashPassword(password);
  if (inputHash !== storedHash) {
    return { user: null, error: 'Invalid password.' };
  }
  return { user: profile, error: null };
}

// ── Resend verification email ───────────────────────────────────────────────

export interface ResendVerificationResult {
  success: boolean;
  error: string | null;
}

/**
 * Resends the email confirmation for the given email address.
 * Only works when Supabase is configured and the account exists but is unconfirmed.
 */
export async function resendVerificationEmail(email: string): Promise<ResendVerificationResult> {
  if (!isSupabaseAuthEnabled()) {
    return { success: false, error: 'Email verification is not available in demo mode.' };
  }

  const trimmedEmail = email.trim().toLowerCase();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: trimmedEmail,
  });

  if (error) {
    return { success: false, error: getAuthErrorMessage(error) };
  }

  return { success: true, error: null };
}

// ── Session helpers ─────────────────────────────────────────────────────────
/** Current Supabase access token for API authorization (null in demo mode). */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseAuthEnabled()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Resolve the current user (null when not signed in). */
export async function getCurrentUser(): Promise<UserAccount | null> {
  if (!isSupabaseAuthEnabled()) {
    const raw = localStorage.getItem('parksmart_current_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserAccount;
    } catch {
      return null;
    }
  }
  const { data } = await supabase.auth.getSession();
  const sessionUser = data.session?.user;
  if (!sessionUser) return null;
  return accountFromSupabaseUser(
    sessionUser.email || '',
    sessionUser.id,
    typeof sessionUser.user_metadata?.name === 'string' ? sessionUser.user_metadata.name : ''
  );
}

export async function signOutUser(): Promise<void> {
  if (isSupabaseAuthEnabled()) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem('parksmart_current_user');
}

/** Restore the session once, then keep user state in sync with Supabase.
 *  Returns an unsubscribe function. */
export function initializeAuth(onUserChange: (user: UserAccount | null) => void): () => void {
  let active = true;

  if (!isSupabaseAuthEnabled()) {
    onUserChange(null);
    return () => {
      active = false;
    };
  }

  supabase.auth.getSession().then(({ data }) => {
    if (!active) return;
    const sessionUser = data.session?.user;
    onUserChange(
      sessionUser
        ? accountFromSupabaseUser(
            sessionUser.email || '',
            sessionUser.id,
            typeof sessionUser.user_metadata?.name === 'string' ? sessionUser.user_metadata.name : ''
          )
        : null
    );
  });

  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!active) return;
    const sessionUser = session?.user;
    onUserChange(
      sessionUser
        ? accountFromSupabaseUser(
            sessionUser.email || '',
            sessionUser.id,
            typeof sessionUser.user_metadata?.name === 'string' ? sessionUser.user_metadata.name : ''
          )
        : null
    );
  });

  return () => {
    active = false;
    subscription.subscription.unsubscribe();
  };
}
