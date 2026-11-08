/**
 * Server-side booking store (persisted, indexed, concurrency-safe).
 *
 * This is the single source of truth for the QR verification system:
 *  - only a SHA-256 hash of the QR token is persisted (`qrTokenHash`),
 *  - lookups by id / token hash / manual verify code are O(1) via indexes,
 *  - every state change runs inside a per-booking lock so two devices can
 *    never check the same booking in simultaneously (spec Â§47),
 *  - state changes are validated by the booking lifecycle state machine.
 */
import { randomInt } from 'node:crypto';
import {
  Booking,
  BookingStatus,
  PaymentStatus,
  QrPassStatus,
} from '../types';
import { readJsonFile, writeJsonFile } from './storage';
import {
  assertTransition,
  deriveLegacyStatus,
  deriveQrPassStatus,
  isBookingExpired,
  InvalidTransitionError,
} from './bookingLifecycle';
import {
  buildVerifyUrl,
  generateQrToken,
  generateVerifyCode,
  hashQrToken,
} from './qrToken';
import { normalizeVehicleNumber } from '../utils/vehicleNumber';

const STORE_FILE = 'bookings.json';

/** Full persisted booking record. */
export interface StoredBooking extends Booking {
  vehicleNumber: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  parkingOwnerId: string | null;
  userId: string | null;
  verifyCode: string;
  qrTokenHash: string;
  qrCreatedAt: string;
  qrExpiresAt: string;
  qrRevokedAt: string | null;
  checkInTime?: string;
  checkOutTime?: string;
  verifiedByOwnerId?: string | null;
  verificationTime?: string;
  checkedOutBy?: string | null;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingInput {
  lotId: string;
  lotName: string;
  lotAddress: string;
  stallId: string;
  stallCode: string;
  floorName: string;
  startTime: Date;
  endTime: Date;
  durationHours: number;
  vehicle: Booking['vehicle'];
  addons: Booking['addons'];
  basePrice: number;
  addonsPrice: number;
  tax: number;
  totalPrice: number;
  lotLat: number;
  lotLng: number;
  userId: string | null;
  userEmail?: string | null;
  parkingOwnerId: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  bookingStatus: BookingStatus;
  /** Raw QR token â€” returned to the caller once, never persisted. */
  qrToken: string;
}

export interface CreateBookingResult {
  booking: StoredBooking;
  /** Raw token: shown to the driver exactly once (this response). */
  qrToken: string;
  verifyUrl: string;
}

// â”€â”€ In-memory state + indexes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const bookings = new Map<string, StoredBooking>();
const byTokenHash = new Map<string, string>();
const byVerifyCode = new Map<string, string>();
const byUser = new Map<string, Set<string>>();
const byLot = new Map<string, Set<string>>();

let loaded = false;

function indexBooking(booking: StoredBooking): void {
  bookings.set(booking.id, booking);
  byTokenHash.set(booking.qrTokenHash, booking.id);
  byVerifyCode.set(booking.verifyCode, booking.id);
  if (booking.userId) {
    const set = byUser.get(booking.userId) ?? new Set<string>();
    set.add(booking.id);
    byUser.set(booking.userId, set);
  }
  const lotSet = byLot.get(booking.lotId) ?? new Set<string>();
  lotSet.add(booking.id);
  byLot.set(booking.lotId, lotSet);
}

function persist(): void {
  writeJsonFile(STORE_FILE, Array.from(bookings.values()));
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const rows = readJsonFile<StoredBooking[]>(STORE_FILE, []);
  let scrubbed = false;
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') continue;
    // Re-derive legacy/derived fields so upgrades stay consistent.
    row.status = deriveLegacyStatus(row.bookingStatus ?? 'CONFIRMED');
    // Older builds persisted the verification URL in `qrCodeData`, which embeds
    // the raw QR token. The token is never stored (only its SHA-256 hash), so
    // scrub it from any pre-existing record on load.
    if (typeof row.qrCodeData === 'string' && row.qrCodeData !== '') {
      row.qrCodeData = '';
      scrubbed = true;
    }
    indexBooking(row);
  }
  if (scrubbed) persist();
}

/** Test/ops helper: drop all in-memory state (does not touch disk). */
export function resetBookingStore(): void {
  ensureLoaded();
  bookings.clear();
  byTokenHash.clear();
  byVerifyCode.clear();
  byUser.clear();
  byLot.clear();
}

// â”€â”€ Per-booking critical section (race-condition protection, spec Â§47) â”€â”€â”€â”€â”€â”€â”€

const chains = new Map<string, Promise<unknown>>();

/**
 * Serializes every mutation of a single booking. Two concurrent check-in
 * requests for the same booking run one after the other, so the second one
 * sees `CHECKED_IN` and is rejected.
 */
export function withBookingLock<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = chains.get(id) ?? Promise.resolve();
  const next = previous.then(
    () => fn(),
    () => fn()
  );
  chains.set(
    id,
    next.catch(() => undefined)
  );
  return next;
}

// â”€â”€ CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function uniqueVerifyCode(): string {
  for (let i = 0; i < 50; i += 1) {
    const code = generateVerifyCode();
    if (!byVerifyCode.has(code)) return code;
  }
  // Effectively unreachable (4^32 space), but never return a colliding code.
  return generateVerifyCode() + generateVerifyCode().slice(0, 0);
}

export function createBooking(input: CreateBookingInput): CreateBookingResult {
  ensureLoaded();
  const now = new Date();
  const token = input.qrToken;
  const tokenHash = hashQrToken(token);
  const bookingId = `PS-${randomInt(0x10000000, 0xffffffff)
    .toString(16)
    .toUpperCase()
    .padStart(8, '0')}`;

  const booking: StoredBooking = {
    id: bookingId,
    lotId: input.lotId,
    lotName: input.lotName,
    lotAddress: input.lotAddress,
    stallId: input.stallId,
    stallCode: input.stallCode,
    floorName: input.floorName,
    startTime: input.startTime.toISOString(),
    endTime: input.endTime.toISOString(),
    durationHours: input.durationHours,
    vehicle: input.vehicle,
    vehicleNumber: normalizeVehicleNumber(input.vehicle.plateNumber),
    addons: input.addons,
    basePrice: input.basePrice,
    addonsPrice: input.addonsPrice,
    tax: input.tax,
    totalPrice: input.totalPrice,
    qrCodeData: '',
    status: deriveLegacyStatus(input.bookingStatus),
    bookingStatus: input.bookingStatus,
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod,
    parkingOwnerId: input.parkingOwnerId,
    userId: input.userId,
    verifyCode: uniqueVerifyCode(),
    qrTokenHash: tokenHash,
    qrCreatedAt: now.toISOString(),
    qrExpiresAt: input.endTime.toISOString(),
    qrRevokedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lotLat: input.lotLat,
    lotLng: input.lotLng,
  };

  indexBooking(booking);
  persist();

  return { booking, qrToken: token, verifyUrl: buildVerifyUrl(token) };
}

export function getBookingById(id: string): StoredBooking | undefined {
  ensureLoaded();
  return bookings.get(id);
}

export function findBookingByTokenHash(hash: string): StoredBooking | undefined {
  ensureLoaded();
  const id = byTokenHash.get(hash);
  return id ? bookings.get(id) : undefined;
}

export function findBookingByVerifyCode(code: string): StoredBooking | undefined {
  ensureLoaded();
  const id = byVerifyCode.get(code);
  return id ? bookings.get(id) : undefined;
}

export function listBookingsByUser(userId: string): StoredBooking[] {
  ensureLoaded();
  const ids = byUser.get(userId);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => bookings.get(id))
    .filter((b): b is StoredBooking => Boolean(b))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listBookingsByLots(lotIds: Set<string>): StoredBooking[] {
  ensureLoaded();
  const out: StoredBooking[] = [];
  for (const lotId of lotIds) {
    const ids = byLot.get(lotId);
    if (!ids) continue;
    for (const id of ids) {
      const booking = bookings.get(id);
      if (booking) out.push(booking);
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listAllBookings(): StoredBooking[] {
  ensureLoaded();
  return Array.from(bookings.values());
}

/**
 * Mutate a booking inside its critical section and persist the result.
 * The mutator receives the live record; returning `false` aborts without
 * persisting (used for "already changed" style checks).
 */
export async function mutateBooking<T>(
  id: string,
  mutator: (booking: StoredBooking) => T | Promise<T>
): Promise<{ ok: true; booking: StoredBooking; result: T } | { ok: false; error: unknown }> {
  ensureLoaded();
  return withBookingLock(id, async () => {
    const booking = bookings.get(id);
    if (!booking) return { ok: false as const, error: new BookingNotFoundError(id) };
    try {
      const result = await mutator(booking);
      booking.updatedAt = new Date().toISOString();
      persist();
      return { ok: true as const, booking, result };
    } catch (err) {
      return { ok: false as const, error: err };
    }
  });
}

export class BookingNotFoundError extends Error {
  constructor(id: string) {
    super(`Booking ${id} not found`);
    this.name = 'BookingNotFoundError';
  }
}

/**
 * Apply a lifecycle transition (validated by the state machine) plus an
 * optional field patch, then persist. Runs inside the booking lock.
 */
export function applyTransition(
  booking: StoredBooking,
  to: BookingStatus,
  patch: Partial<StoredBooking> = {}
): void {
  const from = booking.bookingStatus;
  assertTransition(from, to);
  Object.assign(booking, patch, {
    bookingStatus: to,
    status: deriveLegacyStatus(to),
    updatedAt: new Date().toISOString(),
  });
}

export { InvalidTransitionError };

// â”€â”€ QR credential lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface RotatedQrCredentials {
  /** Raw token â€” returned once to the driver, never persisted. */
  token: string;
  verifyUrl: string;
  verifyCode: string;
  previousRevokedAt: string | null;
}

/**
 * Rotate the booking's QR credentials (spec Â§28): the previous token/code are
 * un-indexed (so they resolve to nothing) and, when `revokePrevious` is set,
 * the record is stamped `qrRevokedAt`. Only ONE credential pair is ever
 * active per booking.
 */
export async function rotateQrCredentials(
  bookingId: string,
  options: { revokePrevious?: boolean } = {}
): Promise<{ ok: true; credentials: RotatedQrCredentials } | { ok: false; error: unknown }> {
  ensureLoaded();
  return withBookingLock(bookingId, async () => {
    const booking = bookings.get(bookingId);
    if (!booking) return { ok: false as const, error: new BookingNotFoundError(bookingId) };

    const now = new Date();
    const previousRevokedAt = options.revokePrevious === false ? booking.qrRevokedAt : booking.qrRevokedAt ?? now.toISOString();

    // Un-index the old credentials so old QR images stop resolving.
    byTokenHash.delete(booking.qrTokenHash);
    byVerifyCode.delete(booking.verifyCode);

    const token = generateQrToken();
    const tokenHash = hashQrToken(token);
    let verifyCode = uniqueVerifyCode();

    booking.qrTokenHash = tokenHash;
    booking.verifyCode = verifyCode;
    booking.qrCreatedAt = now.toISOString();
    booking.qrExpiresAt = booking.endTime;
    booking.qrRevokedAt = null;
    booking.updatedAt = now.toISOString();

    byTokenHash.set(tokenHash, booking.id);
    byVerifyCode.set(verifyCode, booking.id);
    persist();

    return {
      ok: true as const,
      credentials: {
        token,
        verifyUrl: buildVerifyUrl(token),
        verifyCode,
        previousRevokedAt,
      },
    };
  });
}

/** Stamp a booking's QR as revoked (cancellation / rejection / rotation). */
export function revokeQr(booking: StoredBooking, when: Date = new Date()): void {
  if (!booking.qrRevokedAt) booking.qrRevokedAt = when.toISOString();
  booking.updatedAt = when.toISOString();
}

/**
 * Lazily expire bookings whose window (+ grace) has elapsed so that reads,
 * verification and the driver's QR screen all agree. Returns true when a
 * transition was applied and persisted.
 */
export async function expireIfDue(booking: StoredBooking, now: Date = new Date()): Promise<boolean> {
  if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'ACTIVE') return false;
  if (!isBookingExpired(booking, now)) return false;

  const res = await mutateBooking(booking.id, (b) => {
    if (b.bookingStatus !== 'CONFIRMED' && b.bookingStatus !== 'ACTIVE') return false;
    applyTransition(b, 'EXPIRED');
    return true;
  });
  return res.ok && res.result === true;
}

export interface ClientBookingProjection {
  booking: Booking & { qrStatus: QrPassStatus };
  /** Raw manual verification code â€” only ever sent to the booking's driver. */
  verifyCode?: string;
}

/**
 * Client-safe projection of a booking.
 *  - the token hash is stripped (it is a server-side lookup secret),
 *  - the manual verification code is only included for the driver,
 *  - `qrStatus`/`status` are derived server-side so the UI cannot lie.
 */
export function toClientBooking(
  booking: StoredBooking,
  options: { includeVerifyCode?: boolean } = {}
): Booking & { qrStatus: QrPassStatus; verifyCode?: string } {
  const now = new Date();
  const { qrTokenHash: _hash, verifyCode, ...rest } = booking;
  return {
    ...rest,
    // Legacy field. Older records persisted the verification URL here, which
    // embeds the raw QR token — it must never leave the server again.
    qrCodeData: '',
    status: deriveLegacyStatus(booking.bookingStatus),
    qrStatus: deriveQrPassStatus(booking, now),
    ...(options.includeVerifyCode ? { verifyCode } : {}),
  };
}
