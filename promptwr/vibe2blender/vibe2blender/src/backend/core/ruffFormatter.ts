import { HttpError } from 'wasp/server';

/**
 * Ruff Formatting Pipeline (Phase 3) - Sandboxed API Version
 *
 * LLMs frequently mess up Python's strict whitespace rules.
 * To prevent RCE vulnerabilities from shelling out to the OS with spawnSync,
 * we use a safe, sandboxed API-based validation approach where the code is
 * treated purely as a passive text string.
 *
 * Anti-RCE Static Analysis: Uses strict word-boundary regex (not naive .includes())
 * to catch obfuscated OS-level imports such as:
 *   - "from os import system"    (from-import form)
 *   - "import   os"              (multiple spaces)
 *   - "eval ("                   (space before paren)
 *   - "__import__ ( 'os' )"      (dynamic import with spaces)
 */

// Each pattern uses \b word boundaries and \s+ for whitespace tolerance.
// Ordered from most dangerous to least.
const MALICIOUS_PATTERNS: RegExp[] = [
  /\bfrom\s+os\b/,                      // from os import ...
  /\bimport\s+os\b/,                    // import os
  /\bfrom\s+subprocess\b/,              // from subprocess import ...
  /\bimport\s+subprocess\b/,            // import subprocess
  /\bfrom\s+sys\b/,                     // from sys import ...
  /\bimport\s+sys\b/,                   // import sys
  /\b__import__\s*\(/,                  // __import__('os')
  /\beval\s*\(/,                        // eval( or eval (
  /\bexec\s*\(/,                        // exec( or exec (
  /\bcompile\s*\(/,                     // compile( — can build code objects
  /\bopen\s*\([^)]*['"](\/|\.\.)/,      // open('/etc/...') or open('../...')
];

export const formatPythonCode = async (code: string): Promise<string> => {
  // 1. Passive Text String Validation (Anti-RCE)
  // Test against word-boundary regex patterns — NOT naive .includes() —
  // to catch variant forms: 'from os import system', 'import   os', 'eval (', etc.
  const matchedPattern = MALICIOUS_PATTERNS.find(pattern => pattern.test(code));

  if (matchedPattern) {
    console.warn(`[RuffFormatter] Malicious pattern detected: ${matchedPattern.source}`);
    throw new HttpError(403, 'MALICIOUS_CODE_DETECTED', {
      message: 'OS-level execution or imports are strictly prohibited in generated Blender scripts.',
    });
  }

  // 2. Sandboxed API-based formatting (mocked for hackathon)
  // In production this calls a secured, isolated microservice or a
  // WebAssembly-based Python AST parser to format the code safely.
  // No spawnSync / child_process calls — the code string is NEVER executed.
  try {
    // const response = await fetch('https://safe-format-api.internal/format', { method: 'POST', body: code });
    // return await response.text();
    return code;
  } catch (error: any) {
    console.warn('API_FORMAT_FAILED:', error?.message);
    return `# ⚠️ FORMAT_WARNING: Sandboxed formatting unavailable.\n\n${code}`;
  }
};
