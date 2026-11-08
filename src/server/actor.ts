/**
 * Server-side actor (identity) resolution.
 *
 * Identity ALWAYS comes from the server's own authentication — never from a
 * request body (spec §13). Supported providers, in order:
 *
 *  1. Supabase session JWT  → verified with supabase.auth.getUser()
 *     (signature + expiry checked server-side).
 *  2. Static API_ACCESS_TOKEN gate (constant-time compare) for deployments
 *     that do not use Supabase.
 *  3. Demo/dev identity — only when NO auth provider is configured, or when a
 *     configured Supabase instance is unreachable AND the server is not
 *     running in production. Demo identity comes from a validated client
 *     header, is logged loudly, and is marked `verified: false`.
 *
 * The demo fallback exists so a misconfigured/out-of-box local environment
 * still works end-to-end; it is refused (503) in production.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Actor } from '../types';

export const ACTOR_HEADER = 'x-parksmart-actor';
const ACTOR_ID_PATTERN = /^[A-Za-z0-9_:\-.]{8,64}$/;
const PROBE_TTL_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 4000;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || '';

export function isSupabaseConfiguredOnServer(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Demo identity is allowed outside production only. */
export function demoIdentityAllowed(): boolean {
  if (process.env.PARKSMART_ALLOW_DEMO_IDENTITY === 'true') return true;
  if (process.env.PARKSMART_ALLOW_DEMO_IDENTITY === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

let supabaseClient: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfiguredOnServer()) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseClient;
}

// ── Reachability probe ───────────────────────────────────────────────────────
// A configured-but-unreachable auth provider must not permanently brick the
// API (local/offline development, expired project). The result is cached.

let probeResult: boolean | null = null;
let probeAt = 0;
let probing: Promise<boolean> | null = null;
let warnedUnreachable = false;

export async function isAuthProviderReachable(force = false): Promise<boolean> {
  if (!isSupabaseConfiguredOnServer()) return false;
  const now = Date.now();
  if (!force && probeResult !== null && now - probeAt < PROBE_TTL_MS) return probeResult;
  if (probing) return probing;

  probing = (async () => {
    let reachable = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      // Any HTTP response means the host resolved and answered.
      reachable = Boolean(res);
    } catch {
      reachable = false;
    }
    probeResult = reachable;
    probeAt = Date.now();
    if (!reachable && !warnedUnreachable) {
      warnedUnreachable = true;
      console.warn(
        '[auth] Supabase is configured but unreachable. ' +
          (demoIdentityAllowed()
            ? 'Falling back to INSECURE demo identity mode (NODE_ENV != production).'
            : 'Running in production — identity-dependent routes will return 503.')
      );
    }
    return reachable;
  })();

  try {
    return await probing;
  } finally {
    probing = null;
  }
}

/** Test helper: forget the cached probe result. */
export function resetAuthProbe(): void {
  probeResult = null;
  probeAt = 0;
  warnedUnreachable = false;
}

// ── Error helpers ────────────────────────────────────────────────────────────

export interface ActorError {
  status: number;
  message: string;
  code: string;
}

function unauthorized(message = 'Unauthorized'): ActorError {
  return { status: 401, message, code: 'UNAUTHENTICATED' };
}

function authUnavailable(): ActorError {
  return {
    status: 503,
    message: 'Authentication service is unavailable. Please try again later.',
    code: 'AUTH_UNAVAILABLE',
  };
}

function isNetworkishError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('abort') ||
    message.includes('other fetch error')
  );
}

function readActorHeader(req: Request): string | null {
  const raw = req.headers[ACTOR_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ACTOR_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '';
}

// ── Resolution ───────────────────────────────────────────────────────────────

export type ActorResolution = { actor: Actor; authUser?: User } | { error: ActorError };

export async function resolveActor(req: Request): Promise<ActorResolution> {
  const token = bearerToken(req);

  // ── Provider 1: Supabase session JWT ──
  if (isSupabaseConfiguredOnServer()) {
    const reachable = await isAuthProviderReachable();

    if (token && reachable) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.getUser(token);
          if (error || !data.user) return { error: unauthorized() };
          return {
            actor: {
              id: data.user.id,
              email: data.user.email ?? undefined,
              name:
                typeof data.user.user_metadata?.name === 'string'
                  ? data.user.user_metadata.name
                  : undefined,
              kind: 'supabase',
              verified: true,
            },
            authUser: data.user,
          };
        } catch (err) {
          if (isNetworkishError(err)) {
            resetAuthProbe();
            probeResult = false;
            probeAt = Date.now();
            console.warn('[auth] Supabase token verification failed with a network error.');
            // Fall through to the demo path below (production refuses below).
          } else {
            console.error('[auth] Supabase token verification error:', err);
            return { error: unauthorized() };
          }
        }
      }
    } else if (token && !reachable) {
      // Token present but provider unreachable — cannot verify it.
      console.warn('[auth] Ignoring unverifiable bearer token (auth provider unreachable).');
    } else if (!token && reachable) {
      // Configured + reachable + no credentials: exactly the previous
      // behavior of requireAuth() → 401.
      return { error: unauthorized() };
    }

    // Provider unreachable (or unverifiable token) → demo fallback policy.
    if (!demoIdentityAllowed()) return { error: authUnavailable() };
    const demoActor = demoActorFromRequest(req);
    if (demoActor) return { actor: demoActor };
    return { error: unauthorized('Missing X-ParkSmart-Actor identity header.') };
  }

  // ── Provider 2: static access token gate ──
  if (ACCESS_TOKEN) {
    const expected = createHash('sha256').update(ACCESS_TOKEN).digest();
    const actual = createHash('sha256').update(token ?? '').digest();
    if (!token || !timingSafeEqual(expected, actual)) return { error: unauthorized() };
    const headerActor = readActorHeader(req);
    return {
      actor: {
        id: headerActor ?? 'access-token-owner',
        kind: 'access_token',
        verified: Boolean(headerActor),
      },
    };
  }

  // ── Provider 3: demo identity (no auth provider configured) ──
  if (!demoIdentityAllowed()) return { error: authUnavailable() };
  const demoActor = demoActorFromRequest(req);
  if (demoActor) return { actor: demoActor };
  return { error: unauthorized('Missing X-ParkSmart-Actor identity header.') };
}

function demoActorFromRequest(req: Request): Actor | null {
  const headerActor = readActorHeader(req);
  if (!headerActor) return null;
  return { id: headerActor, kind: 'demo', verified: false };
}

// ── Express middleware ───────────────────────────────────────────────────────

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
    actorIp?: string;
    authUser?: User;
  }
}

/**
 * Attaches `req.actor` (server-resolved identity) or responds 401/503.
 * Also keeps `req.authUser` populated for the existing routes.
 */
export function requireActor(req: Request, res: Response, next: NextFunction): void {
  resolveActor(req)
    .then((resolution) => {
      if ('error' in resolution) {
        res.status(resolution.error.status).json({
          success: false,
          error: resolution.error.message,
          code: resolution.error.code,
        });
        return;
      }
      req.actor = resolution.actor;
      if (resolution.authUser) req.authUser = resolution.authUser;
      req.actorIp = clientIp(req);
      next();
    })
    .catch((err) => {
      console.error('[auth] Actor resolution failed:', err);
      res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    });
}

/** Actor for the current request, or a 401-shaped error for handlers. */
export function actorOrError(req: Request): { actor: Actor } | { error: ActorError } {
  if (req.actor) return { actor: req.actor };
  return { error: unauthorized() };
}
