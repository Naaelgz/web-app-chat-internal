import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/server/auth';
import { getDatabase, type PublicUser } from '../../../lib/server/database';

export const runtime = 'nodejs';

export async function GET() {
  const currentUser = await getAuthenticatedUser();
  if (!currentUser) return unauthorizedResponse();

  const database = await getDatabase();
  const result = await database.query<PublicUser>(
    'SELECT id, name, email FROM users WHERE id != $1 ORDER BY name',
    [currentUser.id],
  );
  return Response.json({ users: result.rows });
}