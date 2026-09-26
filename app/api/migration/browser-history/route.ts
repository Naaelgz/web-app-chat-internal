import { getAuthenticatedUser, unauthorizedResponse } from '../../../../lib/server/auth';
import { getDatabase } from '../../../../lib/server/database';
import { importLegacyChats } from '../../../../lib/server/legacy-import';
import { publishUserEvent } from '../../../../lib/server/realtime';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 5_000_000) {
    return Response.json({ error: 'Riwayat terlalu besar untuk diimpor sekaligus.' }, { status: 413 });
  }

  let body: { chats?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!Array.isArray(body.chats)) {
    return Response.json({ error: 'Data riwayat tidak valid.' }, { status: 400 });
  }

  const result = await importLegacyChats(await getDatabase(), body.chats, user.id);
  if (result.importedMessages > 0 || result.importedConversations > 0) {
    await publishUserEvent(result.affectedUserIds, { type: 'conversation.updated' });
  }

  return Response.json({
    importedConversations: result.importedConversations,
    importedMessages: result.importedMessages,
    skippedConversations: result.skippedConversations,
    skippedMessages: result.skippedMessages,
  });
}