import { cookies } from 'next/headers';
import { getDatabase, hashSessionToken } from '../../../../lib/server/database';
import { SESSION_COOKIE } from '../../../../lib/server/auth';
import { publishUserEvent } from '../../../../lib/server/realtime';

export const runtime = 'nodejs';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const database = await getDatabase();
    const session = await database.query<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE token_hash = $1',
      [hashSessionToken(token)],
    );
    await database.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    if (session.rows[0]) {
      const userId = session.rows[0].user_id;
      const contacts = await database.query<{ user_id: string }>(
        `SELECT DISTINCT other.user_id
         FROM conversation_members mine
         JOIN conversation_members other ON other.conversation_id = mine.conversation_id
         WHERE mine.user_id = $1 AND other.user_id != $1`,
        [userId],
      );
      await database.query('DELETE FROM presence WHERE user_id = $1', [userId]);
      await publishUserEvent(contacts.rows.map((contact) => contact.user_id), { type: 'presence.updated' });
    }
  }
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}