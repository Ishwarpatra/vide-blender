// @ts-nocheck
import { type GetScripts } from 'wasp/server/operations';
import { type BlenderScript } from 'wasp/entities';

/**
 * Fetches all BlenderScript records for the authenticated user,
 * ordered newest-first. Used by the Sidebar to display session history.
 */
export const getScripts: GetScripts<void, BlenderScript[]> = async (_args, context) => {
  if (!context.user) {
    return [];
  }
  return context.entities.BlenderScript.findMany({
    where: { userId: context.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50, // cap at 50 most recent sessions
  });
};
