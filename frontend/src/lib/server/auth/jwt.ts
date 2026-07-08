export interface JwtPayload {
  id: string;
  user: string;
  sub: string;
  exp: number;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    // Web-standard base64url decode — Buffer is unavailable on Cloudflare
    // Pages functions without the nodejs_compat flag.
    const b64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.codePointAt(0) ?? 0);
    const json = JSON.parse(new TextDecoder().decode(bytes));
    if (!json || typeof json.id !== "string" || typeof json.exp !== "number")
      return null;
    return { id: json.id, user: json.user, sub: json.sub, exp: json.exp };
  } catch {
    return null;
  }
}

/** exp is in seconds (JWT standard). `nowSeconds` returns current epoch seconds. */
export function isExpired(
  payload: JwtPayload,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  skewSeconds = 30,
): boolean {
  return payload.exp <= nowSeconds() + skewSeconds;
}
