import { getAuthenticatedUser, unauthorizedResponse } from '../../../../lib/server/auth';
import { addMessage, getConversationForUser } from '../../../../lib/server/chat-service';
import { getDatabase } from '../../../../lib/server/database';
import { publishUserEvent } from '../../../../lib/server/realtime';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { chatId } = await params;
  const database = await getDatabase();
  const markRead = new URL(request.url).searchParams.get('markRead') === 'true';
  const chat = await getConversationForUser(database, chatId, user.id, markRead);
  if (!chat) return Response.json({ error: 'Chat tidak ditemukan.' }, { status: 404 });
  return Response.json({ chat });
}

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text || text.length > 4000) {
    return Response.json({ error: 'Pesan harus berisi 1 sampai 4000 karakter.' }, { status: 400 });
  }

  const { chatId } = await params;
  const database = await getDatabase();
  const chat = await getConversationForUser(database, chatId, user.id);
  if (!chat) return Response.json({ error: 'Chat tidak ditemukan.' }, { status: 404 });

  await addMessage(database, chatId, user.id, text);
  await publishUserEvent(chat.participants, { type: 'message.created', chatId });

  return Response.json({ ok: true }, { status: 201 });
}