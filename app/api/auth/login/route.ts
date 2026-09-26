import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDatabase, hashSessionToken, verifyPassword, type PublicUser } from '../../../../lib/server/database';
import { SESSION_COOKIE } from '../../../../lib/server/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password || password.length > 256) {
    return Response.json({ error: 'Email dan password wajib diisi.' }, { status: 400 });
  }

  const database = await getDatabase();
  const result = await database.query<PublicUser & { password_salt: string; password_hash: string }>(
    'SELECT id, name, email, password_salt, password_hash FROM users WHERE LOWER(email) = $1',
    [email],
  );
  const user = result.rows[0];

  if (!user || !verifyPassword(password, user)) {
    return Response.json({ error: 'Email atau password salah.' }, { status: 401 });
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await database.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, user.id, expiresAt],
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return Response.json({ user: { id: user.id, name: user.name, email: user.email } });
}