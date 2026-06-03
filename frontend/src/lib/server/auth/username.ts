/** Default random suffix: 4 lowercase-hex-ish chars. */
function defaultSuffix(): string {
  return Math.random().toString(36).slice(2, 6)
}

/**
 * Derive a Teenybase-legal username (^[a-zA-Z][a-zA-Z0-9_]*$, <=32) that the
 * user never sees. Built from the email local-part, falling back to the display
 * name, with a random suffix appended for uniqueness.
 */
export function deriveUsername(
  email: string,
  name: string,
  suffixFn: () => string = defaultSuffix,
): string {
  const localPart = email.split('@')[0] ?? ''
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

  let base = clean(localPart)
  if (!base) base = clean(name)
  if (!base) base = 'user'
  if (!/^[a-z]/.test(base)) base = 'u' + base

  const suffix = suffixFn().toLowerCase().replace(/[^a-z0-9]/g, '') || 'x'
  const maxBase = 32 - (suffix.length + 1) // +1 for the underscore
  base = base.slice(0, maxBase)

  return `${base}_${suffix}`
}
