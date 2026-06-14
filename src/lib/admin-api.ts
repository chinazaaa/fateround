import { NextRequest } from 'next/server'
import { verifyAdminSessionToken } from '@/lib/admin-session'

export async function assertAdminRequest(req: NextRequest) {
  const token = req.cookies.get('admin_session')?.value
  const session = await verifyAdminSessionToken(token)
  if (!session) return null
  return session
}
