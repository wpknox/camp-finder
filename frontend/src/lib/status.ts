import type { Facility } from './types'

export type FacilityStatus = 'closed' | 'fully' | 'partial' | 'reservable'

/** Single source for marker/dot status. Keep sidebar dots, map pins and badges in lockstep. */
export const STATUS_META: Record<FacilityStatus, { cssVar: string; hex: string; label: string }> = {
  closed: { cssVar: 'var(--rust)', hex: '#a23a17', label: 'Closed' },
  fully: { cssVar: 'var(--moss)', hex: '#5f7d34', label: 'Fully first-come, first-served' },
  partial: { cssVar: 'var(--ochre)', hex: '#c8932f', label: 'Partially first-come, first-served' },
  reservable: { cssVar: 'var(--lake)', hex: '#356b7d', label: 'Reservable only' },
}

export function facilityStatus(
  f: Pick<Facility, 'is_closed' | 'is_fully_fcfs' | 'is_partial_fcfs'>,
): FacilityStatus {
  if (f.is_closed) return 'closed'
  if (f.is_fully_fcfs) return 'fully'
  if (f.is_partial_fcfs) return 'partial'
  return 'reservable'
}

/** FCFS tier from site counts (no closed state), as shown by FCFSBadge. */
export function fcfsTier(fcfsTotal: number, isFullyFcfs: boolean): Exclude<FacilityStatus, 'closed'> {
  return isFullyFcfs ? 'fully' : fcfsTotal > 0 ? 'partial' : 'reservable'
}
