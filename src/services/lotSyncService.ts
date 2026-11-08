import { ParkingLot } from '../types';
// MUST go through apiFetch rather than a bare fetch(): apiFetch attaches the
// X-ParkSmart-Actor identity header (src/lib/actor) that the server requires in
// demo identity mode. A bare fetch() omitted it, so /lots/sync answered 401,
// the server's lot store stayed permanently empty, and every subsequent booking
// then failed with 404 "Parking lot not found". Using the same helper as the
// booking call keeps the two requests on one identity path by construction.
import { apiFetch } from './verificationService';

interface LotSyncResponse {
  upserted?: number;
  rejected?: number;
  total?: number;
}

export interface LotSyncResult {
  upserted: number;
  /** Lots the server refused (bad shape or not bookable) — was silently dropped. */
  rejected: number;
  total: number;
  /** Why the sync did not reach the server, if it did not. */
  error?: string;
}

/**
 * Upserts the client's bookable (Google-discovered) lots into the server store
 * so /api/parking/book can reserve real stalls server-side. Failures are
 * reported (not thrown) so callers can surface them; the booking flow
 * additionally re-syncs and retries on a 404.
 */
export async function syncParkingLots(lots: ParkingLot[]): Promise<LotSyncResult> {
  const bookable = lots.filter((l) => l.isBookable).slice(0, 200);
  if (bookable.length === 0) return { upserted: 0, rejected: 0, total: 0 };

  const res = await apiFetch<LotSyncResponse>('/api/parking/lots/sync', {
    method: 'POST',
    body: { lots: bookable },
  });

  if (res.ok === false) {
    // Previously swallowed entirely. A failed sync means /api/parking/book
    // will 404 with "Parking lot not found" for every lot, so say why.
    const error = `Lot sync failed (${res.error.status} ${res.error.code}): ${res.error.message}`;
    console.error(`[lotSync] ${error}`);
    return { upserted: 0, rejected: 0, total: 0, error };
  }

  const data = res.data ?? {};
  const upserted = typeof data.upserted === 'number' ? data.upserted : 0;
  const rejected = typeof data.rejected === 'number' ? data.rejected : 0;
  const total = typeof data.total === 'number' ? data.total : bookable.length;

  if (upserted === 0 && bookable.length > 0) {
    console.error(
      `[lotSync] synced 0 of ${bookable.length} lots — every booking will fail with ` +
        '"Parking lot not found" until this succeeds',
    );
  }
  if (rejected > 0) {
    console.error(
      `[lotSync] server dropped ${rejected}/${bookable.length} lots during validation; ` +
        'those lots will fail to book with "Parking lot not found"',
    );
  }
  return { upserted, rejected, total };
}
