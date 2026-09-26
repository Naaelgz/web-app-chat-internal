import { getAuthenticatedUser, unauthorizedResponse } from '../../../../lib/server/auth';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  return Response.json({ user });
}