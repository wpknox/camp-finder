import { describe, it, expect } from 'vitest'
import { deriveFcfsFlags } from './fcfs'

describe('deriveFcfsFlags', () => {
  it('fully FCFS when reservable is 0 and fcfs > 0', () => {
    expect(deriveFcfsFlags(12, 0)).toEqual({ is_fully_fcfs: true, is_partial_fcfs: false })
  })
  it('partial FCFS when both counts > 0', () => {
    expect(deriveFcfsFlags(5, 18)).toEqual({ is_fully_fcfs: false, is_partial_fcfs: true })
  })
  it('neither flag when fcfs is 0', () => {
    expect(deriveFcfsFlags(0, 20)).toEqual({ is_fully_fcfs: false, is_partial_fcfs: false })
  })
  it('neither flag when both are 0', () => {
    expect(deriveFcfsFlags(0, 0)).toEqual({ is_fully_fcfs: false, is_partial_fcfs: false })
  })
})
