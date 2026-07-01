import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { POST_CODE_MIN_LENGTH } from '@/lib/manager-constants'
import { postCodeIsSet, setPostCode } from '@/lib/community-post-code'
import { hasServiceRoleKey } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required.' }, { status: 503 })
  }
  return NextResponse.json({ configured: await postCodeIsSet() })
}

// Set or rotate the weekly winner post code. Stores only the hash.
export async function POST(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required.' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (code.length < POST_CODE_MIN_LENGTH) {
    return NextResponse.json({ error: `Code must be at least ${POST_CODE_MIN_LENGTH} characters` }, { status: 400 })
  }

  try {
    await setPostCode(code)
    return NextResponse.json({ success: true, configured: true })
  } catch (err) {
    return NextResponse.json(
      { error: internalErrorMessage('admin/community/post-code', err, 'Failed to set code') },
      { status: 500 }
    )
  }
}
