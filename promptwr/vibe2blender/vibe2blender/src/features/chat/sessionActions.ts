// @ts-nocheck
import { type CreateChatSession } from 'wasp/server/operations';
import { type ChatSession, type ChatMessage } from 'wasp/entities';

type CreateSessionPayload = {
  title?: string;
  initialMessage?: { role: 'user' | 'assistant'; content: string };
};

export const createChatSession: CreateChatSession<CreateSessionPayload, ChatSession> = async (args, context) => {
  if (!context.user) throw new Error('Not authorized');

  const session = await context.entities.ChatSession.create({
    data: {
      title: args.title || 'New Blender Project',
      userId: context.user.id,
      messages: args.initialMessage ? {
        create: {
          role: args.initialMessage.role,
          content: args.initialMessage.content,
        }
      } : undefined,
    },
    include: {
      messages: true,
    }
  });

  return session;
};
