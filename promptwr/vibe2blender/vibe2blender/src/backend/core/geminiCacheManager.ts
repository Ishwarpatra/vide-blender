/**
 * Gemini Context Caching Manager (Phase 3 — Token Efficiency)
 *
 * The "Expert Techie" (Compiler) system prompt is many hundreds of tokens long.
 * Without caching, every single user generation request pays full price for that
 * static system prompt. Gemini's Context Caching API stores the tokenised version
 * of our system instructions server-side for a configurable TTL, charging only a
 * fraction of the normal input-token rate on subsequent requests.
 *
 * Architecture note:
 *   — The FIRST call creates and stores the cache, returning a `cachedContent.name`.
 *   — Subsequent calls re-use that name, passing it into `model.generateContent`.
 *   — Cache entries expire after `ttlSeconds`; the manager auto-recreates them.
 *
 * Reference: https://ai.google.dev/gemini-api/docs/caching
 *
 * Hackathon mode:
 *   Set GEMINI_CACHE_NAME=mock to skip live cache creation in CI/dev environments
 *   where the API key is absent, without breaking the application startup.
 */

import { GoogleGenAI } from '@google/genai';

// ─── Types ───────────────────────────────────────────────────────────
interface CacheEntry {
  name: string;      // e.g. "cachedContents/abc123"
  expiresAt: number; // Unix ms timestamp when this cache entry expires
}

// ─── Module-level singleton ──────────────────────────────────────────
// Stores a single cache entry across the lifetime of the Node process.
// In production behind a multi-instance deployment, this should be stored
// in a shared Redis key so all instances share the same cached token.
let _cacheEntry: CacheEntry | null = null;

// ─── Configuration ───────────────────────────────────────────────────
const TTL_SECONDS = 3600; // 1-hour TTL (Gemini minimum is 60 seconds)
const CACHE_MODEL  = 'models/gemini-1.5-flash-001'; // must match generation model

/**
 * Returns the name of a valid, live Gemini Context Cache for the system prompt.
 * Creates or re-creates the cache entry transparently when missing or expired.
 *
 * @param systemPrompt - The large static system instructions to cache.
 * @returns The `cachedContent.name` string to pass into `model.generateContent`.
 */
export const getOrCreateSystemCache = async (systemPrompt: string): Promise<string> => {
  const API_KEY = process.env.GEMINI_API_KEY || '';

  // ── Hackathon / CI bypass ────────────────────────────────────────
  // If no real key is available, or the dev has pre-set a mock name, skip
  // live API calls entirely so dev and CI environments don't break.
  if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
    return process.env.GEMINI_CACHE_NAME || 'mock-cache-name-no-api-key';
  }

  const now = Date.now();

  // Return the cached name if it is still valid (with a 60-second safety buffer)
  if (_cacheEntry && _cacheEntry.expiresAt > now + 60_000) {
    return _cacheEntry.name;
  }

  // ── Create a new cache entry via the Gemini API ───────────────────
  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const cache = await ai.caches.create({
      model: CACHE_MODEL,
      config: {
        contents: [
          {
            role: 'user',
            parts: [{ text: systemPrompt }],
          },
        ],
        ttl: `${TTL_SECONDS}s`,
        displayName: 'vibe2blender-compiler-system-prompt',
      },
    });

    _cacheEntry = {
      name: cache.name!,
      expiresAt: now + TTL_SECONDS * 1000,
    };

    console.info(`[CacheManager] New cache created: ${cache.name} (expires in ${TTL_SECONDS}s)`);
    return _cacheEntry.name;
  } catch (err: any) {
    // If the caching API call fails (e.g., model version mismatch, network error),
    // log a warning and fall back gracefully — we still generate at full token cost
    // rather than crashing the user's request.
    console.warn('[CacheManager] Failed to create context cache, proceeding without it:', err?.message || err);
    return process.env.GEMINI_CACHE_NAME || '';
  }
};

/**
 * Invalidates the in-process cache entry (useful for tests or forced refresh).
 */
export const invalidateSystemCache = (): void => {
  _cacheEntry = null;
};
