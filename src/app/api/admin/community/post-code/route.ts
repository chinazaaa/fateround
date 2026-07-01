import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { postCodeIsSet, postCodeLengthError, setPostCode } from '@/lib/community-post-code'
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
  const code = typeof body.code === 'string' ? body.code : ''
  // Validate against the SAME normalized form setPostCode hashes, so borderline
  // input (e.g. "A A A") is rejected as a 400 here rather than throwing a 500.
  const lengthError = postCodeLengthError(code)
  if (lengthError) {
    return NextResponse.json({ error: lengthError }, { status: 400 })
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
