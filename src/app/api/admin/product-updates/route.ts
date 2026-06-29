import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { sortProductUpdates } from '@/lib/product-updates'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { createProductUpdateSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required to manage product updates.' },
      { status: 503 }
    )
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('product_updates').select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updates: sortProductUpdates(data ?? []) })
}

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required to manage product updates.' },
      { status: 503 }
    )
  }

  const { data: body, error: bodyError } = await parseJsonBody(req, createProductUpdateSchema)
  if (bodyError) return bodyError

  const { type, title, description, month, year, sortOrder } = body
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('product_updates')
    .insert({
      type,
      title,
      description,
      month,
      year,
      sort_order: sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ update: data }, { status: 201 })
}
