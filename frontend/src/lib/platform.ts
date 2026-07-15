/** UA-based iOS detection — used only for cosmetic link choices, never gating. */
export function isIOS(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent)
}
