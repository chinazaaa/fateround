import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { updateBlogPostSchema } from '@/lib/validation'
import type { BlogPost } from '@/lib/blog'

type RouteContext = { params: Promise<{ id: string }> }

const SERVICE_ROLE_ERROR = 'SUPABASE_SERVICE_ROLE_KEY is required to manage blog posts.'

export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: SERVICE_ROLE_ERROR }, { status: 503 })

  const { id } = await context.params
  const { data: body, error: bodyError } = await parseJsonBody(req, updateBlogPostSchema)
  if (bodyError) return bodyError

  const supabase = getSupabaseAdmin()

  // Need the current row to decide the publish timestamp: a post going from draft → published
  // for the first time should be stamped now, but an already-published post keeps its date.
  const { data: existing, error: fetchError } = await supabase
    .from('blog_posts')
    .select('status, published_at')
    .eq('id', id)
    .maybeSingle<Pick<BlogPost, 'status' | 'published_at'>>()

  if (fetchError)
    return NextResponse.json({ error: internalErrorMessage('admin/blog/id', fetchError) }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.slug !== undefined) payload.slug = body.slug
  if (body.title !== undefined) payload.title = body.title
  if (body.excerpt !== undefined) payload.excerpt = body.excerpt
  if (body.body !== undefined) payload.body = body.body
  if (body.coverImageUrl !== undefined) payload.cover_image_url = body.coverImageUrl ?? null
  if (body.author !== undefined) payload.author = body.author
  if (body.tags !== undefined) payload.tags = body.tags

  const nextStatus = body.status ?? existing.status
  if (body.status !== undefined) payload.status = body.status

  if (body.publishedAt !== undefined) {
    // Explicit value from the admin (including null to clear it).
    payload.published_at = body.publishedAt
  } else if (nextStatus === 'published' && !existing.published_at) {
    // First time going live with no date supplied — stamp now.
    payload.published_at = new Date().toISOString()
  }

  const { data, error } = await supabase.from('blog_posts').update(payload).eq('id', id).select('*').single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A post with that slug already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: internalErrorMessage('admin/blog/id', error) }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  return NextResponse.json({ post: data })
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: SERVICE_ROLE_ERROR }, { status: 503 })

  const { id } = await context.params
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)

  if (error) return NextResponse.json({ error: internalErrorMessage('admin/blog/id', error) }, { status: 500 })

  return NextResponse.json({ ok: true })
}
