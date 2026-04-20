// @ts-nocheck
import { type GetChatSessions, type GetChatSessionDetails } from 'wasp/server/operations';
import { type ChatSession } from 'wasp/entities';

export const getChatSessions: GetChatSessions<void, ChatSession[]> = async (_args, context) => {
  if (!context.user) return [];

  return context.entities.ChatSession.findMany({
    where: { userId: context.user.id },
    orderBy: { updatedAt: 'desc' },
  });
};

type SessionDetailsResponse = ChatSession & {
  messages: any[];
  blenderScripts: any[];
};

export const getChatSessionDetails: GetChatSessionDetails<{ sessionId: string }, SessionDetailsResponse> = async (args, context) => {
  if (!context.user) throw new Error('Not authorized');
  if (!args.sessionId) return null as any;

  const session = await context.entities.ChatSession.findUnique({
    where: { id: args.sessionId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      blenderScripts: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!session || session.userId !== context.user.id) {
    throw new Error('Session not found or inaccessible');
  }

  return session;
};
