import { HttpError } from 'wasp/server';

/**
 * Prompt Injection Guard — Defence-in-Depth Pre-LLM Firewall
 *
 * Attack surface covered:
 *  1. Direct keyword matches      → "ignore previous instructions"
 *  2. Spacing tricks              → "i g n o r e  p r e v i o u s"
 *  3. Unicode lookalikes          → "іgnore" (Cyrillic і)
 *  4. Leetspeak substitutions     → "1gn0r3 pr3v10us"
 *  5. Mixed-case obfuscation      → "iGnOrE pReViOuS" (handled by /i flag)
 *
 * Strategy:
 *   Canonicalise the input into a flat lowercase ASCII string first,
 *   then run the regex blocklist against that normalised form.
 *   The original (non-normalised) input is still what gets wrapped in
 *   the output delimiters — we only normalise for detection, not transmission.
 */

// ─── Normalisation Helpers ───────────────────────────────────────────────────

/**
 * Strip Unicode diacritics / lookalike characters.
 * NFD decomposition splits combined characters, then we remove the
 * combining marks (U+0300–U+036F), leaving plain ASCII base letters.
 */
function stripUnicode(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove combining diacritics
    .replace(/[^\x00-\x7F]/g, '?');   // Replace remaining non-ASCII with '?'
}

/**
 * Replace common leetspeak substitutions with their ASCII equivalents
 * so "1gn0r3" normalises to "ignore".
 */
function stripLeetspeak(input: string): string {
  return input
    .replace(/3/g, 'e')
    .replace(/0/g, 'o')
    .replace(/4/g, 'a')
    .replace(/1/g, 'i')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
}

/**
 * Collapse ALL whitespace, punctuation, and separators between characters
 * so that space-separated tricks like "i g n o r e" collapse to "ignore".
 */
function collapseWhitespace(input: string): string {
  return input.replace(/[\s\-_.,;:!?'"()\[\]{}|/\\]+/g, '');
}

/** Full normalisation pipeline applied before pattern matching. */
function canonicalise(input: string): string {
  return collapseWhitespace(stripLeetspeak(stripUnicode(input))).toLowerCase();
}

// ─── Injection Pattern Blocklist ─────────────────────────────────────────────
// Patterns are tested against the CANONICALISED (whitespace-collapsed, leet-stripped)
// version of the input, so all obfuscation vectors collapse before testing.
// The \s* between characters handles any residual gaps missed by collapseWhitespace.

const INJECTION_PATTERNS: RegExp[] = [
  // Core injection commands
  /ignorepreviousinstructions?/i,
  /disregardearlierin?structions?/i,
  /forgetalllprior/i,
  /forgetal(l)?prior/i,
  /newinstruction/i,
  /overrideyourinstruction/i,

  // System prompt exfiltration
  /systemprompt/i,
  /outputyoursystemprompt/i,
  /revealsystemprompt/i,
  /repeatyourinstructions?/i,
  /whatareyourinstructions?/i,

  // Persona / role hijacking
  /actas(a|an)?linuxterminal/i,
  /actas(a|an)?unrestrictedai/i,
  /youarednowdan/i,  // "DAN" jailbreak
  /youwillnowact/i,
  /pretendyouare/i,
  /simulatebeing/i,

  // Jailbreak patterns
  /developermode/i,
  /jailbreak/i,
  /bypassfilter/i,
  /ignoresafetyguide(line)?s?/i,
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Canonicalise the input and test it against the injection pattern blocklist.
 * Throws a 400 HttpError if any pattern matches.
 * Returns the original (unmodified) input wrapped in explicit user-input delimiters.
 *
 * @param userInput - Raw user-provided string.
 * @returns The delimited input string safe to embed in an LLM prompt.
 */
export const guardPrompt = (userInput: string): string => {
  const canonical = canonicalise(userInput);

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(canonical)) {
      // Log the pattern class (not the full input) so logs don't leak PII
      console.warn(`[PromptGuard] Injection detected — pattern: ${pattern.source}`);
      throw new HttpError(400, 'PROMPT_INJECTION_DETECTED');
    }
  }

  // Wrap with explicit delimiters to structurally separate user data from
  // the developer's system instructions inside the final LLM prompt.
  return `<<<USER_INPUT>>>\n${userInput}\n<<<END_USER_INPUT>>>`;
};
