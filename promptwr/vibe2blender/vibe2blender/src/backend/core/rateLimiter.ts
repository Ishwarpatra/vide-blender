import { HttpError } from 'wasp/server';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  maxTokens?: number; // Optional TPM limit
}

const storage = new Map<string, { count: number; tokens: number; resetAt: number }>();

/**
 * A simple in-memory leaky bucket rate limiter with optional token tracking.
 * In a real production environment, this should be backed by Redis.
 */
export const checkRateLimit = (key: string, config: RateLimitConfig, tokensConsumed: number = 0) => {
  const now = Date.now();
  const entry = storage.get(key);

  if (!entry || now > entry.resetAt) {
    storage.set(key, { count: 1, tokens: tokensConsumed, resetAt: now + config.windowMs });
    return;
  }

  if (entry.count >= config.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    throw new HttpError(429, 'TOO_MANY_REQUESTS', { retryAfter });
  }

  if (config.maxTokens && entry.tokens + tokensConsumed > config.maxTokens) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    throw new HttpError(429, 'TOKEN_LIMIT_EXCEEDED', { retryAfter });
  }

  entry.count += 1;
  entry.tokens += tokensConsumed;
};

export const CHAT_LIMIT          = { windowMs: 60 * 1000,              max: 20             }; // 20 RPM
export const GENERATE_LIMIT      = { windowMs: 60 * 1000,              max: 5,  maxTokens: 5000 }; // 5 RPM, 5000 TPM
export const GENERATE_DAILY_LIMIT = { windowMs: 24 * 60 * 60 * 1000,  max: 50             }; // 50/day per user

/**
 * Dual-tier enforcement wrapper for the Gemini generation route.
 *
 * Problem this solves: `GENERATE_DAILY_LIMIT` was a constant that did not enforce
 * itself. Callers were expected to call `checkRateLimit` twice with separate keys,
 * but nothing guaranteed both were always called, making the daily cap optional.
 *
 * This wrapper makes both tiers mandatory in a single call:
 *   — Per-minute bucket  : key `generate:rpm:<userId>`  → 5 req/min + 5000 TPM
 *   — Per-day bucket     : key `generate:day:<userId>`  → 50 req/day
 *
 * Both checks run before any Gemini API call is made. If either limit is exceeded
 * a 429 is thrown and the request is rejected immediately.
 *
 * @param userId          - Authenticated user ID (used to namespace the keys).
 * @param estimatedTokens - Rough token estimate for TPM tracking.
 */
export const enforceGenerateLimits = (userId: string, estimatedTokens: number): void => {
  // Tier 1: per-minute RPM + TPM check
  checkRateLimit(`generate:rpm:${userId}`, GENERATE_LIMIT, estimatedTokens);
  // Tier 2: per-day absolute cap — completely separate storage key and window
  checkRateLimit(`generate:day:${userId}`, GENERATE_DAILY_LIMIT, 0);
};
