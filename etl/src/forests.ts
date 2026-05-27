// RIDB ParentOrgID → human-readable managing agency
const ORG_ID_MAP: Record<string, string> = {
  '128': 'National Park Service',
  '130': 'Colorado State Parks',
  '131': 'USDA Forest Service',
  '126': 'Bureau of Land Management',
}

export function parentOrgToAgency(orgId: string | undefined): string {
  return ORG_ID_MAP[orgId ?? ''] ?? ''
}

// RIDB query params to fetch all Colorado campgrounds
export const CO_QUERY_PARAMS = {
  state: 'CO',
  activity: 'CAMPING',
  facilitytype: 'Campground',
} as const
