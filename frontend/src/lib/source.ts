export type Source = 'ridb' | 'fs' | 'nps' | 'user'

export const SOURCE_LABEL: Record<Source, string> = {
  ridb: 'RIDB',
  fs: 'USFS',
  nps: 'NPS',
  user: 'User',
}

/** Record source from the ridb_id prefix; non-prefixed ids are treated as RIDB. */
export function sourceOf(ridbId: string): Source {
  if (ridbId.startsWith('fs-')) return 'fs'
  if (ridbId.startsWith('nps-')) return 'nps'
  if (ridbId.startsWith('user-')) return 'user'
  return 'ridb'
}

export function sourceLabel(ridbId: string): string {
  return SOURCE_LABEL[sourceOf(ridbId)]
}

/** Real RIDB ids are numeric — only those have a recreation.gov page. */
export function isRidbRecord(ridbId: string): boolean {
  return /^\d+$/.test(ridbId)
}
