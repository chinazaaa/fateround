import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isPublicPost, sortPostsByPublished, type BlogPost } from '@/lib/blog'

/**
 * Public blog reads. Uses the service-role client (like product-updates-server) and applies
 * the published/not-future filter in code — service role bypasses RLS, so the visibility rule
 * must live here, not rely on the policy.
 */
export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('blog_posts').select('*')
  if (error) throw new Error(error.message)
  const posts = (data ?? []) as BlogPost[]
  return sortPostsByPublished(posts.filter((post) => isPublicPost(post)))
}

/** A single public post by slug, or null if it doesn't exist or isn't publicly visible yet. */
export async function fetchPublishedPost(slug: string): Promise<BlogPost | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('blog_posts').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  const post = data as BlogPost | null
  if (!post || !isPublicPost(post)) return null
  return post
}

/** Every published slug — for generateStaticParams / sitemap. */
export async function fetchPublishedSlugs(): Promise<string[]> {
  const posts = await fetchPublishedPosts()
  return posts.map((post) => post.slug)
}
