/**
 * Client for the QR verification / booking API.
 *
 * Every call goes through `apiFetch`, which:
 *   - attaches the Supabase session JWT (or the deployment access token) as a
 *     bearer token when one exists,
 *   - attaches the `X-ParkSmart-Actor` hint used ONLY when the server has no
 *     reachable auth provider (see src/server/actor.ts),
 *   - normalizes transport failures into a structured error so the UI can
 *     distinguish "offline / server unreachable" from a refused verification.
 *
 * Nothing returned by this module is authoritative for access decisions — the
 * server re-derives booking, owner, vehicle, payment, time and status state
 * on every request.
 */
import { getAccessToken } from '../lib/auth';
import { resolveActorId } from '../lib/actor';
import {
  ActiveParkingSession,
  Booking,
  OwnerVerificationSummary,
  ParkSmartNotification,
  QrPassStatus,
  VerificationAuditEntry,
  VerificationResult,
} from '../types';

export const ACTOR_HEADER = 'X-ParkSmart-Actor';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  /** Present whenever the server returned a structured verification result. */
  result?: VerificationResult;
  retryAfterSeconds?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const OFFLINE_MESSAGE =
  'Cannot reach the ParkSmart server. Online verification is required — check your connection and try again.';

function offlineError(): ApiError {
  return { status: 0, code: 'OFFLINE', message: OFFLINE_MESSAGE };
}

async function bearerToken(): Promise<string | null> {
  try {
    const supabaseToken = await getAccessToken();
    if (supabaseToken) return supabaseToken;
  } catch {
    // Auth library unreachable — the server decides what to do about that.
  }
  const envToken = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_ACCESS_TOKEN;
  return envToken || null;
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** `{ signal }` when a caller supplies an AbortSignal, otherwise `{}`. */
function signalOpt(signal?: AbortSignal): ApiFetchOptions {
  return signal ? { signal } : {};
}

/** Low-level JSON fetch with identity headers + normalized errors. */
export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: offlineError() };
  }

  let headers: Record<string, string> = { Accept: 'application/json' };
  try {
    headers[ACTOR_HEADER] = await resolveActorId();
    const token = await bearerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Identity headers are best-effort; the server still enforces auth.
  }

  const method = options.method ?? 'GET';
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(path, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await res.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    if (!res.ok || payload?.success === false) {
      const result = payload?.result as VerificationResult | undefined;
      const code = typeof payload?.code === 'string' ? payload.code : httpStatusToCode(res.status);
      const message =
        (typeof payload?.error === 'string' && payload.error) ||
        result?.message ||
        `Request failed (${res.status}).`;
      const retryAfter = Number(payload?.retryAfterSeconds ?? res.headers.get('Retry-After'));
      return {
        ok: false,
        error: {
          status: res.status,
          code,
          message,
          ...(result ? { result } : {}),
          ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
        },
      };
    }

    return { ok: true, data: (payload ?? {}) as T };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, error: { status: 0, code: 'ABORTED', message: 'Request cancelled.' } };
    }
    console.warn('[verificationService] request failed:', path, err);
    return { ok: false, error: offlineError() };
  }
}

function httpStatusToCode(status: number): string {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'AUTH_UNAVAILABLE';
  if (status >= 500) return 'SERVER_ERROR';
  return 'REQUEST_FAILED';
}

// ── Payload helpers ──────────────────────────────────────────────────────────

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Pull a verification token out of a camera scan.
 * Accepts the verification URL, a `parksmart://verify/<token>` deep link or a
 * bare 64-character hex token. Mirrors `extractQrToken` on the server.
 */
export function extractQrTokenFromScan(scanned: string | null | undefined): string | null {
  if (typeof scanned !== 'string') return null;
  const value = scanned.trim();
  if (!value) return null;
  if (TOKEN_PATTERN.test(value.toLowerCase())) return value.toLowerCase();

  try {
    if (/^https?:\/\//i.test(value) || /^parksmart:\/\//i.test(value)) {
      const url = new URL(value);
      const segments = url.pathname.split('/').filter(Boolean);
      const last = (segments[segments.length - 1] ?? '').toLowerCase();
      if (TOKEN_PATTERN.test(last)) return last;
    }
  } catch {
    // Not a URL — fall through to the loose pattern match.
  }

  const match = value.match(/[a-f0-9]{64}/i);
  return match ? match[0].toLowerCase() : null;
}

/** Pull an 8-character manual verification code out of user input. */
export function extractVerifyCodeFromInput(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
  return cleaned.length === 8 ? cleaned : null;
}

// ── Verification (owner / gate) ──────────────────────────────────────────────

export interface VerifyRequest {
  token?: string;
  code?: string;
}

export interface VerifyResponse {
  success: boolean;
  result: VerificationResult;
}

export async function verifyBooking(input: VerifyRequest, signal?: AbortSignal): Promise<ApiResult<VerificationResult>> {
  const res = await apiFetch<VerifyResponse>('/api/bookings/verify', {
    method: 'POST',
    body: { token: input.token ?? '', code: input.code ?? '' },
    ...(signal ? { signal } : {}),
  });
  if (res.ok === true) return { ok: true, data: res.data.result };

  // A refused verification still carries the structured result.
  if (res.error.result) return { ok: false, error: res.error };
  return { ok: false, error: res.error };
}

export async function checkInVehicle(bookingId: string): Promise<ApiResult<Booking>> {
  const res = await apiFetch<{ booking: Booking }>('/api/bookings/check-in', {
    method: 'POST',
    body: { bookingId },
  });
  if (res.ok === true) return { ok: true, data: res.data.booking };
  return { ok: false, error: res.error };
}

export async function checkOutVehicle(bookingId: string): Promise<ApiResult<Booking>> {
  const res = await apiFetch<{ booking: Booking }>('/api/bookings/check-out', {
    method: 'POST',
    body: { bookingId },
  });
  if (res.ok === true) return { ok: true, data: res.data.booking };
  return { ok: false, error: res.error };
}

export async function rejectEntry(bookingId: string, reason: string): Promise<ApiResult<Booking>> {
  const res = await apiFetch<{ booking: Booking }>('/api/bookings/reject', {
    method: 'POST',
    body: { bookingId, reason },
  });
  if (res.ok === true) return { ok: true, data: res.data.booking };
  return { ok: false, error: res.error };
}

// ── Driver bookings ──────────────────────────────────────────────────────────

export async function listMyBookings(signal?: AbortSignal): Promise<ApiResult<Booking[]>> {
  const res = await apiFetch<{ bookings: Booking[] }>('/api/bookings', signalOpt(signal));
  if (res.ok === true) return { ok: true, data: res.data.bookings ?? [] };
  return { ok: false, error: res.error };
}

export async function getBooking(bookingId: string, signal?: AbortSignal): Promise<ApiResult<Booking>> {
  const res = await apiFetch<{ booking: Booking }>(`/api/bookings/${encodeURIComponent(bookingId)}`, signalOpt(signal));
  if (res.ok === true) return { ok: true, data: res.data.booking };
  return { ok: false, error: res.error };
}

export interface QrPassPayload {
  bookingId: string;
  qrStatus: QrPassStatus;
  verifyCode: string;
  qrCreatedAt?: string;
  qrExpiresAt?: string;
  qrRevokedAt?: string | null;
  canRegenerate: boolean;
  note?: string;
}

export async function getQrPass(bookingId: string, signal?: AbortSignal): Promise<ApiResult<QrPassPayload>> {
  const res = await apiFetch<QrPassPayload>(`/api/bookings/${encodeURIComponent(bookingId)}/qr`, signalOpt(signal));
  if (res.ok === true) return { ok: true, data: res.data };
  return { ok: false, error: res.error };
}

export interface RegeneratedQr {
  token: string;
  verifyUrl: string;
  verifyCode: string;
  booking: Booking;
}

export async function regenerateQr(bookingId: string): Promise<ApiResult<RegeneratedQr>> {
  const res = await apiFetch<RegeneratedQr>(`/api/bookings/${encodeURIComponent(bookingId)}/regenerate-qr`, { method: 'POST' });
  if (res.ok === true) return { ok: true, data: res.data };
  return { ok: false, error: res.error };
}

export async function cancelBooking(bookingId: string): Promise<ApiResult<Booking>> {
  const res = await apiFetch<{ booking: Booking }>(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST' });
  if (res.ok === true) return { ok: true, data: res.data.booking };
  return { ok: false, error: res.error };
}

// ── Owner / garage-host endpoints ────────────────────────────────────────────

export async function getOwnerSummary(signal?: AbortSignal): Promise<ApiResult<OwnerVerificationSummary>> {
  const res = await apiFetch<{ summary: OwnerVerificationSummary }>('/api/owner/summary', signalOpt(signal));
  if (res.ok === true) return { ok: true, data: res.data.summary };
  return { ok: false, error: res.error };
}

export async function getActiveParkingSessions(signal?: AbortSignal): Promise<ApiResult<ActiveParkingSession[]>> {
  const res = await apiFetch<{ sessions: ActiveParkingSession[] }>('/api/owner/active-parking-sessions', signalOpt(signal));
  if (res.ok === true) return { ok: true, data: res.data.sessions ?? [] };
  return { ok: false, error: res.error };
}

export interface VerificationHistoryQuery {
  from?: string;
  to?: string;
  limit?: number;
}

export async function getVerificationHistory(
  query: VerificationHistoryQuery = {},
  signal?: AbortSignal
): Promise<ApiResult<VerificationAuditEntry[]>> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  const res = await apiFetch<{ verifications: VerificationAuditEntry[] }>(
    `/api/owner/verifications${qs ? `?${qs}` : ''}`,
    signalOpt(signal)
  );
  if (res.ok === true) return { ok: true, data: res.data.verifications ?? [] };
  return { ok: false, error: res.error };
}

export async function claimLot(lotId: string, lotName: string): Promise<ApiResult<{ alreadyOwned: boolean }>> {
  const res = await apiFetch<{ alreadyOwned: boolean }>('/api/owner/lots/claim', {
    method: 'POST',
    body: { lotId, lotName },
  });
  if (res.ok === true) return { ok: true, data: { alreadyOwned: Boolean(res.data.alreadyOwned) } };
  return { ok: false, error: res.error };
}

export async function listOwnedLots(signal?: AbortSignal): Promise<ApiResult<string[]>> {
  const res = await apiFetch<{ lotIds: string[] }>('/api/owner/lots', signalOpt(signal));
  if (res.ok === true) return { ok: true, data: res.data.lotIds ?? [] };
  return { ok: false, error: res.error };
}

// ── Notifications ────────────────────────────────────────────────────────────

export async function listNotifications(signal?: AbortSignal): Promise<
  ApiResult<{ notifications: ParkSmartNotification[]; unread: number }>
> {
  const res = await apiFetch<{ notifications: ParkSmartNotification[]; unread: number }>(
    '/api/notifications',
    signalOpt(signal)
  );
  if (res.ok === true) {
    return { ok: true, data: { notifications: res.data.notifications ?? [], unread: res.data.unread ?? 0 } };
  }
  return { ok: false, error: res.error };
}

export async function markNotificationsRead(): Promise<ApiResult<{ unread: number }>> {
  const res = await apiFetch<{ unread: number }>('/api/notifications/read', { method: 'POST' });
  if (res.ok === true) return { ok: true, data: { unread: res.data.unread ?? 0 } };
  return { ok: false, error: res.error };
}

// ── Booking (created by the existing BookingModal) ───────────────────────────

export interface CreateBookingPayload {
  lotId: string;
  stallCode: string;
  durationHours: number;
  vehicle: { plateNumber: string; makeModel: string; type: string; color: string };
  addons: Array<{ id: string; name: string; price: number; description: string }>;
  basePrice: number;
  totalPrice: number;
  paymentMethod?: string;
}

export interface CreateBookingResponse {
  booking: Booking;
  /** Raw QR token — returned exactly once, at generation time. */
  qrToken: string;
  verifyUrl: string;
}

export async function createBookingRequest(payload: CreateBookingPayload): Promise<ApiResult<CreateBookingResponse>> {
  const res = await apiFetch<CreateBookingResponse>('/api/parking/book', { method: 'POST', body: payload });
  if (res.ok === true) return { ok: true, data: res.data };
  return { ok: false, error: res.error };
}
