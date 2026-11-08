/**
 * Verification audit log (spec §23).
 *
 * Every scan / verification / check-in / check-out / rejection attempt is
 * recorded with the acting owner, the booking, the parking location, the
 * result and a structured reason. Raw QR tokens are NEVER written here.
 */
import { randomUUID } from 'node:crypto';
import { VerificationAction, VerificationAuditEntry } from '../types';
import { readJsonFile, writeJsonFile } from './storage';

const STORE_FILE = 'verifications.json';
/** Bounded log: oldest entries are dropped once the cap is reached. */
const MAX_ENTRIES = 5000;

let entries: VerificationAuditEntry[] | null = null;

function ensureLoaded(): VerificationAuditEntry[] {
  if (entries) return entries;
  const rows = readJsonFile<VerificationAuditEntry[]>(STORE_FILE, []);
  entries = Array.isArray(rows) ? rows : [];
  return entries;
}

function persist(): void {
  writeJsonFile(STORE_FILE, ensureLoaded());
}

export interface AuditInput {
  bookingId: string | null;
  ownerId: string;
  parkingLocationId: string | null;
  action: VerificationAction;
  result: 'success' | 'failure';
  reason: string;
  detail?: string;
  ip?: string;
}

export function recordAudit(input: AuditInput): VerificationAuditEntry {
  const list = ensureLoaded();
  const entry: VerificationAuditEntry = {
    id: randomUUID(),
    bookingId: input.bookingId,
    ownerId: input.ownerId,
    parkingLocationId: input.parkingLocationId,
    action: input.action,
    result: input.result,
    reason: input.reason,
    ...(input.detail ? { detail: input.detail } : {}),
    timestamp: new Date().toISOString(),
    ...(input.ip ? { ip: input.ip } : {}),
  };
  list.push(entry);
  if (list.length > MAX_ENTRIES) {
    list.splice(0, list.length - MAX_ENTRIES);
  }
  try {
    persist();
  } catch (err) {
    // Auditing must never break the gate operation itself.
    console.error('[audit] Failed to persist audit entry:', err);
  }
  return entry;
}

export interface AuditQuery {
  /** Acting owner: entries they performed … */
  actorId?: string;
  /** … or entries concerning parking locations they own. */
  lotIds?: Set<string>;
  from?: Date;
  to?: Date;
  limit?: number;
}

export function listAudit(query: AuditQuery = {}): VerificationAuditEntry[] {
  const list = ensureLoaded();
  const limit = Math.min(Math.max(query.limit ?? 200, 1), MAX_ENTRIES);

  const filtered = list.filter((entry) => {
    const matchesActor = Boolean(query.actorId) && entry.ownerId === query.actorId;
    const matchesLot =
      Boolean(query.lotIds) &&
      Boolean(entry.parkingLocationId) &&
      (query.lotIds as Set<string>).has(entry.parkingLocationId as string);

    if (query.actorId && query.lotIds) {
      if (!matchesActor && !matchesLot) return false;
    } else if (query.actorId) {
      if (!matchesActor) return false;
    } else if (query.lotIds) {
      if (!matchesLot) return false;
    }

    if (query.from && new Date(entry.timestamp) < query.from) return false;
    if (query.to && new Date(entry.timestamp) > query.to) return false;
    return true;
  });

  return filtered.slice(-limit).reverse();
}

/** Test helper: clear in-memory audit entries (does not touch disk). */
export function resetAuditLog(): void {
  entries = [];
}
