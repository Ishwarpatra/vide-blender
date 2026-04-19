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

export const CHAT_LIMIT = { windowMs: 60 * 1000, max: 20 }; // 20 RPM
export const GENERATE_LIMIT = { windowMs: 60 * 1000, max: 5, maxTokens: 5000 }; // 5 RPM, 5000 TPM
export const GENERATE_DAILY_LIMIT = { windowMs: 24 * 60 * 60 * 1000, max: 50 }; // 50 requests per day per authenticated user ID
