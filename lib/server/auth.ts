import { cookies } from 'next/headers';
import { getDatabase, hashSessionToken, type PublicUser } from './database';

export const SESSION_COOKIE = 'akselera_session';

export async function getAuthenticatedUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const database = await getDatabase();
  const result = await database.query<PublicUser>(
    `SELECT users.id, users.name, users.email
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
    [hashSessionToken(token)],
  );

  return result.rows[0] ?? null;
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}