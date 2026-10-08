import type { Amenities } from './types'

/** Amenities users can propose/edit, in display order. */
export const EDITABLE_AMENITIES = [
  { key: 'potableWater', label: 'Potable water' },
  { key: 'bearBoxes', label: 'Bear boxes' },
  { key: 'petsAllowed', label: 'Pets allowed' },
  { key: 'electricHookups', label: 'Electric hookups' },
  { key: 'picnicTables', label: 'Picnic tables' },
  { key: 'fireRings', label: 'Fire rings' },
  { key: 'accessible', label: 'Accessible sites' },
] as const satisfies ReadonlyArray<{ key: keyof Amenities; label: string }>

export type EditableAmenityKey = (typeof EDITABLE_AMENITIES)[number]['key']
