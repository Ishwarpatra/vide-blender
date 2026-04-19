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
//
// ⚠️  KNOWN LIMITATION — Volatile Cache Memory Leak
// The cache ID is stored in a Node process-level variable. This means:
//   1. Every server RESTART or CRASH wipes _cacheEntry and triggers a new
//      ai.caches.create() call, paying the full system-prompt token cost to
//      create a brand-new cache while the old one sits orphaned on Google’s
//      servers until its TTL expires naturally.
//   2. In a multi-instance deployment (e.g., Docker replicas, Cloud Run)
//      each instance maintains its own independent _cacheEntry and will
//      independently create and own separate caches.
//
// PRODUCTION REMEDIATION:
//   Persist the cache name + expiresAt in your PostgreSQL `BlenderScript`
//   table (or a dedicated `GeminiCache` row/Redis key) and read it back on
//   startup. Use GEMINI_CACHE_NAME env var as a deployment-time override
//   to reattach a known, still-valid cache ID without an API round-trip.
//
// HACKATHON WORKAROUND:
//   Set GEMINI_CACHE_NAME in .env.server to a previously created cache ID.
//   The startup hydration block below will reuse it across restarts for the
//   duration of the hackathon without creating orphaned caches.
let _cacheEntry: CacheEntry | null = null;

// Startup hydration: if a known cache name is pre-configured via env var,
// seed _cacheEntry so the first request skips the cache-creation API call.
// expiresAt is set conservatively to 30 minutes from now (we don’t know the
// true TTL of a pre-existing cache, so we re-verify after 30 min).
(function hydrateFromEnv() {
  const envName = process.env.GEMINI_CACHE_NAME;
  if (envName && envName !== 'mock' && envName !== '') {
    _cacheEntry = { name: envName, expiresAt: Date.now() + 30 * 60 * 1000 };
    console.info(`[CacheManager] Hydrated from GEMINI_CACHE_NAME env var: ${envName}`);
  }
})();

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
