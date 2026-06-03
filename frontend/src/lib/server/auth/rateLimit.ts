interface RateLimiterOptions {
  max: number
  windowMs: number
  now?: () => number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterMs?: number
}

export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimiterOptions) {
  const hits = new Map<string, number[]>()

  return {
    check(key: string): RateLimitResult {
      const t = now()
      const cutoff = t - windowMs
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff)

      if (recent.length >= max) {
        const retryAfterMs = recent[0] + windowMs - t
        hits.set(key, recent)
        return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) }
      }

      recent.push(t)
      hits.set(key, recent)
      return { allowed: true }
    },
  }
}
