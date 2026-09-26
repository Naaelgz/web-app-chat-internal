import { createHash } from 'node:crypto';
import type { Pool } from '@neondatabase/serverless';
import { createOrGetConversation } from './chat-service';

const AUTO_REPLY_TEXT = 'Pesan saya sudah diterima, terima kasih.';
const LEGACY_SEED_MESSAGES = new Set([
  'u1\u0000Halo Bob, ada update untuk proyek hari ini?',
  'u2\u0000Sudah, saya akan kirim ringkasannya nanti siang.',
]);

export type LegacyImportResult = {
  importedConversations: number;
  importedMessages: number;
  skippedConversations: number;
  skippedMessages: number;
  affectedUserIds: string[];
};

type LegacyMessageInput = {
  id?: unknown;
  senderId?: unknown;
  text?: unknown;
  createdAt?: unknown;
  isRead?: unknown;
};

type LegacyChatInput = {
  id?: unknown;
  participants?: unknown;
  messages?: unknown;
};

export async function importLegacyChats(
  database: Pool,
  legacyChats: unknown[],
  importingUserId?: string,
): Promise<LegacyImportResult> {
  const result: LegacyImportResult = {
    importedConversations: 0,
    importedMessages: 0,
    skippedConversations: 0,
    skippedMessages: 0,
    affectedUserIds: [],
  };

  const affectedUsers = new Set<string>();
  let totalMessages = 0;

  for (const candidate of legacyChats.slice(0, 500)) {
    const chat = candidate as LegacyChatInput;
    if (!Array.isArray(chat.participants) || chat.participants.length !== 2) {
      result.skippedConversations += 1;
      continue;
    }

    const participantIds = chat.participants;
    if (
      participantIds.some((id) => typeof id !== 'string' || id.length > 128) ||
      participantIds[0] === participantIds[1] ||
      (importingUserId && !participantIds.includes(importingUserId))
    ) {
      result.skippedConversations += 1;
      continue;
    }

    const users = await database.query<{ id: string }>(
      'SELECT id FROM users WHERE id = ANY($1::text[])',
      [participantIds],
    );
    if (users.rows.length !== 2) {
      result.skippedConversations += 1;
      continue;
    }

    const [userA, userB] = [...participantIds].sort();
    const conversationId = await createOrGetConversation(database, userA, userB);
    result.importedConversations += 1;
    affectedUsers.add(userA);
    affectedUsers.add(userB);

    if (!Array.isArray(chat.messages)) continue;
    for (const [messageIndex, candidateMessage] of chat.messages.entries()) {
      totalMessages += 1;
      if (totalMessages > 20_000) {
        result.skippedMessages += chat.messages.length - messageIndex;
        break;
      }

      const message = candidateMessage as LegacyMessageInput;
      const senderId = message.senderId;
      const text = message.text;
      if (
        typeof senderId !== 'string' ||
        !participantIds.includes(senderId) ||
        typeof text !== 'string' ||
        !text.trim() ||
        text.length > 4000 ||
        text === AUTO_REPLY_TEXT
      ) {
        result.skippedMessages += 1;
        continue;
      }

      const parsedDate = typeof message.createdAt === 'string' ? new Date(message.createdAt) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        result.skippedMessages += 1;
        continue;
      }

      if (LEGACY_SEED_MESSAGES.has(`${senderId}\u0000${text}`)) {
        const existingSeed = await database.query(
          'SELECT 1 FROM messages WHERE conversation_id = $1 AND sender_id = $2 AND body = $3 LIMIT 1',
          [conversationId, senderId, text],
        );
        if (existingSeed.rows.length > 0) {
          result.skippedMessages += 1;
          continue;
        }
      }

      const legacyId = typeof message.id === 'string' && message.id.length <= 256
        ? message.id
        : `${senderId}:${parsedDate.toISOString()}:${messageIndex}:${text}`;
      const stableId = `legacy-${createHash('sha256')
        .update(`${conversationId}\u0000${legacyId}`)
        .digest('hex')}`;
      const inserted = await database.query(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at, is_read)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [stableId, conversationId, senderId, text, parsedDate, message.isRead === true || message.isRead === 1],
      );

      if (inserted.rowCount) {
        result.importedMessages += 1;
        await database.query(
          'UPDATE conversations SET updated_at = GREATEST(updated_at, $1) WHERE id = $2',
          [parsedDate, conversationId],
        );
      } else {
        result.skippedMessages += 1;
      }
    }
  }

  result.skippedConversations += Math.max(0, legacyChats.length - 500);
  result.affectedUserIds = [...affectedUsers];
  return result;
}