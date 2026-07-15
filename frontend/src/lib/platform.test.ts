import { describe, it, expect } from 'vitest'
import { isIOS } from './platform'

describe('isIOS', () => {
  it('detects iPhone', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
  })
  it('detects iPad', () => {
    expect(isIOS('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
  })
  it('rejects Android', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(false)
  })
  it('rejects desktop Mac', () => {
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe(false)
  })
})
