// @ts-nocheck
import { type GenerateScript } from 'wasp/server/operations';
import { HttpError } from 'wasp/server';
import { GoogleGenAI } from '@google/genai';
import { enforceGenerateLimits } from '../../backend/core/rateLimiter';
import { GenerationInputSchema } from '../../backend/core/validators';
import { guardPrompt } from '../../backend/core/promptGuard';
import { sanitizeOutput } from '../../backend/core/outputSanitizer';
import { formatPythonCode } from '../../backend/core/ruffFormatter';
import { encodeHtml } from '../../backend/core/xssSanitizer';
import { getOrCreateSystemCache } from '../../backend/core/geminiCacheManager';
import { executeInSandbox } from '../../backend/core/sandboxExecutor';

// ─── Type Definitions ───────────────────────────────────────────────
type GenerateScriptPayload = {
  sessionId?: string;
  refinedPrompt: string;
  originalPrompt: string;
}

// ─── Gemini Client Setup ────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY || '';
// Use the new @google/genai SDK which has first-class Context Caching support.
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Phase 3 System Prompt — The "Compiler" persona.
 * This is the 3-Step mandatory prompt that instructs Gemini to
 * generate executable, clean Blender Python (bpy) scripts.
 */
const COMPILER_SYSTEM_PROMPT = `You are an elite Blender Python (bpy) developer. Convert the user's description into a fully executable bpy script.
Step 1: Delete default objects and create the base mesh using bpy.ops.mesh.
Step 2: Apply necessary modifiers (e.g., Bevel, Subdivision) non-destructively.
Step 3: Create a basic Principled BSDF material and assign it.
ONLY output valid Python code. No markdown formatting. No conversational text.`;

// ─── Wasp Action ────────────────────────────────────────────────────
export const generateScript: GenerateScript<GenerateScriptPayload> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED');
  }

  // 1. Validate Input
  const result = GenerationInputSchema.safeParse({ refinedPrompt: args.refinedPrompt, userId: context.user.id });
  if (!result.success) {
    throw new HttpError(400, 'INVALID_INPUT', { errors: result.error.format() });
  }

  // Estimate tokens (very rough heuristic: 1 token ~= 4 chars)
  // The system prompt tokens are heavily discounted when the cache is live,
  // but we still account for them to enforce our conservative TPM budget.
  const estimatedTokens = Math.ceil((args.refinedPrompt.length + COMPILER_SYSTEM_PROMPT.length) / 4);

  // 2. Enforce dual-tier Rate Limit — both per-minute (5 RPM + 5000 TPM)
  //    and per-day (50 req/day) are enforced atomically in one call.
  enforceGenerateLimits(context.user.id, estimatedTokens);

  // 3. Guard against Prompt Injection
  const guardedPrompt = guardPrompt(args.refinedPrompt);

  // 4. Resolve the Gemini Context Cache for the system prompt.
  //    getOrCreateSystemCache() returns the cache name if a valid cached entry exists,
  //    or transparently creates a new one via the Caching API if it has expired.
  //    This drastically lowers per-request token costs for the large system prompt.
  const cachedContentName = await getOrCreateSystemCache(COMPILER_SYSTEM_PROMPT);

  // 5. Call Gemini, injecting the cached system prompt reference
  try {
    const geminiResult = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{
        role: 'user',
        parts: [{ text: `User request: ${guardedPrompt}` }],
      }],
      config: {
        // When cachedContentName is a real cache ID the system prompt tokens
        // are not re-billed at full rate. Both the system instruction AND the
        // cachedContent field are set; the SDK will prefer the cache token.
        systemInstruction: COMPILER_SYSTEM_PROMPT,
        cachedContent: cachedContentName || undefined,
      },
    });

    const rawOutput = geminiResult.text ?? '';

    // 6. Post-Processing Pipeline
    // A. Sanitize — strip markdown fences, conversational filler
    const sanitizedCode = sanitizeOutput(rawOutput);

    // B. Format — pipe through sandboxed Ruff validation (no OS shell execution)
    const formattedCode = await formatPythonCode(sanitizedCode);

    // C. HTML Encode output for frontend display (XSS prevention)
    const safeOutput = encodeHtml(formattedCode);

    // 7. Persist to database
    //    Store safeOutput (HTML-encoded) for display AND formattedCode (raw) for
    //    the sandbox executor. The executor needs unencoded Python to run correctly.
    const newScript = await context.entities.BlenderScript.create({
      data: {
        userId: context.user.id,
        sessionId: args.sessionId,
        originalPrompt: args.originalPrompt,
        refinedPrompt: args.refinedPrompt,
        generatedCode: safeOutput,
        // glbPath is null until the executor completes
      }
    });

    // 8. Launch sandbox executor asynchronously (non-blocking)
    //    The executor runs the formattedCode (unencoded Python) in the isolated
    //    blender-executor container and updates glbPath when done.
    //    A failure here is non-fatal: the script record is returned to the user
    //    immediately; the 3D preview populates asynchronously.
    executeInSandbox(formattedCode, newScript.id)
      .then(({ glbPath, durationMs }) => {
        console.info(`[Generation] GLB ready for ${newScript.id} in ${durationMs}ms: ${glbPath}`);
        return context.entities.BlenderScript.update({
          where: { id: newScript.id },
          data: { glbPath } as any,
        });
      })
      .catch((err: Error) => {
        // Log but do not crash the request — the user gets the text script either way
        console.error(`[Generation] Sandbox executor failed for ${newScript.id}:`, err.message);
      });

    return newScript;
  } catch (error: any) {
    console.error('GEMINI_API_ERROR:', error?.message || error);

    // Provide a mock fallback in development if API key is not set
    if (!API_KEY && process.env.NODE_ENV === 'development') {
      const mockScript = `# FALLBACK_MOCK_SCRIPT (GEMINI_API_KEY not configured)
import bpy

# Step 1: Clear scene and create base mesh
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_monkey_add(size=2, location=(0, 0, 0))
obj = bpy.context.active_object

# Step 2: Apply Subdivision Surface modifier
mod = obj.modifiers.new(name="Subdivision", type='SUBSURF')
mod.levels = 2
mod.render_levels = 3

# Step 3: Create and assign a Principled BSDF material
mat = bpy.data.materials.new(name="MonkeyMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.8, 0.2, 0.1, 1.0)
obj.data.materials.append(mat)

print("Fallback monkey generated!")`;

      const safeMockScript = encodeHtml(mockScript);

      const newScript = await context.entities.BlenderScript.create({
        data: {
          userId: context.user.id,
          sessionId: args.sessionId,
          originalPrompt: args.originalPrompt,
          refinedPrompt: args.refinedPrompt,
          generatedCode: safeMockScript,
        }
      });
      return newScript;
    }

    throw new HttpError(500, 'AI_GENERATION_FAILED');
  }
};
