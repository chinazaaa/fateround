import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { createBlogPostSchema } from '@/lib/validation'
import { sortPostsForAdmin } from '@/lib/blog'

const SERVICE_ROLE_ERROR = 'SUPABASE_SERVICE_ROLE_KEY is required to manage blog posts.'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: SERVICE_ROLE_ERROR }, { status: 503 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('blog_posts').select('*')
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/blog', error) }, { status: 500 })

  return NextResponse.json({ posts: sortPostsForAdmin(data ?? []) })
}

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: SERVICE_ROLE_ERROR }, { status: 503 })

  const { data: body, error: bodyError } = await parseJsonBody(req, createBlogPostSchema)
  if (bodyError) return bodyError

  const status = body.status ?? 'draft'
  // Stamp a publish time the moment a post first goes live, unless one was given.
  const publishedAt =
    body.publishedAt !== undefined && body.publishedAt !== null
      ? body.publishedAt
      : status === 'published'
        ? new Date().toISOString()
        : null

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      slug: body.slug,
      title: body.title,
      excerpt: body.excerpt,
      body: body.body,
      cover_image_url: body.coverImageUrl ?? null,
      author: body.author ?? 'Fate Round',
      tags: body.tags ?? [],
      status,
      pinned: body.pinned ?? false,
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    // 23505 = unique_violation on the slug.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A post with that slug already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: internalErrorMessage('admin/blog', error) }, { status: 500 })
  }

  // Only one post is featured at a time — if this one was pinned, clear the rest.
  if (data.pinned) await supabase.from('blog_posts').update({ pinned: false }).neq('id', data.id)

  return NextResponse.json({ post: data }, { status: 201 })
}
