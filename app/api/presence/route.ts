import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/server/auth';
import { getDatabase } from '../../../lib/server/database';
import { publishUserEvent } from '../../../lib/server/realtime';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  let body: { online?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const database = await getDatabase();
  const isOnline = body.online === true;
  const currentPresence = await database.query<{ last_seen_at: Date | string }>(
    'SELECT last_seen_at FROM presence WHERE user_id = $1',
    [user.id],
  );
  const lastSeen = currentPresence.rows[0]?.last_seen_at;
  const wasOnline = Boolean(lastSeen && Date.now() - new Date(lastSeen).getTime() < 75_000);

  if (isOnline) {
    await database.query(
      `INSERT INTO presence (user_id, last_seen_at) VALUES ($1, NOW())
       ON CONFLICT(user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
      [user.id],
    );
  } else {
    await database.query('DELETE FROM presence WHERE user_id = $1', [user.id]);
  }

  if (wasOnline !== isOnline) {
    const contacts = await database.query<{ user_id: string }>(
      `SELECT DISTINCT other.user_id
       FROM conversation_members mine
       JOIN conversation_members other ON other.conversation_id = mine.conversation_id
       WHERE mine.user_id = $1 AND other.user_id != $1`,
      [user.id],
    );
    await publishUserEvent(contacts.rows.map((contact) => contact.user_id), { type: 'presence.updated' });
  }

  return Response.json({ ok: true });
}