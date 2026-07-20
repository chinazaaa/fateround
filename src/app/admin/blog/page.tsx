'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Chip } from '@/components/ui/PageShell'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  BLOG_STATUS_META,
  BLOG_STATUS_OPTIONS,
  formatPostDate,
  slugifyTitle,
  type BlogPost,
  type BlogStatus,
} from '@/lib/blog'

type FormState = {
  slug: string
  title: string
  excerpt: string
  body: string
  coverImageUrl: string
  author: string
  tags: string
  status: BlogStatus
  pinned: boolean
  publishedAt: string
}

const EMPTY_FORM: FormState = {
  slug: '',
  title: '',
  excerpt: '',
  body: '',
  coverImageUrl: '',
  author: 'Fate Round',
  tags: '',
  status: 'draft',
  pinned: false,
  publishedAt: '',
}

/** DB ISO timestamp → value for a <input type="datetime-local"> (local, no seconds). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toFormState(post: BlogPost): FormState {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    coverImageUrl: post.cover_image_url ?? '',
    author: post.author,
    tags: post.tags.join(', '),
    status: post.status,
    pinned: post.pinned,
    publishedAt: isoToLocalInput(post.published_at),
  }
}

function payloadFromForm(form: FormState) {
  const tags = form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return {
    slug: form.slug.trim() || slugifyTitle(form.title),
    title: form.title,
    excerpt: form.excerpt,
    body: form.body,
    coverImageUrl: form.coverImageUrl.trim(),
    author: form.author.trim() || 'Fate Round',
    tags,
    status: form.status,
    pinned: form.pinned,
    // datetime-local has no timezone; toISOString serialises it as the admin's local time.
    publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
  }
}

export default function AdminBlogPage() {
  const { confirm } = useConfirm()
  const { success, error } = useToast()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [slugTouched, setSlugTouched] = useState(false)
  const [filter, setFilter] = useState<'all' | BlogStatus>('all')
  const [uploadingCover, setUploadingCover] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/admin/blog')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load posts')
      setPosts(data.posts ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load posts')
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSlugTouched(false)
  }

  const startEdit = (post: BlogPost) => {
    setEditingId(post.id)
    setForm(toFormState(post))
    setSlugTouched(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Auto-fill the slug from the title until the admin edits the slug themselves.
  const onTitleChange = (title: string) => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugTouched ? prev.slug : slugifyTitle(title),
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = payloadFromForm(form)
      const res = await fetch(editingId ? `/api/admin/blog/${editingId}` : '/api/admin/blog', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save post')

      success(editingId ? 'Post saved' : 'Post created')
      resetForm()
      await loadPosts()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to save post')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (post: BlogPost) => {
    const ok = await confirm({
      title: `Delete "${post.title}"?`,
      message: 'This permanently removes the post from the blog.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/blog/${post.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete post')
      success('Post deleted')
      if (editingId === post.id) resetForm()
      await loadPosts()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to delete post')
    }
  }

  // Quick pin/unpin from a list row. The API keeps at most one post pinned, so pinning one
  // here silently unpins whatever was featured before.
  const togglePin = async (post: BlogPost) => {
    try {
      const res = await fetch(`/api/admin/blog/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !post.pinned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update post')
      success(post.pinned ? 'Unpinned' : 'Pinned — now featured on the blog')
      await loadPosts()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to update post')
    }
  }

  // Upload one image file to the blog bucket, returning its public URL (or null on failure).
  const uploadImage = async (file: File): Promise<string | null> => {
    const data = new FormData()
    data.append('file', file)
    try {
      const res = await fetch('/api/admin/blog/images', { method: 'POST', body: data })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      return json.url as string
    } catch (err) {
      error(err instanceof Error ? err.message : 'Image upload failed')
      return null
    }
  }

  // Paste/drop an image into the body: drop a placeholder at the cursor immediately, upload,
  // then swap the placeholder for the real markdown (or remove it on failure). Using a unique
  // token means concurrent uploads and later edits can't corrupt each other's insertion point.
  const insertBodyImage = async (file: File) => {
    const token = `![uploading ${Date.now()}]()`
    const el = bodyRef.current
    const cursor = el ? el.selectionStart : form.body.length
    setForm((prev) => ({
      ...prev,
      body: `${prev.body.slice(0, cursor)}${token}${prev.body.slice(cursor)}`,
    }))

    const url = await uploadImage(file)
    setForm((prev) => ({
      ...prev,
      body: prev.body.replace(token, url ? `![image](${url})` : ''),
    }))
    if (url) success('Image added')
  }

  const onBodyPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const image = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (!image) return // let normal text paste through
    e.preventDefault()
    void insertBodyImage(image)
  }

  const onBodyDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const image = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (!image) return
    e.preventDefault()
    void insertBodyImage(image)
  }

  const onCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setUploadingCover(true)
    const url = await uploadImage(file)
    setUploadingCover(false)
    if (url) {
      setForm((prev) => ({ ...prev, coverImageUrl: url }))
      success('Cover image uploaded')
    }
  }

  const visiblePosts = filter === 'all' ? posts : posts.filter((p) => p.status === filter)
  const canSave = !saving && form.title.trim() && form.excerpt.trim() && form.body.trim() && form.slug.trim()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight gradient-title">Blog</h1>
          <p className="text-muted text-sm mt-1">Write and manage the articles at /blog</p>
        </div>
        <a href="/blog" target="_blank" rel="noreferrer" className="btn-secondary text-sm px-4 py-2">
          View public page
        </a>
      </div>

      <div className="glass-card-strong p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">{editingId ? 'Edit post' : 'New post'}</h2>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-ghost text-sm">
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 sm:col-span-2">
            <span className="label-caps">Title</span>
            <input
              value={form.title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="input-field w-full"
              placeholder="The 12 best games to play over a video call"
            />
          </label>

          <label className="block space-y-2 sm:col-span-2">
            <span className="label-caps">Slug</span>
            <input
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true)
                setForm((prev) => ({ ...prev, slug: e.target.value }))
              }}
              className="input-field w-full font-mono text-sm"
              placeholder="best-games-to-play-over-video-call"
            />
            <p className="text-faint text-xs">
              Lives at <span className="font-mono">/blog/{form.slug || 'your-slug'}</span>. Lowercase, hyphenated.
            </p>
          </label>

          <label className="block space-y-2 sm:col-span-2">
            <span className="label-caps">Excerpt</span>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
              className="input-field w-full min-h-20 resize-y"
              placeholder="One or two sentences — shown on the blog index and used as the search/social description."
            />
          </label>

          <label className="block space-y-2 sm:col-span-2">
            <span className="label-caps">Body (Markdown)</span>
            <textarea
              ref={bodyRef}
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              onPaste={onBodyPaste}
              onDrop={onBodyDrop}
              className="input-field w-full min-h-64 resize-y font-mono text-sm"
              placeholder={'## A heading\n\nA paragraph with a [link](/games).\n\n- a list item\n- another'}
            />
            <p className="text-faint text-xs">
              Supports Markdown: ## headings, **bold**, [links](/games), ![images](url), lists, quotes, tables. Raw HTML
              is ignored. <strong>Paste or drag an image straight in</strong> and it uploads automatically.
            </p>
          </label>

          <div className="block space-y-2 sm:col-span-2">
            <span className="label-caps">Cover image (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={form.coverImageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, coverImageUrl: e.target.value }))}
                className="input-field min-w-0 flex-1"
                placeholder="Paste a URL, or upload →"
              />
              <label className="btn-secondary shrink-0 cursor-pointer text-sm px-3 py-2">
                {uploadingCover ? 'Uploading…' : 'Upload'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={onCoverFile}
                  disabled={uploadingCover}
                  className="hidden"
                />
              </label>
            </div>
            {form.coverImageUrl && (
              <img
                src={form.coverImageUrl}
                alt=""
                className="mt-1 h-24 w-full max-w-xs rounded-lg object-cover"
                style={{ border: '1px solid var(--border)' }}
              />
            )}
          </div>

          <label className="block space-y-2">
            <span className="label-caps">Author</span>
            <input
              value={form.author}
              onChange={(e) => setForm((prev) => ({ ...prev, author: e.target.value }))}
              className="input-field w-full"
              placeholder="Fate Round"
            />
          </label>

          <label className="block space-y-2">
            <span className="label-caps">Tags (comma-separated)</span>
            <input
              value={form.tags}
              onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
              className="input-field w-full"
              placeholder="guides, party-games"
            />
          </label>

          <label className="block space-y-2">
            <span className="label-caps">Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as BlogStatus }))}
              className="input-field w-full"
            >
              {BLOG_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {BLOG_STATUS_META[status].label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="label-caps">Publish date</span>
            <input
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => setForm((prev) => ({ ...prev, publishedAt: e.target.value }))}
              className="input-field w-full"
            />
            <p className="text-faint text-xs">
              Leave blank to stamp now when you publish. A future date hides it until then.
            </p>
          </label>

          <label className="flex items-start gap-2.5 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((prev) => ({ ...prev, pinned: e.target.checked }))}
              className="mt-0.5 h-4 w-4"
            />
            <span className="space-y-1">
              <span className="label-caps block">📌 Feature this post</span>
              <span className="text-faint block text-xs">
                Pins it to the top of /blog as the highlighted post. Only one post can be featured — this replaces any
                current one.
              </span>
            </span>
          </label>
        </div>

        <button type="button" onClick={save} disabled={!canSave} className="btn-primary">
          {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create post'}
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-muted text-sm font-medium">Filter by status</p>
        <div className="flex flex-wrap gap-2">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          {BLOG_STATUS_OPTIONS.map((status) => (
            <Chip key={status} active={filter === status} onClick={() => setFilter(status)}>
              {BLOG_STATUS_META[status].label}
            </Chip>
          ))}
        </div>
      </div>

      {loading && <p className="text-muted">Loading posts…</p>}
      {loadError && <p className="text-red-500">{loadError}</p>}

      {!loading && !loadError && (
        <div className="glass-card-strong overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
            <h2 className="font-bold">Posts</h2>
            <span className="text-muted text-sm">{visiblePosts.length} shown</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {visiblePosts.length === 0 ? (
              <p className="px-5 py-10 text-center text-muted">No posts yet</p>
            ) : (
              visiblePosts.map((post) => (
                <article key={post.id} className="px-5 py-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`chip ${post.status === 'published' ? 'chip-active' : ''}`}>
                          {BLOG_STATUS_META[post.status].label}
                        </span>
                        {post.pinned && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                              color: 'var(--primary)',
                            }}
                          >
                            📌 Featured
                          </span>
                        )}
                        {post.published_at ? (
                          <span className="text-faint">{formatPostDate(post.published_at)}</span>
                        ) : (
                          <span className="text-faint">No date</span>
                        )}
                        <span className="text-faint font-mono">/blog/{post.slug}</span>
                      </div>
                      <h3 className="font-semibold">{post.title}</h3>
                      <p className="text-sm text-muted leading-relaxed">{post.excerpt}</p>
                      {post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {post.tags.map((tag) => (
                            <span key={tag} className="text-faint text-xs">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePin(post)}
                        className="btn-ghost text-sm px-3 py-1.5"
                        title={post.pinned ? 'Remove from featured' : 'Feature on the blog'}
                      >
                        {post.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(post)}
                        className="btn-secondary text-sm px-3 py-1.5"
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => remove(post)} className="btn-ghost text-sm text-red-500">
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
