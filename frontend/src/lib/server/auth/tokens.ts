import { env } from "$env/dynamic/private";

export type TokenPurpose = "reset" | "verify";

export const RESET_TTL_MS = 30 * 60 * 1000; // 30 min
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

export interface TokenPayload {
  uid: string;
  purpose: TokenPurpose;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/**
 * The user's `updated` column value is mixed into the signed message (never
 * embedded in the token) so ANY edit to the user record — password change,
 * email verification — invalidates every previously issued token for them.
 */
export async function signToken(
  payloadIn: { uid: string; purpose: TokenPurpose },
  updatedStamp: string,
  ttlMs: number,
): Promise<string> {
  const secret = env.AUTH_TOKEN_SECRET;
  if (!secret) throw new Error("AUTH_TOKEN_SECRET is not set");
  const payload: TokenPayload = { ...payloadIn, exp: Date.now() + ttlMs };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await importKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${body}.${updatedStamp}`));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** Decode WITHOUT verifying — lets a route learn the uid so it can fetch the user record (whose `updated` value is needed to verify). */
export function decodeToken(token: string): TokenPayload | null {
  const body = token.split(".")[0];
  const bytes = body ? fromB64url(body) : null;
  if (!bytes) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as TokenPayload;
    return typeof payload.uid === "string" && typeof payload.exp === "number" ? payload : null;
  } catch {
    return null;
  }
}

export async function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose,
  updatedStamp: string,
): Promise<TokenPayload | null> {
  const secret = env.AUTH_TOKEN_SECRET;
  if (!secret) return null;
  const [body, sigPart, extra] = token.split(".");
  if (!body || !sigPart || extra !== undefined) return null;
  const sig = fromB64url(sigPart);
  if (!sig) return null;
  const key = await importKey(secret, "verify");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig.buffer as ArrayBuffer,
    enc.encode(`${body}.${updatedStamp}`),
  );
  if (!valid) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  if (payload.purpose !== expectedPurpose) return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}
