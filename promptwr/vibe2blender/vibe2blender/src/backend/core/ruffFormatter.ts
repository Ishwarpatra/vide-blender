import { spawnSync } from 'child_process';

/**
 * Ruff Formatting Pipeline (Phase 3)
 *
 * LLMs frequently mess up Python's strict whitespace rules.
 * This utility pipes AI-generated Python code through `ruff format -`
 * via stdin, which avoids temp file management entirely.
 */
export const formatPythonCode = async (code: string): Promise<string> => {
  try {
    // Use spawnSync which correctly supports the 'input' (stdin) option
    const result = spawnSync('ruff', ['format', '-'], {
      input: code,
      encoding: 'utf-8',
      timeout: 10_000,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status === 0 && result.stdout) {
      return result.stdout;
    }

    throw new Error(result.stderr || 'Ruff formatting failed');
  } catch (primaryError: any) {
    console.warn('RUFF_STDIN_FORMAT_FAILED:', primaryError?.message);

    // Fallback: Try using ruff check --fix via stdin to at least fix imports
    try {
      const fallbackResult = spawnSync('ruff', ['check', '--fix', '-'], {
        input: code,
        encoding: 'utf-8',
        timeout: 10_000,
      });

      if (fallbackResult.status === 0 && fallbackResult.stdout) {
        return fallbackResult.stdout || code;
      }
    } catch (fallbackError: any) {
      console.warn('RUFF_CHECK_ALSO_FAILED:', fallbackError?.message);
    }

    // Final fallback: return the raw code with a warning comment
    return `# ⚠️ RUFF_FORMAT_WARNING: Auto-formatting failed. The code below may have syntax issues.\n# Please review indentation and syntax before running in Blender.\n\n${code}`;
  }
};
