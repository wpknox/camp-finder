const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function validatePassword(password: string): {
  ok: boolean;
  error?: string;
} {
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }
  return { ok: true };
}
