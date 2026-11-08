/**
 * Secure QR verification token utilities.
 *
 * SECURITY CONTRACT
 *  - The QR code carries ONLY an opaque, cryptographically random token
 *    (256 bits, generated server-side with `crypto.randomBytes`).
 *  - The database stores a SHA-256 hash of the token; the raw token is
 *    returned exactly once (at generation / regeneration) and never logged.
 *  - Verification always re-derives everything else (booking, owner,
 *    vehicle, payment, time, status) from the backend.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 bytes = 256 bits of entropy (spec minimum is 128 bits). */
const TOKEN_BYTES = 32;
export const QR_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/** Short human-typable fallback code printed on the ticket (8 hex chars). */
export const VERIFY_CODE_PATTERN = /^[A-F0-9]{8}$/;

/** Base URL used inside the QR payload (HTTPS in production). */
export function appBaseUrl(): string {
  const raw = process.env.APP_URL || '';
  if (raw) return raw.replace(/\/+$/, '');
  return `http://localhost:${process.env.PORT || 3000}`;
}

/** Fresh cryptographically secure raw token (hex). */
export function generateQrToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/** SHA-256 of the raw token — the only value persisted for lookups. */
export function hashQrToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/** Random 8-char uppercase hex code used for manual verification fallback. */
export function generateVerifyCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

/** The URL encoded into the QR image. Contains no booking data. */
export function buildVerifyUrl(token: string): string {
  return `${appBaseUrl()}/verify/booking/${token}`;
}

export function isValidQrToken(value: unknown): boolean {
  return typeof value === 'string' && QR_TOKEN_PATTERN.test(value);
}

/**
 * Extract a verification token from whatever the camera scanned.
 * Accepts the full HTTPS verification URL, a `parksmart://verify/<token>`
 * deep link, or a bare 64-char hex token (manual entry of a copied token).
 * Returns null when the payload is not a ParkSmart verification token.
 */
export function extractQrToken(scanned: unknown): string | null {
  if (typeof scanned !== 'string') return null;
  const value = scanned.trim();
  if (!value) return null;

  if (isValidQrToken(value)) return value;

  let candidate = value;
  try {
    if (/^https?:\/\//i.test(value) || /^parksmart:\/\//i.test(value)) {
      const url = new URL(value);
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] ?? '';
      candidate = last;
      if (!isValidQrToken(candidate) && segments.includes('verify')) {
        candidate = segments[segments.length - 1] ?? '';
      }
    }
  } catch {
    // Not parseable as a URL — fall through to pattern matching.
  }

  const match = value.match(/[a-f0-9]{64}/i);
  const token = isValidQrToken(candidate) ? candidate : match ? match[0].toLowerCase() : null;
  return token ? token.toLowerCase() : null;
}

/** Extract a manual verification code (e.g. "8F72A91C") from user input. */
export function extractVerifyCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
  if (cleaned.length !== 8) return null;
  return VERIFY_CODE_PATTERN.test(cleaned) ? cleaned : null;
}
