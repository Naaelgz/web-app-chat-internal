import * as Ably from 'ably';

type RealtimeGlobal = typeof globalThis & {
  ablyRest?: Ably.Rest;
};

const realtimeGlobal = globalThis as RealtimeGlobal;

export function isRealtimeConfigured() {
  return Boolean(process.env.ABLY_API_KEY);
}

function getAblyRest() {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;

  if (!realtimeGlobal.ablyRest) {
    realtimeGlobal.ablyRest = new Ably.Rest({ key });
  }
  return realtimeGlobal.ablyRest;
}

export async function createUserTokenRequest(userId: string) {
  const ably = getAblyRest();
  if (!ably) return null;

  return ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify({ [`user:${userId}`]: ['subscribe'] }),
    ttl: 30 * 60 * 1000,
  });
}

export async function publishUserEvent(userIds: string[], data: { type: string; chatId?: string }) {
  const ably = getAblyRest();
  if (!ably) return;

  await Promise.all(
    [...new Set(userIds)].map(async (userId) => {
      try {
        await ably.channels.get(`user:${userId}`).publish({ name: 'chat.updated', data });
      } catch (error) {
        console.error('Unable to publish realtime chat update', error);
      }
    }),
  );
}