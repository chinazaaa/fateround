import { NextRequest, NextResponse } from 'next/server'
import { assertManagerRequest } from '@/lib/manager-api'
import { managerCodeIsSet } from '@/lib/manager-session'

// Lets the /input page decide what to render: the login card, the entry form,
// or a "no code configured yet" notice.
export async function GET(req: NextRequest) {
  const session = await assertManagerRequest(req)
  const codeConfigured = await managerCodeIsSet()
  return NextResponse.json({ authed: Boolean(session), codeConfigured })
}
