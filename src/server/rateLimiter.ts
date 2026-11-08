/**
 * Per-key sliding-window rate limiter used to protect the verification
 * endpoints from brute-force / replay abuse (spec §22).
 *
 * Keyed by the authenticated owner (not just the IP), so one noisy gate
 * device cannot exhaust another owner's budget. Default budget:
 * 20 verification requests/minute/owner (spec suggests 10–30).
 */

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  /** Guard against unbounded memory growth from many distinct keys. */
  maxKeys?: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, limit, maxKeys = 5000 } = options;
  const hits = new Map<string, number[]>();

  function prune(key: string, now: number): number[] {
    const list = (hits.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  }

  return {
    check(key: string): RateLimitDecision {
      const now = Date.now();
      if (!key) {
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(windowMs / 1000) };
      }
      const list = prune(key, now);

      if (list.length >= limit) {
        const oldest = list[0];
        const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      list.push(now);
      hits.set(key, list);
      if (hits.size > maxKeys) {
        // Drop the oldest key (Map preserves insertion order).
        const first = hits.keys().next().value;
        if (first !== undefined && first !== key) hits.delete(first);
      }
      return { allowed: true, remaining: Math.max(0, limit - list.length), retryAfterSeconds: 0 };
    },
    reset(key?: string): void {
      if (key) hits.delete(key);
      else hits.clear();
    },
    size(): number {
      return hits.size;
    },
  };
}

/** Verification attempts: 20 / minute / owner. */
export const verificationLimiter = createRateLimiter({ windowMs: 60_000, limit: 20 });

/** Check-in / check-out gate actions: 30 / minute / owner. */
export const gateActionLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

/** QR regeneration & cancellation: 10 / 5 minutes / user. */
export const qrMutationLimiter = createRateLimiter({ windowMs: 5 * 60_000, limit: 10 });
