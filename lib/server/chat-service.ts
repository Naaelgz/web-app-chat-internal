import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from '@neondatabase/serverless';
import type { PublicUser } from './database';

export type ChatMessageRecord = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  isRead: boolean;
};

export type ChatRecord = {
  id: string;
  participants: string[];
  updatedAt: string;
  messages: ChatMessageRecord[];
  contact: PublicUser;
  unreadCount: number;
  online: boolean;
};

type ContactRow = PublicUser & { updated_at: Date | string };

export async function getConversationForUser(
  database: Pool,
  conversationId: string,
  userId: string,
  markRead = false,
): Promise<ChatRecord | null> {
  const contactResult = await database.query<ContactRow>(
    `SELECT users.id, users.name, users.email, conversations.updated_at
     FROM conversations
     JOIN conversation_members mine ON mine.conversation_id = conversations.id AND mine.user_id = $2
     JOIN conversation_members other ON other.conversation_id = conversations.id AND other.user_id != $2
     JOIN users ON users.id = other.user_id
     WHERE conversations.id = $1
     LIMIT 1`,
    [conversationId, userId],
  );
  const contactRow = contactResult.rows[0];
  if (!contactRow) return null;

  if (markRead) {
    await database.query(
      'UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE',
      [conversationId, userId],
    );
  }

  const [messagesResult, unreadResult, presenceResult] = await Promise.all([
    database.query<{
      id: string;
      sender_id: string;
      body: string;
      created_at: Date | string;
      is_read: boolean;
    }>(
      `SELECT id, sender_id, body, created_at, is_read
       FROM messages WHERE conversation_id = $1 ORDER BY created_at, id`,
      [conversationId],
    ),
    database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE',
      [conversationId, userId],
    ),
    database.query<{ online: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM presence
         WHERE user_id = $1 AND last_seen_at > NOW() - INTERVAL '15 seconds'
       ) AS online`,
      [contactRow.id],
    ),
  ]);

  return {
    id: conversationId,
    participants: [userId, contactRow.id],
    updatedAt: new Date(contactRow.updated_at).toISOString(),
    contact: { id: contactRow.id, name: contactRow.name, email: contactRow.email },
    unreadCount: Number(unreadResult.rows[0].count),
    online: presenceResult.rows[0].online,
    messages: messagesResult.rows.map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      text: message.body,
      createdAt: new Date(message.created_at).toISOString(),
      isRead: message.is_read,
    })),
  };
}

export async function listConversationsForUser(database: Pool, userId: string, activeId?: string) {
  if (activeId) await getConversationForUser(database, activeId, userId, true);

  const conversations = await database.query<{ id: string }>(
    `SELECT conversations.id
     FROM conversations
     JOIN conversation_members ON conversation_members.conversation_id = conversations.id
     WHERE conversation_members.user_id = $1
     ORDER BY conversations.updated_at DESC`,
    [userId],
  );

  const chatResults = await Promise.all(
    conversations.rows.map(({ id }) => getConversationForUser(database, id, userId)),
  );
  return chatResults.filter((conversation): conversation is ChatRecord => conversation !== null);
}

export async function createOrGetConversation(database: Pool, userId: string, otherUserId: string) {
  const [userA, userB] = [userId, otherUserId].sort();
  const conversationId = randomUUID();

  await database.query(
    `INSERT INTO conversations (id, user_a_id, user_b_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_a_id, user_b_id) DO NOTHING`,
    [conversationId, userA, userB],
  );

  const existing = await database.query<{ id: string }>(
    'SELECT id FROM conversations WHERE user_a_id = $1 AND user_b_id = $2',
    [userA, userB],
  );
  const actualId = existing.rows[0].id;

  await database.query(
    `INSERT INTO conversation_members (conversation_id, user_id)
     VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
    [actualId, userA, userB],
  );

  return actualId;
}

export async function addMessage(
  database: Pool,
  conversationId: string,
  senderId: string,
  text: string,
) {
  const connection: PoolClient = await database.connect();
  const id = randomUUID();
  try {
    await connection.query('BEGIN');
    const inserted = await connection.query<{ created_at: Date | string }>(
      `INSERT INTO messages (id, conversation_id, sender_id, body, is_read)
       VALUES ($1, $2, $3, $4, FALSE) RETURNING created_at`,
      [id, conversationId, senderId, text],
    );
    await connection.query(
      'UPDATE conversations SET updated_at = $1 WHERE id = $2',
      [inserted.rows[0].created_at, conversationId],
    );
    await connection.query('COMMIT');
    return {
      id,
      senderId,
      text,
      createdAt: new Date(inserted.rows[0].created_at).toISOString(),
      isRead: false,
    } satisfies ChatMessageRecord;
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}