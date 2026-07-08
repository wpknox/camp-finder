import { createRateLimiter } from "./rateLimit";

// 10 attempts / 15 min per IP, shared across login + register.
export const authLimiter = createRateLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
});

// 10 suggestion submissions / 15 min per IP.
export const suggestionLimiter = createRateLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
});

// 5 outbound emails / 15 min per IP (reset + verification requests).
export const emailLimiter = createRateLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000,
});
