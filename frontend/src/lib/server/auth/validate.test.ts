import { describe, it, expect } from 'vitest'
import { validateEmail, validatePassword } from './validate'

describe('validateEmail', () => {
  it('accepts a normal email', () => {
    expect(validateEmail('alex@example.com')).toBe(true)
  })
  it('rejects missing @ or domain', () => {
    expect(validateEmail('alex')).toBe(false)
    expect(validateEmail('alex@')).toBe(false)
    expect(validateEmail('alex@example')).toBe(false)
    expect(validateEmail('')).toBe(false)
  })
})

describe('validatePassword', () => {
  it('accepts 8+ chars', () => {
    expect(validatePassword('hunter22')).toEqual({ ok: true })
  })
  it('rejects shorter than 8', () => {
    const r = validatePassword('short')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/8/)
  })
})
