import { getAuthenticatedUser, unauthorizedResponse } from '../../../../lib/server/auth';
import { createUserTokenRequest } from '../../../../lib/server/realtime';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const tokenRequest = await createUserTokenRequest(user.id);
  if (!tokenRequest) {
    return Response.json({ error: 'Realtime belum dikonfigurasi.' }, { status: 503 });
  }

  return Response.json(tokenRequest, {
    headers: { 'Cache-Control': 'no-store' },
  });
}