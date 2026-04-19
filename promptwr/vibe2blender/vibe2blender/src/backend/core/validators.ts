import { z } from 'zod';

const SanitizeString = z.string()
  .trim()
  .min(1, { message: "Prompt cannot be empty." })
  .max(1000, { message: "Prompt exceeds the 1000 character limit." });

export const ChatInputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system'], { 
      message: "Invalid role specified."
    }),
    content: SanitizeString
  }))
  .min(1, { message: "Conversation history must have at least one message." })
  .max(10, { message: "Conversation history cannot exceed 10 messages." }),
});

export const GenerationInputSchema = z.object({
  refinedPrompt: SanitizeString
    .min(10, { message: "Refined prompt is too short to generate a meaningful model." })
    .max(500, { message: "Refined prompt must be concise (max 500 characters)." }),
  userId: z.string().uuid({ message: "Invalid User Identifier format." }),
});
