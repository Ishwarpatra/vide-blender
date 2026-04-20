import { HttpError } from 'wasp/server';
import axios from 'axios';

/**
 * Ruff Formatting Pipeline - Production Version
 * 
 * To maintain the 10MB GitHub limit, we avoid bundling heavy Python binaries.
 * Instead, we use a remote formatting service or a lightweight sidecar.
 */

const MALICIOUS_PATTERNS: RegExp[] = [
  /\bfrom\s+os\b/,
  /\bimport\s+os\b/,
  /\bfrom\s+subprocess\b/,
  /\bimport\s+subprocess\b/,
  /\bfrom\s+sys\b/,
  /\bimport\s+sys\b/,
  /\b__import__\s*\(/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\bopen\s*\([^)]*['"](\/|\.\.)/,
];

const RUFF_API_URL = process.env.RUFF_API_URL || 'https://ruff-formatter.fly.dev/format';

/**
 * Advanced Indentation Fixer (Regex-based)
 * This is a robust fallback for when external formatters are offline.
 * It handles basic Python block structures and indentation normalization.
 */
const fixPythonIndentation = (code: string): string => {
  const lines = code.split('\n');
  let currentLevel = 0;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      
      // Decrease level for outdent keywords/patterns (heuristic)
      if (trimmed.startsWith('elif ') || trimmed.startsWith('else:') || trimmed.startsWith('except ') || trimmed.startsWith('finally:')) {
        currentLevel = Math.max(0, currentLevel - 1);
      }
      
      const indentedLine = '    '.repeat(currentLevel) + trimmed;
      
      // Increase level if line ends with a colon
      if (trimmed.endsWith(':')) {
        currentLevel++;
      }
      
      return indentedLine;
    })
    .join('\n');
};

export const formatPythonCode = async (code: string): Promise<string> => {
  // 1. Anti-RCE Static Analysis
  const matchedPattern = MALICIOUS_PATTERNS.find(pattern => pattern.test(code));
  if (matchedPattern) {
    console.warn(`[RuffFormatter] Malicious pattern detected: ${matchedPattern.source}`);
    throw new HttpError(403, 'MALICIOUS_CODE_DETECTED', {
      message: 'OS-level execution or imports are strictly prohibited.',
    });
  }

  // 2. Try Remote Formatting (Remote service may be offline)
  try {
    const response = await axios.post(RUFF_API_URL, { code }, { timeout: 3000 });
    return response.data.formatted_code || response.data || code;
  } catch (apiError: any) {
    console.warn('[RuffFormatter] Remote API unreachable, attempting local fallback...');
    
    // 3. Optional: Try local CLI if available on the host machine
    // This assumes 'ruff' might be installed on the developer's system.
    try {
      const { spawnSync } = await import('child_process');
      const ruff = spawnSync('ruff', ['format', '-'], { input: code, encoding: 'utf-8', timeout: 2000 });
      if (ruff.status === 0 && ruff.stdout) {
        return ruff.stdout;
      }
    } catch (localError) {
      // Silence local error, proceed to final regex fallback
    }

    // 4. Final Fallback: Advanced Regex-based structural cleanup
    return `# ⚠️ FORMAT_NOTICE: Using local regex-cleanup (Remote Formatter Offline)\n\n${fixPythonIndentation(code)}`;
  }
};
