// ---------------------------------------------------------------------------
// Server-side intent accumulator (CIRUGÍA: cobro dentro del pipeline servido).
//
// The old design charged from a separate /api/credits/deduct endpoint that the
// CLIENT had to call at intent close. It didn't reliably call it, and the
// design was insecure by construction: not calling = not paying. This module
// moves accounting to the server: every /api/chat-forge request that carries an
// `x-forge-intent-id` header accumulates its input/output tokens against that
// intent. The charge then happens SERVER-SIDE, with no client cooperation
// required, driven by:
//
//   - an idle sweep: an intent that receives no request for `idleCloseMs`
//     (default 120s) is considered closed and its accumulated work is charged;
//   - a TTL backstop: any intent older than `ttlMs` (default 15 min) is closed
//     and charged regardless, so the map can never grow without bound.
//
// An explicit close (see /api/credits/close) is only an accelerator so the UI
// balance refreshes promptly; it is NOT required for correctness — the sweep
// guarantees the charge even if the client never closes.
//
// This module is PURE state + policy: it holds no DB handle and performs no
// charge itself. The caller (server.js) passes the wall clock in as `now` and
// runs the actual `deduct_credits` RPC on the records this module hands back.
// That keeps it unit-testable with `node --test` and no live Postgres, and it
// keeps the "when to charge" policy (correlation, TTL, double-close) in one
// place that the tests pin down.
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 15 * 60 * 1000; // hard lifetime cap — 15 min
const DEFAULT_IDLE_CLOSE_MS = 120 * 1000; // idle → closed — 120s

function toNonNegInt(n) {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Create an isolated accumulator instance. `ttlMs` and `idleCloseMs` are
 * injectable so tests can drive short windows; the wall clock is always passed
 * in per call as `now` (ms) rather than read from Date.now(), so TTL / idle
 * behavior is deterministic under test.
 */
export function createIntentAccumulator({
  ttlMs = DEFAULT_TTL_MS,
  idleCloseMs = DEFAULT_IDLE_CLOSE_MS,
} = {}) {
  /** intentId -> record */
  const intents = new Map();

  /**
   * Fold one served request's tokens into its intent, creating the record on
   * first sight. `now` is the current wall clock in ms.
   *
   * Correlation rule: the record is OWNED by the userId of the first request
   * that opened it. A later request carrying a different userId for the same
   * intentId is treated as spoofing and its tokens are ignored (the record and
   * its owner are never reassigned). projectId / intentType are recorded from
   * the first request that provides them and never overwritten afterwards.
   *
   * @returns the live record, or null when intentId is falsy or the userId
   *          does not match the record's owner.
   */
  function accumulate(intentId, meta, now) {
    if (!intentId) return null;
    const {
      userId = null,
      projectId = null,
      intentType = null,
      tokensInput = 0,
      tokensOutput = 0,
    } = meta || {};

    let rec = intents.get(intentId);
    if (!rec) {
      rec = {
        intentId,
        userId,
        projectId,
        intentType,
        tokensInput: 0,
        tokensOutput: 0,
        requests: 0,
        startedAt: now,
        lastSeenAt: now,
      };
      intents.set(intentId, rec);
    } else if (userId != null && rec.userId != null && userId !== rec.userId) {
      // Different user claiming the same intentId → ignore, never reassign.
      return null;
    }

    rec.tokensInput += toNonNegInt(tokensInput);
    rec.tokensOutput += toNonNegInt(tokensOutput);
    rec.requests += 1;
    rec.lastSeenAt = now;
    if (rec.projectId == null && projectId != null) rec.projectId = projectId;
    if (rec.intentType == null && intentType != null) rec.intentType = intentType;
    return rec;
  }

  /**
   * Explicitly close an intent and hand its record back to the caller to
   * charge. Idempotent by construction: the record is removed on the first
   * close, so a second close (or a race with the sweep) returns null and the
   * caller charges nothing twice.
   */
  function close(intentId) {
    const rec = intents.get(intentId);
    if (!rec) return null;
    intents.delete(intentId);
    return { ...rec, closeReason: 'explicit' };
  }

  /** Peek without removing — used to verify ownership before an explicit close. */
  function get(intentId) {
    return intents.get(intentId) ?? null;
  }

  /**
   * Remove and return every intent that is due to close at time `now`: idle for
   * at least `idleCloseMs`, or older than `ttlMs`. Each returned record carries
   * a `closeReason` of 'idle' or 'ttl'. Because records are removed here, the
   * same double-close guarantee holds against a concurrent explicit close.
   */
  function collectExpired(now) {
    const due = [];
    for (const [id, rec] of intents) {
      const idle = now - rec.lastSeenAt >= idleCloseMs;
      const aged = now - rec.startedAt >= ttlMs;
      if (idle || aged) {
        due.push({ ...rec, closeReason: idle ? 'idle' : 'ttl' });
        intents.delete(id);
      }
    }
    return due;
  }

  function size() {
    return intents.size;
  }

  return { accumulate, close, get, collectExpired, size };
}

export { DEFAULT_TTL_MS, DEFAULT_IDLE_CLOSE_MS };
