import { getAuthenticatedUser, unauthorizedResponse } from '../../../../lib/server/auth';
import { isRealtimeConfigured } from '../../../../lib/server/realtime';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  return Response.json({ enabled: isRealtimeConfigured() });
}