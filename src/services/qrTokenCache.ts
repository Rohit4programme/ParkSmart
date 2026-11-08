/**
 * Client-side cache for the raw QR token of a booking.
 *
 * The server returns the raw token exactly once (booking creation or QR
 * regeneration) and persists only its SHA-256 hash. The driver's device keeps
 * the token here so the ticket can be re-rendered, downloaded or shared
 * without ever asking the server to hand the token back (it never will).
 *
 * Losing this entry is recoverable: "Regenerate QR" issues a fresh token and
 * revokes the old one.
 */

const STORAGE_KEY = 'parksmart_qr_tokens';

export interface CachedQrCredential {
  bookingId: string;
  token: string;
  verifyUrl: string;
  savedAt: string;
}

type CredentialMap = Record<string, CachedQrCredential>;

function readAll(): CredentialMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CredentialMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: CredentialMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full/unavailable — the ticket then relies on regeneration.
  }
}

/** Build the opaque verification URL encoded into the QR image. */
export function buildQrPayload(token: string): string {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/verify/booking/${token}`;
}

export function saveQrToken(bookingId: string, token: string, verifyUrl?: string): void {
  if (!bookingId || !token) return;
  const map = readAll();
  map[bookingId] = {
    bookingId,
    token,
    verifyUrl: verifyUrl || buildQrPayload(token),
    savedAt: new Date().toISOString(),
  };
  writeAll(map);
}

export function getQrCredential(bookingId: string): CachedQrCredential | null {
  return readAll()[bookingId] ?? null;
}

export function clearQrToken(bookingId: string): void {
  const map = readAll();
  if (!(bookingId in map)) return;
  delete map[bookingId];
  writeAll(map);
}
