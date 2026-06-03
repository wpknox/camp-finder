import { describe, it, expect } from 'vitest'
import { createRateLimiter } from './rateLimit'

describe('createRateLimiter', () => {
  it('allows up to max within the window, then blocks', () => {
    let t = 1000
    const rl = createRateLimiter({ max: 3, windowMs: 10_000, now: () => t })
    expect(rl.check('ip1').allowed).toBe(true)
    expect(rl.check('ip1').allowed).toBe(true)
    expect(rl.check('ip1').allowed).toBe(true)
    const blocked = rl.check('ip1')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  it('tracks keys independently', () => {
    let t = 0
    const rl = createRateLimiter({ max: 1, windowMs: 1000, now: () => t })
    expect(rl.check('a').allowed).toBe(true)
    expect(rl.check('b').allowed).toBe(true)
    expect(rl.check('a').allowed).toBe(false)
  })

  it('frees up after the window passes', () => {
    let t = 0
    const rl = createRateLimiter({ max: 1, windowMs: 1000, now: () => t })
    expect(rl.check('a').allowed).toBe(true)
    expect(rl.check('a').allowed).toBe(false)
    t = 1001
    expect(rl.check('a').allowed).toBe(true)
  })
})
