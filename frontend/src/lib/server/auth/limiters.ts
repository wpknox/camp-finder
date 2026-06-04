import { createRateLimiter } from "./rateLimit";

// 10 attempts / 15 min per IP, shared across login + register.
export const authLimiter = createRateLimiter({
  max: 10,
  windowMs: 15 * 60 * 1000,
});
