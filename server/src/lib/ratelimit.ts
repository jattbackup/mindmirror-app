export type RateLimiter = {
  check(key: string): boolean
}

export function createRateLimiter(limit = 60, windowMs = 60_000): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return {
    check(key) {
      const now = Date.now()
      const bucket = buckets.get(key)
      if (!bucket || now > bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs })
        return true
      }
      bucket.count += 1
      return bucket.count <= limit
    },
  }
}
