/**
 * Client-side actor identity.
 *
 * The server ALWAYS derives identity itself (`src/server/actor.ts`): it
 * verifies the Supabase session JWT when an auth provider is reachable, and
 * only falls back to the `X-ParkSmart-Actor` header when no provider can be
 * reached (dev/demo) or when a static access token gate is configured.
 *
 * This module produces the value for that header:
 *   1. the signed-in account id (Supabase user id / local demo account id), so
 *      bookings, notifications and owner claims follow the account across
 *      devices, otherwise
 *   2. a stable, per-browser device id created on first use.
 *
 * The value is only ever a hint for the server — it is validated against a
 * strict pattern server-side and is never trusted for authorization on its
 * own (lot ownership, booking ownership and payment state are all re-read
 * from the server's own stores).
 */

const ACTOR_ID_PATTERN = /^[A-Za-z0-9_:\-.]{8,64}$/;
const DEVICE_KEY = 'parksmart_device_actor_id';
const USER_KEY = 'parksmart_current_user';

/** User ids that would not survive the server-side pattern (e.g. emails). */
function sanitizeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (ACTOR_ID_PATTERN.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/[^A-Za-z0-9_:\-.]/g, '_').slice(0, 64);
  return ACTOR_ID_PATTERN.test(compact) ? compact : null;
}

/** Stable per-browser id, created lazily. */
export function getDeviceActorId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && ACTOR_ID_PATTERN.test(existing)) return existing;
  } catch {
    // Storage unavailable (private mode) — fall through to an in-memory id.
  }

  const random = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  const id = sanitizeId(`device_${random}`) ?? `device_${Date.now()}`;
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // Ignore: the id simply will not persist for this tab.
  }
  return id;
}

/** Signed-in local (demo) account id, when one exists. */
function localAccountId(): string | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed?.id ? sanitizeId(parsed.id) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the actor id for outgoing API requests.
 *
 * Supabase sessions are read from local storage by supabase-js (no network),
 * so this is cheap; any failure falls back to the device id so requests are
 * never blocked by an auth library hiccup.
 */
export async function resolveActorId(): Promise<string> {
  const local = localAccountId();
  if (local) return local;

  try {
    const { supabase, isSupabaseConfigured } = await import('./supabase');
    if (isSupabaseConfigured()) {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id;
      if (id) {
        const sanitized = sanitizeId(id);
        if (sanitized) return sanitized;
      }
    }
  } catch {
    // Auth provider unavailable — the server applies its own fallback policy.
  }

  return getDeviceActorId();
}
