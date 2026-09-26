import { Pool } from '@neondatabase/serverless';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
};

type UserRow = PublicUser & {
  password_salt: string;
  password_hash: string;
};

type NeonGlobal = typeof globalThis & {
  neonPool?: Pool;
  neonInitialization?: Promise<void>;
};

const neonGlobal = globalThis as NeonGlobal;

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

async function initializeDatabase(pool: Pool) {
  const schema = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    'CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)',
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT conversations_distinct_users CHECK (user_a_id < user_b_id),
      CONSTRAINT conversations_unique_pair UNIQUE (user_a_id, user_b_id)
    )`,
    `CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(user_id)',
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_read BOOLEAN NOT NULL DEFAULT FALSE
    )`,
    'CREATE INDEX IF NOT EXISTS messages_conversation_time_idx ON messages(conversation_id, created_at)',
    `CREATE TABLE IF NOT EXISTS presence (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen_at TIMESTAMPTZ NOT NULL
    )`,
  ];

  for (const statement of schema) await pool.query(statement);

  const demoAccounts = [
    { id: 'u1', name: 'Alice', email: 'alice@akselera.tech' },
    { id: 'u2', name: 'Bob', email: 'bob@akselera.tech' },
    { id: 'u-charlie', name: 'Charlie', email: 'charlie@akselera.tech' },
  ];

  for (const account of demoAccounts) {
    const salt = randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO users (id, name, email, password_salt, password_hash)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [account.id, account.name, account.email, salt, hashPassword('password123', salt)],
    );
  }

  const seedConversation = async (
    id: string,
    participantIds: [string, string],
    messages: Array<[string, string, string, boolean]>,
  ) => {
    const [userA, userB] = [...participantIds].sort();
    await pool.query(
      `INSERT INTO conversations (id, user_a_id, user_b_id)
       VALUES ($1, $2, $3) ON CONFLICT (user_a_id, user_b_id) DO NOTHING`,
      [id, userA, userB],
    );
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM conversations WHERE user_a_id = $1 AND user_b_id = $2',
      [userA, userB],
    );
    const conversationId = existing.rows[0].id;

    for (const userId of [userA, userB]) {
      await pool.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [conversationId, userId],
      );
    }

    for (const [messageId, senderId, body, isRead] of messages) {
      await pool.query(
        `INSERT INTO messages (id, conversation_id, sender_id, body, is_read)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [messageId, conversationId, senderId, body, isRead],
      );
    }
  };

  await seedConversation('chat-alice-bob', ['u1', 'u2'], [
    ['seed-message-1', 'u1', 'Halo Bob, ada update untuk proyek hari ini?', true],
    ['seed-message-2', 'u2', 'Sudah, saya akan kirim ringkasannya nanti siang.', false],
  ]);
  await seedConversation('chat-alice-charlie', ['u1', 'u-charlie'], []);
  await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
}

export async function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Add your managed PostgreSQL connection string to .env.local.');
  }

  if (!neonGlobal.neonPool) {
    neonGlobal.neonPool = new Pool({ connectionString, max: 5 });
  }

  if (!neonGlobal.neonInitialization) {
    neonGlobal.neonInitialization = initializeDatabase(neonGlobal.neonPool).catch((error: unknown) => {
      neonGlobal.neonInitialization = undefined;
      throw error;
    });
  }

  await neonGlobal.neonInitialization;
  return neonGlobal.neonPool;
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyPassword(password: string, user: UserRow) {
  const candidate = Buffer.from(hashPassword(password, user.password_salt), 'hex');
  const expected = Buffer.from(user.password_hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}