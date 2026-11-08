/**
 * QR verification / gate API routes.
 *
 * Every route below requires an authenticated actor (`requireActor`) and
 * derives owner identity from the session â€” request bodies can never supply
 * an ownerId, paymentStatus, bookingStatus or vehicle number that the server
 * accepts as authority (spec Â§13, Â§19, Â§40).
 */
import type { Express, Request, Response } from 'express';
import { Actor, VerificationResult } from '../types';
import { requireActor } from './actor';
import {
  BookingNotFoundError,
  StoredBooking,
  applyTransition,
  expireIfDue,
  getBookingById,
  listBookingsByLots,
  listBookingsByUser,
  mutateBooking,
  revokeQr,
  rotateQrCredentials,
  toClientBooking,
} from './bookingStore';
import { claimLot, getOwnedLotIds, isValidLotId } from './lotOwnership';
import { listAudit, recordAudit } from './auditLog';
import { listNotifications, markAllRead, unreadCount } from './notifications';
import { qrMutationLimiter } from './rateLimiter';
import {
  checkInVehicle,
  checkOutVehicle,
  rejectEntry,
  verifyBookingForOwner,
} from './verification';
import {
  InvalidTransitionError,
  VERIFIABLE_STATUSES,
  deriveQrPassStatus,
  describeQrPassStatus,
} from './bookingLifecycle';
import { minutesBetween } from '../utils/duration';

export interface VerificationRouteOptions {
  /** Called when a driver cancels so the server can release the stall. */
  onBookingCancelled?: (booking: StoredBooking) => void;
  /** Called after a lot is successfully claimed by an owner. */
  onLotClaimed?: (lotId: string, ownerId: string) => void;
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function actorOf(req: Request): Actor {
  return req.actor as Actor;
}

function bodyString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function sendGateError(res: Response, error: { httpStatus: number; reason: string; message: string }): void {
  res.status(error.httpStatus).json({
    success: false,
    error: error.message,
    code: error.reason,
    result: { valid: false, status: 'INVALID', reason: error.reason, message: error.message, canCheckIn: false },
  });
}

function bookingResponse(res: Response, booking: StoredBooking, extra: Record<string, unknown> = {}, includeVerifyCode = false): void {
  res.json({
    success: true,
    booking: toClientBooking(booking, { includeVerifyCode }),
    ...extra,
  });
}

function sendInvalidTransition(res: Response, err: InvalidTransitionError): void {
  res.status(409).json({
    success: false,
    error: `This booking cannot move from ${err.from} to ${err.to}.`,
    code: 'INVALID_TRANSITION',
  });
}

function isDriver(actor: Actor, booking: StoredBooking): boolean {
  return Boolean(booking.userId) && booking.userId === actor.id;
}

function parseDateParam(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function registerVerificationRoutes(app: Express, options: VerificationRouteOptions = {}): void {
  // â•â• POST /api/bookings/verify â€” owner scans a QR (spec Â§13â€“Â§16) â•â•â•â•â•â•â•â•â•â•
  app.post('/api/bookings/verify', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const token = bodyString(body.token, 256);
      const code = bodyString(body.code, 32);

      if (!token && !code) {
        return res.status(400).json({
          success: false,
          error: 'Provide a QR token or a verification code.',
          code: 'QR_INVALID',
        });
      }

      const outcome = await verifyBookingForOwner({
        actor,
        token: token || null,
        code: code || null,
        ip: req.actorIp,
      });

      if (outcome.ok === false) {
        return res.status(outcome.httpStatus).json({
          success: false,
          error: outcome.result.message,
          code: outcome.result.reason,
          result: outcome.result satisfies VerificationResult,
        });
      }

      return res.json({ success: true, result: outcome.result });
    } catch (err) {
      console.error('[verify] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred', code: 'SERVER_ERROR' });
    }
  });

  // â•â• POST /api/bookings/check-in â€” atomic CHECKED_IN (spec Â§19, Â§47) â•â•â•â•â•â•
  app.post('/api/bookings/check-in', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const bookingId = bodyString((req.body ?? {}).bookingId, 40);
      if (!bookingId) {
        return res.status(400).json({ success: false, error: 'bookingId is required.', code: 'NOT_FOUND' });
      }
      const outcome = await checkInVehicle({ actor, bookingId, ip: req.actorIp });
      if (outcome.ok === false) return sendGateError(res, outcome.error);
      return bookingResponse(res, outcome.booking, { checkInTime: outcome.value.checkInTime });
    } catch (err) {
      console.error('[check-in] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred', code: 'SERVER_ERROR' });
    }
  });

  // â•â• POST /api/bookings/check-out (spec Â§21) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.post('/api/bookings/check-out', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const bookingId = bodyString((req.body ?? {}).bookingId, 40);
      if (!bookingId) {
        return res.status(400).json({ success: false, error: 'bookingId is required.', code: 'NOT_FOUND' });
      }
      const outcome = await checkOutVehicle({ actor, bookingId, ip: req.actorIp });
      if (outcome.ok === false) return sendGateError(res, outcome.error);
      return bookingResponse(res, outcome.booking, {
        checkOutTime: outcome.value.checkOutTime,
        durationMinutes: outcome.value.durationMinutes,
      });
    } catch (err) {
      console.error('[check-out] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred', code: 'SERVER_ERROR' });
    }
  });

  // â•â• POST /api/bookings/reject â€” owner refuses entry â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.post('/api/bookings/reject', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const bookingId = bodyString(body.bookingId, 40);
      if (!bookingId) {
        return res.status(400).json({ success: false, error: 'bookingId is required.', code: 'NOT_FOUND' });
      }
      const outcome = await rejectEntry({
        actor,
        bookingId,
        ip: req.actorIp,
        reason: bodyString(body.reason, 120),
      });
      if (outcome.ok === false) return sendGateError(res, outcome.error);
      return bookingResponse(res, outcome.booking, { rejected: true });
    } catch (err) {
      console.error('[reject] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred', code: 'SERVER_ERROR' });
    }
  });

  // â•â• GET /api/bookings â€” the driver's own bookings â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.get('/api/bookings', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const bookings = listBookingsByUser(actor.id);
      // Lazily expire bookings whose window has elapsed (server clock).
      await Promise.all(bookings.map((b) => expireIfDue(b)));
      res.json({
        success: true,
        bookings: bookings.map((b) => toClientBooking(b, { includeVerifyCode: true })),
      });
    } catch (err) {
      console.error('[bookings] Unexpected error:', err);
      res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• GET /api/bookings/:id â€” booking details (driver or owning gate) â•â•â•â•â•â•â•
  app.get('/api/bookings/:id', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const booking = getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.', code: 'NOT_FOUND' });

      const driver = isDriver(actor, booking);
      const owner = getOwnedLotIds(actor.id).includes(booking.lotId);
      if (!driver && !owner) {
        return res.status(403).json({ success: false, error: 'You do not have access to this booking.', code: 'FORBIDDEN' });
      }

      await expireIfDue(booking);
      return bookingResponse(res, booking, {}, driver);
    } catch (err) {
      console.error('[booking] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• GET /api/bookings/:id/qr â€” ticket payload for the QR screen â•â•â•â•â•â•â•â•â•â•â•
  app.get('/api/bookings/:id/qr', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const booking = getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.', code: 'NOT_FOUND' });
      if (!isDriver(actor, booking)) {
        return res.status(403).json({ success: false, error: 'Only the booking owner can view this pass.', code: 'FORBIDDEN' });
      }

      await expireIfDue(booking);
      const status = describeQrPassStatus(deriveQrPassStatus(booking));
      res.json({
        success: true,
        bookingId: booking.id,
        qrStatus: status,
        verifyCode: booking.verifyCode,
        qrCreatedAt: booking.qrCreatedAt,
        qrExpiresAt: booking.qrExpiresAt,
        qrRevokedAt: booking.qrRevokedAt,
        canRegenerate: VERIFIABLE_STATUSES.includes(booking.bookingStatus),
        note: 'The raw QR token is returned only when a QR is generated or regenerated.',
      });
    } catch (err) {
      console.error('[qr] Unexpected error:', err);
      res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• POST /api/bookings/:id/regenerate-qr (spec Â§28) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.post('/api/bookings/:id/regenerate-qr', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const booking = getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.', code: 'NOT_FOUND' });
      if (!isDriver(actor, booking)) {
        return res.status(403).json({ success: false, error: 'Only the booking owner can regenerate this pass.', code: 'FORBIDDEN' });
      }

      const limit = qrMutationLimiter.check(actor.id);
      if (!limit.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Too many QR requests. Please wait a few minutes.',
          code: 'RATE_LIMITED',
          retryAfterSeconds: limit.retryAfterSeconds,
        });
      }

      await expireIfDue(booking);
      if (!VERIFIABLE_STATUSES.includes(booking.bookingStatus)) {
        return res.status(409).json({
          success: false,
          error: `A new QR cannot be generated for a ${booking.bookingStatus} booking.`,
          code: 'INVALID_TRANSITION',
        });
      }

      const rotated = await rotateQrCredentials(booking.id, { revokePrevious: true });
      if (rotated.ok === false) throw rotated.error;

      recordAudit({
        bookingId: booking.id,
        ownerId: actor.id,
        parkingLocationId: booking.lotId,
        action: 'QR_REGENERATED',
        result: 'success',
        reason: 'OK',
        ...(req.actorIp ? { ip: req.actorIp } : {}),
      });

      return res.json({
        success: true,
        token: rotated.credentials.token,
        verifyUrl: rotated.credentials.verifyUrl,
        verifyCode: rotated.credentials.verifyCode,
        booking: toClientBooking(booking, { includeVerifyCode: true }),
      });
    } catch (err) {
      console.error('[regenerate-qr] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• POST /api/bookings/:id/cancel (spec Â§29) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.post('/api/bookings/:id/cancel', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const booking = getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: 'Booking not found.', code: 'NOT_FOUND' });
      if (!isDriver(actor, booking)) {
        return res.status(403).json({ success: false, error: 'Only the booking owner can cancel this booking.', code: 'FORBIDDEN' });
      }

      const outcome = await mutateBooking(booking.id, (b) => {
        if (b.bookingStatus === 'CANCELLED') return { alreadyCancelled: true };
        applyTransition(b, 'CANCELLED', { cancelledAt: new Date().toISOString() });
        revokeQr(b);
        return { alreadyCancelled: false };
      });

      if (outcome.ok === false) {
        if (outcome.error instanceof InvalidTransitionError) return sendInvalidTransition(res, outcome.error);
        throw outcome.error;
      }

      recordAudit({
        bookingId: booking.id,
        ownerId: actor.id,
        parkingLocationId: booking.lotId,
        action: 'BOOKING_CANCELLED',
        result: 'success',
        reason: 'DRIVER_CANCELLED',
        ...(req.actorIp ? { ip: req.actorIp } : {}),
      });

      if (!outcome.result.alreadyCancelled) options.onBookingCancelled?.(outcome.booking);

      return bookingResponse(res, outcome.booking, { cancelled: true });
    } catch (err) {
      console.error('[cancel] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• POST /api/owner/lots/claim â€” register as the owner of a facility â•â•â•â•â•
  app.post('/api/owner/lots/claim', requireActor, (req, res) => {
    try {
      const actor = actorOf(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const lotId = bodyString(body.lotId, 64);
      const lotName = bodyString(body.lotName, 120);
      if (!isValidLotId(lotId)) {
        return res.status(400).json({ success: false, error: 'A valid lotId is required.', code: 'INVALID_INPUT' });
      }

      const result = claimLot(lotId, actor.id, lotName);
      if (result.ok === false) {
        return res.status(403).json({
          success: false,
          error: 'This parking location is already registered to another owner.',
          code: 'FORBIDDEN',
        });
      }

      if (!result.alreadyOwned) {
        recordAudit({
          bookingId: null,
          ownerId: actor.id,
          parkingLocationId: lotId,
          action: 'LOT_CLAIMED',
          result: 'success',
          reason: 'OK',
          ...(req.actorIp ? { ip: req.actorIp } : {}),
        });
        options.onLotClaimed?.(lotId, actor.id);
      }

      return res.json({ success: true, ownership: result.ownership, alreadyOwned: result.alreadyOwned });
    } catch (err) {
      console.error('[claim] Unexpected error:', err);
      return res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• GET /api/owner/lots â€” facilities owned by this actor â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.get('/api/owner/lots', requireActor, (req, res) => {
    const actor = actorOf(req);
    res.json({ success: true, lotIds: getOwnedLotIds(actor.id) });
  });

  // â•â• GET /api/owner/summary â€” dashboard counters (spec Â§43) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.get('/api/owner/summary', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const lotIds = getOwnedLotIds(actor.id);
      const owned = listBookingsByLots(new Set(lotIds));
      await Promise.all(owned.map((b) => expireIfDue(b)));

      let checkedIn = 0;
      let awaitingEntry = 0;
      for (const booking of owned) {
        if (booking.bookingStatus === 'CHECKED_IN') checkedIn += 1;
        else if (booking.bookingStatus === 'CONFIRMED' || booking.bookingStatus === 'ACTIVE') awaitingEntry += 1;
      }

      res.json({
        success: true,
        summary: {
          ownedLotIds: lotIds,
          activeBookings: checkedIn + awaitingEntry,
          checkedIn,
          awaitingEntry,
        },
      });
    } catch (err) {
      console.error('[owner/summary] Unexpected error:', err);
      res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• GET /api/owner/active-parking-sessions (spec Â§21, Â§32) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.get('/api/owner/active-parking-sessions', requireActor, async (req, res) => {
    try {
      const actor = actorOf(req);
      const lotIds = getOwnedLotIds(actor.id);
      const owned = listBookingsByLots(new Set(lotIds));
      await Promise.all(owned.map((b) => expireIfDue(b)));

      const now = new Date();
      const sessions = owned
        .filter((b) => b.bookingStatus === 'CHECKED_IN')
        .map((b) => ({
          bookingId: b.id,
          vehicleNumber: b.vehicleNumber,
          vehicleModel: b.vehicle.makeModel,
          parkingSpot: b.stallCode,
          floorName: b.floorName,
          parkingName: b.lotName,
          parkingLocationId: b.lotId,
          checkInTime: b.checkInTime ?? b.startTime,
          ...(b.checkOutTime ? { checkOutTime: b.checkOutTime } : {}),
          durationMinutes: minutesBetween(b.checkInTime ?? b.startTime, now),
          bookingStatus: b.bookingStatus,
        }));

      res.json({ success: true, sessions });
    } catch (err) {
      console.error('[owner/sessions] Unexpected error:', err);
      res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• GET /api/owner/verifications â€” audit history (spec Â§24) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.get('/api/owner/verifications', requireActor, (req, res) => {
    try {
      const actor = actorOf(req);
      const lotIds = new Set(getOwnedLotIds(actor.id));
      const from = parseDateParam(req.query.from);
      const to = parseDateParam(req.query.to);
      const limitRaw = Number.parseInt(String(req.query.limit ?? ''), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

      const entries = listAudit({
        actorId: actor.id,
        lotIds,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        limit,
      });

      res.json({ success: true, verifications: entries });
    } catch (err) {
      console.error('[owner/verifications] Unexpected error:', err);
      res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
  });

  // â•â• GET /api/notifications â€” driver inbox (spec Â§39) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  app.get('/api/notifications', requireActor, (req, res) => {
    const actor = actorOf(req);
    res.json({
      success: true,
      notifications: listNotifications(actor.id),
      unread: unreadCount(actor.id),
    });
  });

  app.post('/api/notifications/read', requireActor, (req, res) => {
    const actor = actorOf(req);
    const changed = markAllRead(actor.id);
    res.json({ success: true, changed, unread: unreadCount(actor.id) });
  });
}

export { BookingNotFoundError };
