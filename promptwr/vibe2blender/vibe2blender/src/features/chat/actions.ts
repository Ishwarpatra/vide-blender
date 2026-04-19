import { type Chat } from 'wasp/server/operations';
import { HttpError } from 'wasp/server';
import axios from 'axios';
import { checkRateLimit, CHAT_LIMIT } from '../../backend/core/rateLimiter';
import { ChatInputSchema } from '../../backend/core/validators';
import { guardPrompt } from '../../backend/core/promptGuard';
import { retrieveBlenderContext } from '../../backend/core/ragPipeline';
import { encodeHtml } from '../../backend/core/xssSanitizer';

// ─── Type Definitions ───────────────────────────────────────────────
type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  [key: string]: any;
}

type ChatPayload = {
  messages: ChatMessage[];
}

// ─── Constants ──────────────────────────────────────────────────────
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5';

/**
 * Phase 3 System Prompt — The "Interviewer" persona.
 * This prompt instructs Ollama/Qwen to act as a 3D Technical Artist
 * who refines vague user ideas into structured Blender-ready descriptions.
 */
const INTERVIEWER_SYSTEM_PROMPT = `You are an expert 3D Technical Artist. The user wants to generate a 3D model in Blender. Ask 1 or 2 brief clarifying questions about geometry, lighting, or modifiers to refine their idea into a highly descriptive, single-paragraph prompt. Do NOT write code. Only refine the visual description.`;

// ─── Wasp Action ────────────────────────────────────────────────────
export const chat: Chat<ChatPayload, { role: string; content: string; [key: string]: any }> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED');
  }

  // 1. Validate Input
  const result = ChatInputSchema.safeParse(args);
  if (!result.success) {
    throw new HttpError(400, 'INVALID_INPUT', { errors: result.error.format() });
  }

  // 2. Enforce Rate Limit
  checkRateLimit(`chat:${context.user.id}`, CHAT_LIMIT);

  // 3. Guard against Prompt Injection
  // We apply prompt guard to the last user message
  const lastUserMessage = [...args.messages].reverse().find(m => m.role === 'user')?.content || '';
  if (lastUserMessage) {
    guardPrompt(lastUserMessage);
  }

  // 3.5. Strict Dual-Model Segregation Check
  // Ensure the local chat route CANNOT trigger the cloud Gemini model.
  if (OLLAMA_MODEL.toLowerCase().includes('gemini') || OLLAMA_HOST.includes('generativelanguage')) {
    throw new HttpError(403, 'DUAL_MODEL_VIOLATION', { message: 'Chat feature is restricted to local models only. Gemini invocation is blocked.' });
  }

  // 4. Context Window Management — handled by the schema max length (10 messages)
  
  // 4.5. RAG Pipeline Integration: Augment the prompt with Blender-specific context
  const augmentedContext = await retrieveBlenderContext(lastUserMessage);
  const RAG_SYSTEM_PROMPT = `${INTERVIEWER_SYSTEM_PROMPT}\n\n[RAG_CONTEXT - BLENDER API GUIDELINES]\n${augmentedContext}`;

  // 5. Build the full message array for Ollama
  const messages: ChatMessage[] = [
    { role: 'system', content: RAG_SYSTEM_PROMPT },
    ...args.messages,
  ];

  // 6. Call Local Ollama (Qwen) via ollama REST API
  try {
    const response = await axios.post(`${OLLAMA_HOST}/api/chat`, {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
    }, {
      timeout: 60_000, // 60s timeout for local model inference
    });

    return {
      role: 'assistant',
      content: encodeHtml(response.data.message.content),
    };
  } catch (error: any) {
    console.error('OLLAMA_API_ERROR:', error?.message || error);

    // Provide a helpful fallback if Ollama is unreachable during development
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return {
        role: 'assistant',
        content: encodeHtml(`⚠️ OLLAMA_OFFLINE: Cannot connect to the local AI interviewer at ${OLLAMA_HOST}. Please ensure:\n1. Ollama is running (ollama serve)\n2. The ${OLLAMA_MODEL} model is pulled (ollama pull ${OLLAMA_MODEL})`),
      };
    }

    throw new HttpError(500, 'AI_SERVICE_UNAVAILABLE');
  }
};
