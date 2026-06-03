import { describe, it, expect } from 'vitest'
import { decodeJwtPayload, isExpired } from './jwt'

// Build a fake JWT: header.payload.signature (only payload matters here).
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

describe('decodeJwtPayload', () => {
  it('extracts id, user, sub, exp', () => {
    const tok = makeJwt({ id: 'abc', user: 'alex_a3f9', sub: 'a@b.com', exp: 1780457209 })
    const p = decodeJwtPayload(tok)
    expect(p).toEqual({ id: 'abc', user: 'alex_a3f9', sub: 'a@b.com', exp: 1780457209 })
  })
  it('returns null on malformed token', () => {
    expect(decodeJwtPayload('garbage')).toBeNull()
    expect(decodeJwtPayload('')).toBeNull()
  })
})

describe('isExpired', () => {
  it('true when exp is in the past', () => {
    expect(isExpired({ exp: 1000 } as any, () => 2000_000)).toBe(true)
  })
  it('false when exp is comfortably in the future', () => {
    expect(isExpired({ exp: 5000 } as any, () => 1000_000 / 1000)).toBe(false)
  })
})
