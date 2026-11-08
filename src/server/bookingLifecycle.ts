/**
 * Booking status state machine + time/grace rules.
 *
 * Lifecycle (spec §20):
 *
 *   PENDING_PAYMENT → CONFIRMED → ACTIVE → CHECKED_IN → CHECKED_OUT → COMPLETED
 *        ↓                ↓↘        ↓↘         ↓
 *   PAYMENT_FAILED     CANCELLED   EXPIRED   CANCELLED_BY_OWNER
 *                      REJECTED
 *
 * Every status change in the system MUST go through `assertTransition` so the
 * frontend can never push a booking into an arbitrary state.
 */
import { Booking, BookingStatus, PaymentStatus, QrPassStatus } from '../types';

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED'],
  PAYMENT_FAILED: ['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['ACTIVE', 'CHECKED_IN', 'CANCELLED', 'EXPIRED', 'REJECTED', 'CANCELLED_BY_OWNER'],
  ACTIVE: ['CHECKED_IN', 'CANCELLED', 'EXPIRED', 'REJECTED', 'CANCELLED_BY_OWNER'],
  CHECKED_IN: ['CHECKED_OUT', 'CANCELLED_BY_OWNER'],
  CHECKED_OUT: ['COMPLETED', 'CANCELLED_BY_OWNER'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  REJECTED: [],
  CANCELLED_BY_OWNER: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Throws when a transition is not permitted (callers convert to a 409). */
export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  readonly from: BookingStatus;
  readonly to: BookingStatus;
  constructor(from: BookingStatus, to: BookingStatus) {
    super(`Invalid booking transition ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Booking states in which the QR pass may be presented / verified. */
export const VERIFIABLE_STATUSES: BookingStatus[] = ['CONFIRMED', 'ACTIVE'];

/** Booking states that may be checked in by the parking owner. */
export const CHECK_IN_ELIGIBLE_STATUSES: BookingStatus[] = ['CONFIRMED', 'ACTIVE'];

/** Booking states that may be checked out by the parking owner. */
export const CHECK_OUT_ELIGIBLE_STATUSES: BookingStatus[] = ['CHECKED_IN'];

/** Terminal states — no further transition is allowed. */
export const TERMINAL_STATUSES: BookingStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
  'CANCELLED_BY_OWNER',
  'PAYMENT_FAILED',
];

// ── Grace periods (configurable, server-side) ────────────────────────────────

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Minutes before `startTime` during which early check-in is accepted. */
export function earlyCheckInGraceMinutes(): number {
  return envInt('QR_EARLY_GRACE_MINUTES', 15);
}

/** Minutes after `endTime` during which late check-in is still accepted. */
export function lateCheckInGraceMinutes(): number {
  return envInt('QR_EXPIRY_GRACE_MINUTES', 30);
}

export function checkInWindowStart(booking: Pick<Booking, 'startTime'>): Date {
  return new Date(new Date(booking.startTime).getTime() - earlyCheckInGraceMinutes() * 60_000);
}

export function checkInWindowEnd(booking: Pick<Booking, 'endTime'>): Date {
  return new Date(new Date(booking.endTime).getTime() + lateCheckInGraceMinutes() * 60_000);
}

/** True when the booking window (plus grace) has fully elapsed. */
export function isBookingExpired(booking: Pick<Booking, 'endTime'>, now: Date = new Date()): boolean {
  return now.getTime() > checkInWindowEnd(booking).getTime();
}

// ── Derived values ───────────────────────────────────────────────────────────

/** Legacy 3-value status used by the existing UI (`Booking.status`). */
export function deriveLegacyStatus(status: BookingStatus): Booking['status'] {
  switch (status) {
    case 'COMPLETED':
    case 'CHECKED_OUT':
      return 'completed';
    case 'CANCELLED':
    case 'EXPIRED':
    case 'REJECTED':
    case 'CANCELLED_BY_OWNER':
    case 'PAYMENT_FAILED':
      return 'cancelled';
    default:
      return 'active';
  }
}

/** Derived pass state for the driver's QR screen (spec §26). */
export function deriveQrPassStatus(
  booking: Pick<Booking, 'bookingStatus' | 'startTime' | 'endTime' | 'status'>,
  now: Date = new Date()
): QrPassStatus {
  const status = booking.bookingStatus;
  if (status === 'CANCELLED' || status === 'REJECTED' || status === 'CANCELLED_BY_OWNER') return 'CANCELLED';
  if (status === 'PAYMENT_FAILED') return 'CANCELLED';
  if (status === 'COMPLETED' || status === 'CHECKED_OUT') return 'COMPLETED';
  if (status === 'CHECKED_IN') return 'CHECKED_IN';
  if (status === 'EXPIRED') return 'EXPIRED';
  if (isBookingExpired(booking, now)) return 'EXPIRED';
  if (now.getTime() < new Date(booking.startTime).getTime() - earlyCheckInGraceMinutes() * 60_000) {
    return 'NOT_ACTIVE_YET';
  }
  return 'ACTIVE';
}

/** Human message for a QR pass state (used by the user's QR screen). */
export function describeQrPassStatus(status: QrPassStatus): string {
  switch (status) {
    case 'NOT_ACTIVE_YET':
      return 'NOT ACTIVE YET';
    case 'ACTIVE':
      return 'ACTIVE';
    case 'CHECKED_IN':
      return 'CHECKED IN';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'UNKNOWN';
  }
}

/** Whether entry is allowed for a paid booking in a given state. */
export function paymentAllowsEntry(payment: PaymentStatus | undefined): boolean {
  return payment === 'PAID';
}
