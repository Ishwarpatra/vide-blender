import { type Chat } from 'wasp/server/operations';
import { HttpError } from 'wasp/server';
import axios from 'axios';
import { checkRateLimit, CHAT_LIMIT } from '../../backend/core/rateLimiter';
import { ChatInputSchema } from '../../backend/core/validators';
import { guardPrompt } from '../../backend/core/promptGuard';

// ─── Type Definitions ───────────────────────────────────────────────
type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  [key: string]: any;
}

type ChatPayload = {
  message: string;
  conversationHistory?: ChatMessage[];
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

/**
 * Context Window Management:
 * Slices the conversation history to only the last 6 messages
 * to avoid sending too much context to the local model and
 * preventing context window bloat.
 */
const sliceConversationWindow = (history: ChatMessage[], maxMessages = 6): ChatMessage[] => {
  return history.slice(-maxMessages);
};

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
  const guardedPrompt = guardPrompt(args.message);

  // 4. Context Window Management — keep only last 6 messages
  const recentHistory = sliceConversationWindow(args.conversationHistory || []);

  // 5. Build the full message array for Ollama
  const messages: ChatMessage[] = [
    { role: 'system', content: INTERVIEWER_SYSTEM_PROMPT },
    ...recentHistory,
    { role: 'user', content: guardedPrompt },
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
      content: response.data.message.content,
    };
  } catch (error: any) {
    console.error('OLLAMA_API_ERROR:', error?.message || error);

    // Provide a helpful fallback if Ollama is unreachable during development
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return {
        role: 'assistant',
        content: `⚠️ OLLAMA_OFFLINE: Cannot connect to the local AI interviewer at ${OLLAMA_HOST}. Please ensure:\n1. Ollama is running (ollama serve)\n2. The ${OLLAMA_MODEL} model is pulled (ollama pull ${OLLAMA_MODEL})`,
      };
    }

    throw new HttpError(500, 'AI_SERVICE_UNAVAILABLE');
  }
};
