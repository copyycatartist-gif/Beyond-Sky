/**
 * Simple in-memory rate limiter for API routes.
 *
 * Tracks request timestamps per key in a Map and enforces a maximum number
 * of requests within a sliding time window. Note: this is per-process state,
 * so limits are not shared across serverless instances — suitable for
 * single-instance deployments and abuse mitigation, not hard guarantees.
 */

const DEFAULT_MAX_REQUESTS = 30
const DEFAULT_WINDOW_MS = 60 * 1000
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

interface RateLimitOptions {
  maxRequests?: number
  windowMs?: number
}

/** Map of key -> array of request timestamps (ms since epoch) */
const store = new Map<string, number[]>()

let cleanupStarted = false

/** Remove keys whose timestamps all fall outside their retention window */
function cleanup() {
  const now = Date.now()
  store.forEach((timestamps: number[], key: string) => {
    const recent = timestamps.filter((t: number) => now - t < CLEANUP_INTERVAL_MS)
    if (recent.length === 0) {
      store.delete(key)
    } else if (recent.length !== timestamps.length) {
      store.set(key, recent)
    }
  })
}

/** Start the periodic cleanup interval once (unref'd so it never blocks shutdown) */
function ensureCleanup() {
  if (cleanupStarted) return
  cleanupStarted = true
  const interval = setInterval(cleanup, CLEANUP_INTERVAL_MS)
  // unref is available in Node; guard for edge runtimes/tests
  if (typeof interval.unref === 'function') interval.unref()
}

/**
 * Check (and record) a request against the rate limit for a key.
 *
 * @param key - Identifier for the limit bucket (e.g., IP address or user id)
 * @param options.maxRequests - Max requests allowed in the window (default: 30)
 * @param options.windowMs - Sliding window size in ms (default: 60000)
 * @returns { success, remaining, resetAt } — resetAt is when the oldest
 *          tracked request leaves the window (ms since epoch)
 */
export function rateLimit(key: string, options?: RateLimitOptions): RateLimitResult {
  ensureCleanup()

  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS
  const now = Date.now()

  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs)

  if (timestamps.length >= maxRequests) {
    // Denied — do not record the attempt; reset when the oldest one expires
    store.set(key, timestamps)
    const resetAt = timestamps[0] + windowMs
    return { success: false, remaining: 0, resetAt }
  }

  timestamps.push(now)
  store.set(key, timestamps)

  const resetAt = timestamps[0] + windowMs
  return { success: true, remaining: maxRequests - timestamps.length, resetAt }
}

/**
 * Build standard X-RateLimit-* response headers from a rateLimit() result.
 *
 * @param result - The object returned by rateLimit()
 * @returns Headers object suitable for spreading into a Response init
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.remaining + (result.success ? 1 : 0)),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
}
