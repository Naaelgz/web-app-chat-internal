import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/server/auth';
import { createOrGetConversation, listConversationSummariesForUser } from '../../../lib/server/chat-service';
import { getDatabase } from '../../../lib/server/database';
import { publishUserEvent } from '../../../lib/server/realtime';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const database = await getDatabase();
  const chats = await listConversationSummariesForUser(database, user.id);
  return Response.json({ chats });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const otherUserId = body.userId?.trim();
  if (!otherUserId || otherUserId === user.id) {
    return Response.json({ error: 'Pilih pengguna lain untuk memulai chat.' }, { status: 400 });
  }

  const database = await getDatabase();
  const otherUser = await database.query('SELECT id FROM users WHERE id = $1', [otherUserId]);
  if (otherUser.rows.length === 0) return Response.json({ error: 'User tidak ditemukan.' }, { status: 404 });

  const conversationId = await createOrGetConversation(database, user.id, otherUserId);
  const chats = await listConversationSummariesForUser(database, user.id);
  await publishUserEvent([user.id, otherUserId], { type: 'conversation.updated', chatId: conversationId });
  return Response.json({ chat: chats.find((chat) => chat.id === conversationId) }, { status: 201 });
}