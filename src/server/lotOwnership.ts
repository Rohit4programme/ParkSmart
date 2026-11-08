/**
 * Parking-location ownership registry.
 *
 * A booking can only be verified by the owner of the parking location it was
 * made at (spec §14 step 9 — CRITICAL). Ownership is claimed explicitly by an
 * authenticated actor and persisted, so:
 *  - a driver who merely syncs discovered lots never becomes an owner,
 *  - owner A can never verify/check-in a booking belonging to owner B,
 *  - unclaimed locations have no owner and therefore nobody can check in.
 */
import { readJsonFile, writeJsonFile } from './storage';

const STORE_FILE = 'lot-owners.json';

export interface LotOwnership {
  lotId: string;
  ownerId: string;
  lotName: string;
  claimedAt: string;
  updatedAt: string;
}

const ownershipByLot = new Map<string, LotOwnership>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const rows = readJsonFile<LotOwnership[]>(STORE_FILE, []);
  for (const row of rows) {
    if (row && typeof row.lotId === 'string' && typeof row.ownerId === 'string') {
      ownershipByLot.set(row.lotId, row);
    }
  }
}

function persist(): void {
  writeJsonFile(STORE_FILE, Array.from(ownershipByLot.values()));
}

export function isValidLotId(lotId: unknown): lotId is string {
  return typeof lotId === 'string' && lotId.trim().length > 0 && lotId.length <= 64;
}

export function getLotOwner(lotId: string): string | null {
  ensureLoaded();
  return ownershipByLot.get(lotId)?.ownerId ?? null;
}

export function getOwnership(lotId: string): LotOwnership | null {
  ensureLoaded();
  return ownershipByLot.get(lotId) ?? null;
}

export function getOwnedLotIds(ownerId: string): string[] {
  ensureLoaded();
  return Array.from(ownershipByLot.values())
    .filter((entry) => entry.ownerId === ownerId)
    .map((entry) => entry.lotId);
}

export function getOwnedLots(ownerId: string): LotOwnership[] {
  ensureLoaded();
  return Array.from(ownershipByLot.values())
    .filter((entry) => entry.ownerId === ownerId)
    .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt));
}

export type ClaimLotResult =
  | { ok: true; ownership: LotOwnership; alreadyOwned: boolean }
  | { ok: false; reason: 'INVALID_LOT' | 'FORBIDDEN' };

/** Claim (or re-confirm) ownership of a parking location. */
export function claimLot(
  lotId: string,
  ownerId: string,
  lotName = ''
): ClaimLotResult {
  ensureLoaded();
  if (!isValidLotId(lotId) || !ownerId) return { ok: false, reason: 'INVALID_LOT' };

  const existing = ownershipByLot.get(lotId);
  if (existing && existing.ownerId !== ownerId) {
    return { ok: false, reason: 'FORBIDDEN' };
  }

  const now = new Date().toISOString();
  const ownership: LotOwnership = existing
    ? { ...existing, lotName: lotName || existing.lotName, updatedAt: now }
    : { lotId, ownerId, lotName, claimedAt: now, updatedAt: now };

  ownershipByLot.set(lotId, ownership);
  persist();
  return { ok: true, ownership, alreadyOwned: Boolean(existing) };
}

/** Test helper: clear in-memory ownership (does not touch disk). */
export function resetLotOwnership(): void {
  ensureLoaded();
  ownershipByLot.clear();
}
