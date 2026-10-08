import type { Facility } from './types'

type Fee = Pick<Facility, 'fee_min' | 'fee_max'>

/** Detail-panel fee: 'Free' | '$X/night' | '$X–$Y/night' | null. */
export function formatFeeRange(f: Fee): string | null {
  return f.fee_min === 0 ? 'Free'
    : f.fee_min != null && f.fee_min === f.fee_max ? `$${f.fee_min}/night`
    : f.fee_min != null ? `$${f.fee_min}–$${f.fee_max}/night`
    : null
}

/** Compact fee: 'Free' | '$X' | nullLabel. */
export function formatFeeShort(f: Pick<Facility, 'fee_min'>, nullLabel: string): string {
  if (f.fee_min === 0) return 'Free'
  if (f.fee_min != null) return `$${f.fee_min}`
  return nullLabel
}

/** Locale date; with opts, falls back to the raw string if formatting throws. */
export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!opts) return new Date(iso).toLocaleDateString()
  try {
    return new Date(iso).toLocaleDateString(undefined, opts)
  } catch {
    return iso
  }
}
