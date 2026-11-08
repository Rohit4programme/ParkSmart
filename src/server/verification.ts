/**
 * QR verification algorithm â€” the backend is the source of truth.
 *
 *   QR â†’ opaque token â†’ SHA-256 â†’ booking lookup â†’ status â†’ payment â†’
 *   ownership â†’ time window â†’ duplicate check â†’ structured result
 *
 * Nothing the client sends is trusted: identity comes from the authenticated
 * session, payment/status/time come from the server's own records, and the
 * QR payload itself is only used as an opaque lookup key (spec Â§52).
 */
import {
  Actor,
  VerificationFailure,
  VerificationReasonCode,
  VerificationSuccess,
} from '../types';
import {
  StoredBooking,
  applyTransition,
  expireIfDue,
  findBookingByTokenHash,
  findBookingByVerifyCode,
  getBookingById,
  mutateBooking,
} from './bookingStore';
import { getLotOwner } from './lotOwnership';
import { recordAudit } from './auditLog';
import { createNotification } from './notifications';
import { gateActionLimiter, verificationLimiter } from './rateLimiter';
import { extractQrToken, extractVerifyCode, hashQrToken } from './qrToken';
import {
  CHECK_IN_ELIGIBLE_STATUSES,
  CHECK_OUT_ELIGIBLE_STATUSES,
  checkInWindowEnd,
  checkInWindowStart,
  isBookingExpired,
} from './bookingLifecycle';
import { formatDurationMinutes } from '../utils/duration';

export interface GateError {
  httpStatus: number;
  reason: VerificationReasonCode;
  message: string;
}

export type GateResult<T = undefined> =
  | { ok: true; booking: StoredBooking; value: T }
  | { ok: false; error: GateError; booking?: StoredBooking };

function fail(
  httpStatus: number,
  reason: VerificationReasonCode,
  message: string,
  booking?: StoredBooking
): { ok: false; error: GateError; booking?: StoredBooking } {
  return { ok: false, error: { httpStatus, reason, message }, ...(booking ? { booking } : {}) };
}

// â”€â”€ Failure messages (user-friendly, never internal details) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FAILURE_MESSAGES: Record<VerificationReasonCode, string> = {
  QR_INVALID: 'This QR code is not a valid ParkSmart pass.',
  QR_EXPIRED: 'This QR code has expired.',
  BOOKING_NOT_FOUND: 'No booking matches this pass.',
  BOOKING_CANCELLED: 'This booking has been cancelled.',
  BOOKING_EXPIRED: 'This booking has expired.',
  BOOKING_REJECTED: 'Entry for this booking was rejected.',
  PAYMENT_NOT_COMPLETED: 'Payment for this booking is not complete.',
  WRONG_PARKING_OWNER: 'This booking belongs to another parking location.',
  ALREADY_CHECKED_IN: 'This vehicle has already been checked in.',
  ALREADY_COMPLETED: 'This parking session has already finished.',
  INVALID_TIME: 'This booking is not valid at the current time.',
  TOKEN_REVOKED: 'This QR code was regenerated and is no longer valid.',
  UNAUTHENTICATED: 'Sign in as the parking owner to verify bookings.',
  RATE_LIMITED: 'Too many verification attempts. Please wait a moment.',
  NOT_FOUND: 'Not found.',
  SERVER_ERROR: 'Something went wrong. Please try again.',
};

export function failureMessage(reason: VerificationReasonCode): string {
  return FAILURE_MESSAGES[reason] ?? FAILURE_MESSAGES.SERVER_ERROR;
}

function auditActionForFailure(reason: VerificationReasonCode): 'INVALID_QR' | 'EXPIRED_QR' | 'WRONG_OWNER' | 'QR_SCANNED' {
  switch (reason) {
    case 'QR_INVALID':
    case 'BOOKING_NOT_FOUND':
    case 'TOKEN_REVOKED':
      return 'INVALID_QR';
    case 'BOOKING_EXPIRED':
    case 'QR_EXPIRED':
      return 'EXPIRED_QR';
    case 'WRONG_PARKING_OWNER':
      return 'WRONG_OWNER';
    default:
      return 'QR_SCANNED';
  }
}

function buildFailure(
  reason: VerificationReasonCode,
  booking: StoredBooking | undefined,
  isOwner: boolean
): VerificationFailure {
  const base: VerificationFailure = {
    valid: false,
    status: 'INVALID',
    reason,
    message: failureMessage(reason),
    canCheckIn: false,
  };
  // Privacy: only reveal booking details to the owner of that location.
  if (!booking || !isOwner) return base;
  return {
    ...base,
    bookingId: booking.id,
    vehicleNumber: booking.vehicleNumber,
    parkingSpot: booking.stallCode,
    parkingName: booking.lotName,
    startTime: booking.startTime,
    endTime: booking.endTime,
    paymentStatus: booking.paymentStatus,
    bookingStatus: booking.bookingStatus,
  };
}

function buildSuccess(booking: StoredBooking, canCheckIn: boolean): VerificationSuccess {
  return {
    valid: true,
    status: 'VALID',
    reason: 'OK',
    message: canCheckIn
      ? 'Booking verified. Vehicle matches booking, payment verified, booking active.'
      : 'Booking verified.',
    bookingId: booking.id,
    vehicleNumber: booking.vehicleNumber,
    vehicleModel: booking.vehicle.makeModel,
    parkingSpot: booking.stallCode,
    parkingName: booking.lotName,
    parkingLocationId: booking.lotId,
    startTime: booking.startTime,
    endTime: booking.endTime,
    paymentStatus: booking.paymentStatus,
    bookingStatus: booking.bookingStatus,
    canCheckIn,
    ...(booking.checkInTime ? { checkInTime: booking.checkInTime } : {}),
    ...(booking.checkOutTime ? { checkOutTime: booking.checkOutTime } : {}),
  };
}

// â”€â”€ Step 1â€“4: resolve the scanned credential to a booking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type CredentialResolution =
  | { found: true; booking: StoredBooking; via: 'token' | 'code' }
  | { found: false; reason: 'QR_INVALID' | 'BOOKING_NOT_FOUND' };

export function resolveCredential(input: {
  token?: string | null;
  code?: string | null;
}): CredentialResolution {
  const token = input.token ? extractQrToken(input.token) : null;
  if (token) {
    const booking = findBookingByTokenHash(hashQrToken(token));
    if (booking) return { found: true, booking, via: 'token' };
    return { found: false, reason: 'QR_INVALID' };
  }

  const code = extractVerifyCode(input.code ?? '');
  if (code) {
    const booking = findBookingByVerifyCode(code);
    if (booking) return { found: true, booking, via: 'code' };
    return { found: false, reason: 'BOOKING_NOT_FOUND' };
  }

  return { found: false, reason: 'QR_INVALID' };
}

// â”€â”€ Step 5â€“12: full verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface VerifyInput {
  actor: Actor;
  token?: string | null;
  code?: string | null;
  ip?: string;
  now?: Date;
}

export async function verifyBookingForOwner(input: VerifyInput): Promise<
  | { ok: true; result: VerificationSuccess; booking: StoredBooking }
  | { ok: false; httpStatus: number; result: VerificationFailure }
> {
  const { actor } = input;
  const now = input.now ?? new Date();

  // Rate limiting is part of the algorithm (spec Â§22) so tests cover it.
  const limit = verificationLimiter.check(actor.id);
  if (!limit.allowed) {
    return {
      ok: false,
      httpStatus: 429,
      result: buildFailure('RATE_LIMITED', undefined, false),
    };
  }

  const resolution = resolveCredential(input);

  if (resolution.found === false) {
    recordAudit({
      bookingId: null,
      ownerId: actor.id,
      parkingLocationId: null,
      action: 'INVALID_QR',
      result: 'failure',
      reason: resolution.reason,
      detail: input.code && !input.token ? 'manual_code' : 'qr_scan',
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return { ok: false, httpStatus: 404, result: buildFailure(resolution.reason, undefined, false) };
  }

  const booking = resolution.booking;
  const lotOwnerId = getLotOwner(booking.lotId);
  const isOwner = Boolean(lotOwnerId) && lotOwnerId === actor.id;

  const auditFailure = (reason: VerificationReasonCode, detail?: string) => {
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: auditActionForFailure(reason),
      result: 'failure',
      reason,
      ...(detail ? { detail } : {}),
      ...(input.ip ? { ip: input.ip } : {}),
    });
  };

  // Step 6: booking status.
  const status = booking.bookingStatus;
  if (status === 'CANCELLED' || status === 'CANCELLED_BY_OWNER') {
    auditFailure('BOOKING_CANCELLED', resolution.via);
    return { ok: false, httpStatus: 409, result: buildFailure('BOOKING_CANCELLED', booking, isOwner) };
  }
  if (status === 'REJECTED') {
    auditFailure('BOOKING_REJECTED', resolution.via);
    return { ok: false, httpStatus: 409, result: buildFailure('BOOKING_REJECTED', booking, isOwner) };
  }
  if (status === 'COMPLETED' || status === 'CHECKED_OUT') {
    auditFailure('ALREADY_COMPLETED', resolution.via);
    return { ok: false, httpStatus: 409, result: buildFailure('ALREADY_COMPLETED', booking, isOwner) };
  }
  if (status === 'CHECKED_IN') {
    auditFailure('ALREADY_CHECKED_IN', resolution.via);
    return { ok: false, httpStatus: 409, result: buildFailure('ALREADY_CHECKED_IN', booking, isOwner) };
  }
  if (status === 'PENDING_PAYMENT' || status === 'PAYMENT_FAILED') {
    auditFailure('PAYMENT_NOT_COMPLETED', resolution.via);
    return { ok: false, httpStatus: 402, result: buildFailure('PAYMENT_NOT_COMPLETED', booking, isOwner) };
  }

  // Step 10: token validity (revoked by regeneration/cancellation).
  if (booking.qrRevokedAt) {
    auditFailure('TOKEN_REVOKED', resolution.via);
    return { ok: false, httpStatus: 410, result: buildFailure('TOKEN_REVOKED', booking, isOwner) };
  }

  // Step 7: payment.
  if (booking.paymentStatus !== 'PAID') {
    auditFailure('PAYMENT_NOT_COMPLETED', resolution.via);
    return { ok: false, httpStatus: 402, result: buildFailure('PAYMENT_NOT_COMPLETED', booking, isOwner) };
  }

  // Step 9: parking ownership â€” CRITICAL (owner A must not verify owner B).
  if (!isOwner) {
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: 'WRONG_OWNER',
      result: 'failure',
      reason: lotOwnerId ? 'WRONG_PARKING_OWNER' : 'WRONG_PARKING_OWNER_UNOWNED',
      detail: resolution.via,
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return { ok: false, httpStatus: 403, result: buildFailure('WRONG_PARKING_OWNER', undefined, false) };
  }

  // Step 8: time window (server clock only).
  if (isBookingExpired(booking, now)) {
    await expireIfDue(booking, now);
    auditFailure('BOOKING_EXPIRED', resolution.via);
    return { ok: false, httpStatus: 410, result: buildFailure('BOOKING_EXPIRED', booking, true) };
  }
  if (now.getTime() < checkInWindowStart(booking).getTime()) {
    auditFailure('INVALID_TIME', `too_early:${checkInWindowStart(booking).toISOString()}`);
    return { ok: false, httpStatus: 409, result: buildFailure('INVALID_TIME', booking, true) };
  }

  // Step 11/12: success â€” duplicate check-in is reported by check-in itself.
  recordAudit({
    bookingId: booking.id,
    ownerId: actor.id,
    parkingLocationId: booking.lotId,
    action: 'BOOKING_VERIFIED',
    result: 'success',
    reason: 'OK',
    detail: resolution.via,
    ...(input.ip ? { ip: input.ip } : {}),
  });

  return { ok: true, result: buildSuccess(booking, true), booking };
}

// â”€â”€ Check-in (atomic, spec Â§19 + Â§47) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CheckInOutInput {
  actor: Actor;
  bookingId: string;
  ip?: string;
  now?: Date;
}

function gateLimit(actor: Actor): RateLimitDecisionish {
  return gateActionLimiter.check(actor.id);
}

interface RateLimitDecisionish {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function checkInVehicle(input: CheckInOutInput): Promise<GateResult<{ checkInTime: string }>> {
  const { actor } = input;
  const now = input.now ?? new Date();
  const booking = getBookingById(input.bookingId);

  if (!booking) return fail(404, 'NOT_FOUND', failureMessage('NOT_FOUND'));
  if (!gateLimit(actor).allowed) return fail(429, 'RATE_LIMITED', failureMessage('RATE_LIMITED'), booking);

  const lotOwnerId = getLotOwner(booking.lotId);
  if (!lotOwnerId || lotOwnerId !== actor.id) {
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: 'WRONG_OWNER',
      result: 'failure',
      reason: 'WRONG_PARKING_OWNER',
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return fail(403, 'WRONG_PARKING_OWNER', failureMessage('WRONG_PARKING_OWNER'), booking);
  }

  const outcome = await mutateBooking(booking.id, (b) => {
    // Re-validate inside the lock â€” the world may have changed while waiting.
    if (b.bookingStatus === 'CHECKED_IN') return { conflict: 'ALREADY_CHECKED_IN' as const };
    if (b.bookingStatus === 'CHECKED_OUT' || b.bookingStatus === 'COMPLETED') {
      return { conflict: 'ALREADY_COMPLETED' as const };
    }
    if (b.bookingStatus === 'CANCELLED' || b.bookingStatus === 'CANCELLED_BY_OWNER') {
      return { conflict: 'BOOKING_CANCELLED' as const };
    }
    if (b.bookingStatus === 'REJECTED') return { conflict: 'BOOKING_REJECTED' as const };
    if (b.bookingStatus === 'EXPIRED') return { conflict: 'BOOKING_EXPIRED' as const };
    if (b.paymentStatus !== 'PAID') return { conflict: 'PAYMENT_NOT_COMPLETED' as const };
    if (!CHECK_IN_ELIGIBLE_STATUSES.includes(b.bookingStatus)) {
      return { conflict: 'INVALID_TIME' as const };
    }
    if (isBookingExpired(b, now)) return { conflict: 'BOOKING_EXPIRED' as const };
    if (now.getTime() < checkInWindowStart(b).getTime()) return { conflict: 'INVALID_TIME' as const };

    const checkInTime = now.toISOString();
    applyTransition(b, 'CHECKED_IN', {
      checkInTime,
      verifiedByOwnerId: actor.id,
      verificationTime: checkInTime,
    });
    return { conflict: null, checkInTime };
  });

  if (outcome.ok === false) {
    return fail(500, 'SERVER_ERROR', failureMessage('SERVER_ERROR'), booking);
  }

  const { conflict, checkInTime } = outcome.result;
  if (conflict) {
    const httpStatus = conflict === 'PAYMENT_NOT_COMPLETED' ? 402 : 409;
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: 'CHECK_IN_REJECTED',
      result: 'failure',
      reason: conflict,
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return fail(httpStatus, conflict, failureMessage(conflict), outcome.booking);
  }

  recordAudit({
    bookingId: booking.id,
    ownerId: actor.id,
    parkingLocationId: booking.lotId,
    action: 'CHECK_IN_APPROVED',
    result: 'success',
    reason: 'OK',
    ...(input.ip ? { ip: input.ip } : {}),
  });

  createNotification({
    userId: outcome.booking.userId,
    type: 'CHECK_IN',
    title: 'Parking Check-In Successful',
    body: `Your vehicle ${outcome.booking.vehicleNumber} has been checked into Spot ${outcome.booking.stallCode}. Check-in time: ${new Date(
      checkInTime!
    ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    bookingId: outcome.booking.id,
  });

  return { ok: true, booking: outcome.booking, value: { checkInTime: checkInTime! } };
}

// â”€â”€ Check-out (spec Â§21) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function checkOutVehicle(input: CheckInOutInput): Promise<GateResult<{ checkOutTime: string; durationMinutes: number }>> {
  const { actor } = input;
  const now = input.now ?? new Date();
  const booking = getBookingById(input.bookingId);

  if (!booking) return fail(404, 'NOT_FOUND', failureMessage('NOT_FOUND'));
  if (!gateLimit(actor).allowed) return fail(429, 'RATE_LIMITED', failureMessage('RATE_LIMITED'), booking);

  const lotOwnerId = getLotOwner(booking.lotId);
  if (!lotOwnerId || lotOwnerId !== actor.id) {
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: 'WRONG_OWNER',
      result: 'failure',
      reason: 'WRONG_PARKING_OWNER',
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return fail(403, 'WRONG_PARKING_OWNER', failureMessage('WRONG_PARKING_OWNER'), booking);
  }

  const outcome = await mutateBooking(booking.id, (b) => {
    if (b.bookingStatus === 'CHECKED_OUT' || b.bookingStatus === 'COMPLETED') {
      return { conflict: 'ALREADY_COMPLETED' as const };
    }
    if (!CHECK_OUT_ELIGIBLE_STATUSES.includes(b.bookingStatus)) {
      return { conflict: 'INVALID_TIME' as const };
    }
    const checkOutTime = now.toISOString();
    applyTransition(b, 'CHECKED_OUT', { checkOutTime, checkedOutBy: actor.id });
    // CHECKED_OUT â†’ COMPLETED is the final step of a successful session.
    applyTransition(b, 'COMPLETED');
    return { conflict: null, checkOutTime };
  });

  if (outcome.ok === false) {
    return fail(500, 'SERVER_ERROR', failureMessage('SERVER_ERROR'), booking);
  }

  const { conflict, checkOutTime } = outcome.result;
  if (conflict) {
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: 'CHECK_OUT',
      result: 'failure',
      reason: conflict,
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return fail(409, conflict, failureMessage(conflict), outcome.booking);
  }

  const start = new Date(outcome.booking.checkInTime ?? outcome.booking.startTime).getTime();
  const durationMinutes = Math.max(0, Math.round((now.getTime() - start) / 60_000));

  recordAudit({
    bookingId: outcome.booking.id,
    ownerId: actor.id,
    parkingLocationId: outcome.booking.lotId,
    action: 'CHECK_OUT',
    result: 'success',
    reason: 'OK',
    ...(input.ip ? { ip: input.ip } : {}),
  });

  createNotification({
    userId: outcome.booking.userId,
    type: 'CHECK_OUT',
    title: 'Parking Session Completed',
    body: `Vehicle: ${outcome.booking.vehicleNumber} â€” Duration: ${formatDurationMinutes(durationMinutes)}. Spot ${outcome.booking.stallCode} is now free.`,
    bookingId: outcome.booking.id,
  });

  return { ok: true, booking: outcome.booking, value: { checkOutTime: checkOutTime!, durationMinutes } };
}

// â”€â”€ Reject entry (owner refuses the vehicle) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function rejectEntry(input: CheckInOutInput & { reason?: string }): Promise<GateResult> {
  const { actor } = input;
  const now = input.now ?? new Date();
  const booking = getBookingById(input.bookingId);

  if (!booking) return fail(404, 'NOT_FOUND', failureMessage('NOT_FOUND'));
  if (!gateLimit(actor).allowed) return fail(429, 'RATE_LIMITED', failureMessage('RATE_LIMITED'), booking);

  const lotOwnerId = getLotOwner(booking.lotId);
  if (!lotOwnerId || lotOwnerId !== actor.id) {
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: 'WRONG_OWNER',
      result: 'failure',
      reason: 'WRONG_PARKING_OWNER',
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return fail(403, 'WRONG_PARKING_OWNER', failureMessage('WRONG_PARKING_OWNER'), booking);
  }

  const outcome = await mutateBooking(booking.id, (b) => {
    if (b.bookingStatus === 'REJECTED') return { conflict: 'BOOKING_REJECTED' as const };
    if (b.bookingStatus !== 'CONFIRMED' && b.bookingStatus !== 'ACTIVE') {
      return { conflict: 'ALREADY_COMPLETED' as const };
    }
    applyTransition(b, 'REJECTED', {
      cancelledAt: now.toISOString(),
      qrRevokedAt: b.qrRevokedAt ?? now.toISOString(),
      verifiedByOwnerId: actor.id,
      verificationTime: now.toISOString(),
    });
    return { conflict: null };
  });

  if (outcome.ok === false) return fail(500, 'SERVER_ERROR', failureMessage('SERVER_ERROR'), booking);

  if (outcome.result.conflict) {
    recordAudit({
      bookingId: booking.id,
      ownerId: actor.id,
      parkingLocationId: booking.lotId,
      action: 'CHECK_IN_REJECTED',
      result: 'failure',
      reason: outcome.result.conflict,
      ...(input.ip ? { ip: input.ip } : {}),
    });
    return fail(409, outcome.result.conflict, failureMessage(outcome.result.conflict), outcome.booking);
  }

  recordAudit({
    bookingId: booking.id,
    ownerId: actor.id,
    parkingLocationId: booking.lotId,
    action: 'CHECK_IN_REJECTED',
    result: 'success',
    reason: 'REJECTED_BY_OWNER',
    ...(input.reason ? { detail: input.reason } : {}),
    ...(input.ip ? { ip: input.ip } : {}),
  });

  createNotification({
    userId: outcome.booking.userId,
    type: 'BOOKING',
    title: 'Entry Rejected at the Gate',
    body: `Your vehicle ${outcome.booking.vehicleNumber} was not allowed entry for booking ${outcome.booking.id}. Please contact the parking operator.`,
    bookingId: outcome.booking.id,
  });

  return { ok: true, booking: outcome.booking, value: undefined };
}
