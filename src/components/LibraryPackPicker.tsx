'use client'

import { useEffect, useState } from 'react'

export type LibraryPackLite = {
  id: string
  title: string
  author_name: string
  question_count: number
}

/** Presentational community-library pack browser — caller owns the pack list and selection state. */
export function LibraryPackPicker({
  loading,
  packs,
  search,
  onSearchChange,
  selectedPackId,
  onSelect,
  noun = 'questions',
}: {
  loading: boolean
  packs: LibraryPackLite[]
  search: string
  onSearchChange: (value: string) => void
  selectedPackId: string | null
  onSelect: (id: string) => void
  noun?: string
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="surface-inset px-4 py-3 animate-pulse">
            <div className="h-3 bg-[var(--border-strong)] rounded-full w-2/3 mb-2" />
            <div className="h-2.5 bg-[var(--border)] rounded-full w-1/3" />
          </div>
        ))}
      </div>
    )
  }
  if (packs.length === 0) {
    return <p className="text-muted text-sm text-center py-4">No approved packs for this game type yet.</p>
  }
  const matches = packs.filter((p) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return p.title.toLowerCase().includes(q) || p.author_name.toLowerCase().includes(q)
  })
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search packs…"
          className="input-field w-full text-sm"
          style={{ paddingLeft: '2.25rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none text-xs">
          🔍
        </span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
        {matches.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => onSelect(pack.id)}
            className={`surface-inset w-full px-4 py-3 text-left transition-all ${
              selectedPackId === pack.id
                ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)]'
                : 'hover:border-[var(--border-strong)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={`font-semibold text-sm truncate ${selectedPackId === pack.id ? 'text-[var(--chip-active-text)]' : ''}`}
                >
                  {pack.title}
                </p>
                <p className="text-faint text-xs mt-0.5">
                  by {pack.author_name} · {pack.question_count} {noun}
                </p>
              </div>
              {selectedPackId === pack.id && (
                <span className="text-[var(--chip-active-text)] text-sm font-bold shrink-0">✓</span>
              )}
            </div>
          </button>
        ))}
        {matches.length === 0 && <p className="text-muted text-sm text-center py-3">No packs match your search.</p>}
      </div>
    </div>
  )
}

/**
 * Self-contained library browser: fetches approved packs for a game type and, on selection,
 * loads the chosen pack's questions and hands them back via onPick. Used by the host lobby
 * content modals (Trivia / Codewords / Text Charades / poll-family games).
 */
export function LibraryPackBrowser({
  gameType,
  noun = 'questions',
  onPick,
}: {
  gameType: string
  noun?: string
  onPick: (questions: unknown[], packId: string) => void
}) {
  const [packs, setPacks] = useState<LibraryPackLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/library?game_type=${gameType}&page_size=100`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPacks(d.packs ?? [])
      })
      .catch(() => {
        if (!cancelled) setPacks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [gameType])

  const handleSelect = async (id: string) => {
    setSelectedPackId(id)
    try {
      const res = await fetch(`/api/library/${id}`)
      const data = await res.json()
      if (data.pack?.questions) onPick(data.pack.questions as unknown[], id)
    } catch {
      // leave selection visible; caller surfaces no data if the fetch failed
    }
  }

  return (
    <LibraryPackPicker
      loading={loading}
      packs={packs}
      search={search}
      onSearchChange={setSearch}
      selectedPackId={selectedPackId}
      onSelect={handleSelect}
      noun={noun}
    />
  )
}
