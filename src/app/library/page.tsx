'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { PageShell, Chip } from '@/components/ui/PageShell'

interface PackSummary {
  id: string
  title: string
  game_type:
    | 'trivia'
    | 'would_you_rather'
    | 'most_likely_to'
    | 'this_or_that'
    | 'never_have_i_ever'
    | 'describe_it'
    | 'codewords'
    | 'pick_a_number'
  author_name: string
  description: string | null
  question_count: number
  approved_at: string
  tags: string[]
}

const GAME_TYPE_META: Record<string, { label: string; color: string }> = {
  trivia: { label: 'Trivia', color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/25' },
  would_you_rather: {
    label: 'Would You Rather',
    color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25',
  },
  most_likely_to: {
    label: 'Most Likely To',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
  },
  this_or_that: {
    label: 'This or That',
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/25',
  },
  never_have_i_ever: {
    label: 'Never Have I Ever',
    color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/25',
  },
  describe_it: {
    label: 'Text Charades',
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
  },
  codewords: {
    label: 'Codewords',
    color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25',
  },
  pick_a_number: {
    label: 'Pick a Number',
    color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
  },
}

const TAG_META: Record<string, { label: string; color: string }> = {
  easy: { label: 'Easy', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  intermediate: { label: 'Intermediate', color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/25' },
  advanced: { label: 'Advanced', color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25' },
  'family-friendly': { label: 'Family', color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/25' },
  '18+': { label: '18+', color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/25' },
  party: { label: 'Party', color: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/25' },
  spicy: { label: 'Spicy', color: 'text-red-500 dark:text-red-300 bg-red-500/10 border-red-500/25' },
}

const GAME_TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'trivia', label: 'Trivia' },
  { value: 'would_you_rather', label: 'Would You Rather' },
  { value: 'most_likely_to', label: 'Most Likely To' },
  { value: 'this_or_that', label: 'This or That' },
  { value: 'never_have_i_ever', label: 'Never Have I Ever' },
  { value: 'describe_it', label: 'Text Charades' },
  { value: 'codewords', label: 'Codewords' },
  { value: 'pick_a_number', label: 'Pick a Number' },
]

const TAG_FILTERS = [
  { value: '', label: 'Any level' },
  { value: 'easy', label: 'Easy' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'family-friendly', label: 'Family' },
  { value: '18+', label: '18+' },
  { value: 'party', label: 'Party' },
  { value: 'spicy', label: 'Spicy' },
]

export default function LibraryPage() {
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [gameType, setGameType] = useState('')
  const [tag, setTag] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback((gt: string, tg: string, q: string, pg: number) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (gt) params.set('game_type', gt)
    if (tg) params.set('tag', tg)
    if (q) params.set('q', q)
    params.set('page', String(pg))
    fetch(`/api/library?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setPacks(d.packs ?? [])
        setTotalPages(d.pages ?? 1)
        setTotal(d.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(gameType, tag, search, page)
  }, [gameType, tag, search, page, load])

  const handleGameType = (val: string) => {
    setGameType(val)
    setPage(1)
  }

  const handleTag = (val: string) => {
    setTag(val)
    setPage(1)
  }

  const handleSearchInput = (val: string) => {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(val.trim())
      setPage(1)
    }, 350)
  }

  return (
    <PageShell>
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight gradient-title">Question Library</h1>
            <p className="text-muted text-sm mt-1">Community-made packs for your games</p>
          </div>
          <Link href="/library/submit" className="btn-secondary btn-fit px-4 py-2 text-sm no-underline shrink-0 mt-1">
            + Submit a pack
          </Link>
        </div>
      </div>

      <div className="relative">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search packs by title, author, or description…"
          className="input-field w-full"
          style={{ paddingLeft: '2.5rem' }}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none text-sm">
          🔍
        </span>
      </div>

      <div className="space-y-2">
        <p className="label-caps text-faint">Game type</p>
        <div className="flex flex-wrap gap-2">
          {GAME_TYPE_FILTERS.map((f) => (
            <Chip key={f.value} active={gameType === f.value} onClick={() => handleGameType(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="label-caps text-faint">Tag</p>
        <div className="flex flex-wrap gap-2">
          {TAG_FILTERS.map((f) => (
            <Chip key={f.value} active={tag === f.value} onClick={() => handleTag(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-4 bg-[var(--border-strong)] rounded-full w-2/3 mb-3" />
              <div className="h-3 bg-[var(--border)] rounded-full w-1/3" />
            </div>
          ))}
        </div>
      ) : packs.length === 0 ? (
        <div className="glass-card p-10 text-center space-y-3">
          <p className="text-4xl">📚</p>
          <p className="font-semibold">No packs found</p>
          <p className="text-muted text-sm">
            {gameType || tag ? 'No approved packs match these filters.' : 'Be the first to submit one!'}
          </p>
          <Link
            href="/library/submit"
            className="btn-primary inline-block no-underline mt-2"
            style={{ width: 'fit-content', margin: '0 auto' }}
          >
            Submit a pack
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3 animate-stagger">
            {packs.map((pack) => {
              const meta = GAME_TYPE_META[pack.game_type]
              return (
                <div key={pack.id} className="glass-card p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-bold leading-snug">{pack.title}</p>
                      <p className="text-muted text-sm">by {pack.author_name}</p>
                    </div>
                    <span
                      className={`label-caps shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${meta?.color ?? 'chip'}`}
                    >
                      {meta?.label ?? pack.game_type}
                    </span>
                  </div>
                  {pack.description && (
                    <p className="text-muted text-sm line-clamp-2 leading-relaxed">{pack.description}</p>
                  )}
                  {pack.tags && pack.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pack.tags.map((t) => {
                        const tm = TAG_META[t]
                        return (
                          <span
                            key={t}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${tm?.color ?? 'chip'}`}
                          >
                            {tm?.label ?? t}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-faint text-xs">{pack.question_count} questions</span>
                    <Link
                      href={`/create?pack=${pack.id}&type=${pack.game_type}`}
                      className="btn-secondary btn-fit px-4 py-1.5 text-sm no-underline"
                    >
                      Use this pack →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 pt-2">
              <p className="text-faint text-xs">
                {total} pack{total !== 1 ? 's' : ''} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="btn-secondary btn-fit px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  ←
                </button>
                <span className="text-sm text-muted tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary btn-fit px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
