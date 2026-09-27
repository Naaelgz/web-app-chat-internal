import { randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../../../../lib/server/auth';
import { getDatabase, hashPassword, hashSessionToken, type PublicUser } from '../../../../lib/server/database';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Data registrasi tidak valid.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ error: 'Data registrasi tidak valid.' }, { status: 400 });
  }

  const input = body as { name?: unknown; email?: unknown; password?: unknown };
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (name.length < 2 || name.length > 80) {
    return Response.json({ error: 'Nama harus terdiri dari 2 sampai 80 karakter.' }, { status: 400 });
  }
  if (email.length > 254 || !validEmail) {
    return Response.json({ error: 'Masukkan alamat email yang valid.' }, { status: 400 });
  }
  if (password.length < 8 || password.length > 256) {
    return Response.json({ error: 'Password harus terdiri dari 8 sampai 256 karakter.' }, { status: 400 });
  }

  const database = await getDatabase();
  const existingUser = await database.query<{ id: string }>(
    'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
    [email],
  );
  if (existingUser.rows.length > 0) {
    return Response.json({ error: 'Email sudah terdaftar.' }, { status: 409 });
  }

  const userId = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const createdUser = await database.query<PublicUser>(
    `INSERT INTO users (id, name, email, password_salt, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id, name, email`,
    [userId, name, email, salt, hashPassword(password, salt)],
  );
  const user = createdUser.rows[0];
  if (!user) {
    return Response.json({ error: 'Email sudah terdaftar.' }, { status: 409 });
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await database.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashSessionToken(token), user.id, expiresAt],
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return Response.json({ user });
}