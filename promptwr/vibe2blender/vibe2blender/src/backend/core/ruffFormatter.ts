import { HttpError } from 'wasp/server';

/**
 * Ruff Formatting Pipeline (Phase 3) - Sandboxed API Version
 *
 * LLMs frequently mess up Python's strict whitespace rules.
 * To prevent RCE vulnerabilities from shelling out to the OS with spawnSync, 
 * we now use a safe, sandboxed API-based validation approach where the code is 
 * treated purely as a passive text string.
 */
export const formatPythonCode = async (code: string): Promise<string> => {
  // 1. Passive Text String Validation (Anti-RCE)
  // Check for highly dangerous Python os-level imports that Blender should never need.
  const maliciousPatterns = ['import os', 'import sys', 'import subprocess', '__import__', 'eval(', 'exec('];
  const isMalicious = maliciousPatterns.some(pattern => code.includes(pattern));
  
  if (isMalicious) {
     throw new HttpError(403, 'MALICIOUS_CODE_DETECTED', { message: 'OS-level execution or imports are strictly prohibited in generated Blender scripts.' });
  }

  // 2. Sandboxed API-based formatting approach (mocked for hackathon environment)
  // In a real production scenario, this calls a secured, isolated microservice 
  // or a WebAssembly-based Python AST parser to format the code safely.
  try {
    // Example: const response = await fetch('https://safe-format-api.internal/format', { method: 'POST', body: code });
    // return await response.text();
    
    // For now, return the passive string exactly as is (after it has passed the security checks above)
    return code; 
  } catch (error: any) {
    console.warn('API_FORMAT_FAILED:', error?.message);
    return `# ⚠️ FORMAT_WARNING: Sandboxed API formatting failed.\n\n${code}`;
  }
};
