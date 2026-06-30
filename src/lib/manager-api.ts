import { NextRequest } from 'next/server'
import { managerCookieName, verifyManagerSessionToken } from '@/lib/manager-session'

// Returns the manager session payload, or null when the request is unauthenticated.
export async function assertManagerRequest(req: NextRequest) {
  const token = req.cookies.get(managerCookieName())?.value
  const session = await verifyManagerSessionToken(token)
  if (!session) return null
  return session
}
