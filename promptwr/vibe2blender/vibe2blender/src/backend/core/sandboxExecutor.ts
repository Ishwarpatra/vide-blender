/**
 * sandboxExecutor.ts — Ephemeral Container Orchestrator
 *
 * Workflow:
 *  1. Writes the generated Python script to a shared host volume (/tmp/v2b-scripts).
 *  2. Calls `docker run` with strict security constraints to execute the script
 *     inside the blender-executor image.
 *  3. Waits for the container to exit (auto-removed via --rm).
 *  4. Reads the exported .glb file from the output volume and returns its path.
 *
 * Security constraints enforced on the ephemeral container:
 *  --network none        No internet access from within the sandbox
 *  --memory 512m         Hard RAM cap — prevents memory exhaustion attacks
 *  --cpus 0.5            CPU throttle — prevents compute starvation of the host
 *  --read-only           Container filesystem is read-only
 *  --rm                  Auto-deleted on exit — no container sprawl
 *  :ro volume mounts     Script input is mounted read-only
 *  :rw on /output only   Only the output directory is writable
 *
 * Requires:
 *  - Docker daemon accessible via the Unix socket mounted into this container
 *    (see docker-compose.yml: /var/run/docker.sock:/var/run/docker.sock)
 *  - blender-executor image pre-built on the host:
 *      docker build -f infrastructure/Dockerfile.blender-executor -t blender-executor:latest .
 *
 * Production note:
 *  In a production deployment, replace the `docker run` CLI invocation with
 *  the Dockerode SDK for typed, promise-based container management, and move
 *  the shared volumes to a proper persistent volume claim (e.g. AWS EFS).
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Configuration ────────────────────────────────────────────────────────────
const EXECUTOR_IMAGE   = process.env.BLENDER_EXECUTOR_IMAGE || 'blender-executor:latest';
const SCRIPTS_HOST_DIR = process.env.SANDBOX_SCRIPTS_DIR   || '/tmp/v2b-scripts';
const OUTPUTS_HOST_DIR = process.env.SANDBOX_OUTPUTS_DIR   || '/tmp/v2b-outputs';
const TIMEOUT_MS       = parseInt(process.env.SANDBOX_TIMEOUT_MS || '120000', 10); // 2 min

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ExecutorResult {
  glbPath: string;  // Absolute path on the host where the .glb was written
  durationMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Ensure a directory exists, creating it recursively if needed. */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Runs `docker run ...` as a child process and resolves/rejects based on
 * the container exit code. Enforces a hard timeout.
 */
function runDockerContainer(scriptHostPath: string, glbHostPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    // Ensure output directory exists before mounting it
    ensureDir(path.dirname(glbHostPath));

    // Path inside container: /scripts/<filename> and /output/<filename>
    const scriptContainerPath = `/scripts/${path.basename(scriptHostPath)}`;
    const glbContainerPath    = `/output/${path.basename(glbHostPath)}`;

    const dockerArgs = [
      'run',
      '--rm',                           // Auto-remove on exit
      '--network', 'none',              // No internet access
      '--memory', '512m',               // Hard RAM cap
      '--cpus', '0.5',                  // CPU throttle
      '--read-only',                    // Read-only container FS
      // Script volume: read-only
      '-v', `${path.dirname(scriptHostPath)}:/scripts:ro`,
      // Output volume: writable (tmpfs for the rest of the container FS)
      '-v', `${path.dirname(glbHostPath)}:/output:rw`,
      '--tmpfs', '/tmp',                // Allow Blender to write temp files
      EXECUTOR_IMAGE,
      // Args forwarded to executor.py via Blender's '--' separator
      scriptContainerPath,
      glbContainerPath,
    ];

    console.info(`[SandboxExecutor] Spawning container: docker ${dockerArgs.join(' ')}`);

    const proc = spawn('docker', dockerArgs, { stdio: 'pipe' });

    // Collect stdout/stderr for logging without exposing to caller
    proc.stdout.on('data', (chunk: Buffer) => {
      console.info('[blender-executor]', chunk.toString().trim());
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      console.error('[blender-executor:err]', chunk.toString().trim());
    });

    // Hard timeout — kill the container if it exceeds TIMEOUT_MS
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(
        `[SandboxExecutor] Container timed out after ${TIMEOUT_MS}ms and was force-killed.`
      ));
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startedAt;
      if (code === 0) {
        console.info(`[SandboxExecutor] Container exited cleanly in ${elapsed}ms.`);
        resolve();
      } else {
        reject(new Error(
          `[SandboxExecutor] Container exited with code ${code} after ${elapsed}ms.`
        ));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(
        `[SandboxExecutor] Failed to spawn docker process: ${err.message}. ` +
        'Ensure Docker is running and the Docker socket is mounted.'
      ));
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Executes a generated Blender Python script inside an ephemeral, strictly
 * constrained Docker sandbox and exports the result as a .glb file.
 *
 * The main Node backend remains text-in/text-out. All code execution is
 * delegated entirely to the isolated container — this function only handles
 * orchestration (file I/O + process management).
 *
 * @param scriptCode   - The raw Python script text (passive string, not executed here)
 * @param generationId - DB record ID, used to namespace temp files
 * @returns            - Path to the generated .glb file on the host
 */
export async function executeInSandbox(
  scriptCode: string,
  generationId: string,
): Promise<ExecutorResult> {
  const startedAt = Date.now();

  // 1. Write the script string to a temp file on the shared host volume
  ensureDir(SCRIPTS_HOST_DIR);
  ensureDir(OUTPUTS_HOST_DIR);

  const scriptHostPath = path.join(SCRIPTS_HOST_DIR, `${generationId}.py`);
  const glbHostPath    = path.join(OUTPUTS_HOST_DIR, `${generationId}.glb`);

  // The script is written as a passive text file — never eval()'d by Node
  fs.writeFileSync(scriptHostPath, scriptCode, { encoding: 'utf8', mode: 0o444 });

  // 2. Spawn the ephemeral container
  try {
    await runDockerContainer(scriptHostPath, glbHostPath);
  } finally {
    // Always clean up the input script regardless of success/failure
    try { fs.unlinkSync(scriptHostPath); } catch { /* ignore */ }
  }

  // 3. Verify the output file exists
  if (!fs.existsSync(glbHostPath)) {
    throw new Error(
      `[SandboxExecutor] GLB file not found at ${glbHostPath} after container exit.`
    );
  }

  return {
    glbPath: glbHostPath,
    durationMs: Date.now() - startedAt,
  };
}
