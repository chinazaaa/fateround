'use client'

import { useEffect, useState } from 'react'

// At or below this many collections, show tappable chips; above it, switch to a compact dropdown.
const COLLECTION_CHIP_LIMIT = 6

export type LibraryPackLite = {
  id: string
  title: string
  author_name: string
  question_count: number
  /** Active collections this pack belongs to (for the collection chip filter). */
  collections?: { slug: string; name: string }[]
  /**
   * Coin price for this pack (`docs/coins-and-shop-plan.md` §"Inline"). 0
   * for grandfathered / free packs (the default). >0 packs show a coin
   * badge on the row; the host must own the pack (or purchase it) before
   * the picker can hand it to the game.
   */
  price_coins?: number
  /** Owned-by-current-profile hint (set by the caller). */
  owned?: boolean
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
  return (
    <LibraryPackList
      packs={packs}
      search={search}
      onSearchChange={onSearchChange}
      selectedPackId={selectedPackId}
      onSelect={onSelect}
      noun={noun}
    />
  )
}

/** Inner list with the collection chip filter — split out so hooks run only when packs exist. */
function LibraryPackList({
  packs,
  search,
  onSearchChange,
  selectedPackId,
  onSelect,
  noun,
}: {
  packs: LibraryPackLite[]
  search: string
  onSearchChange: (value: string) => void
  selectedPackId: string | null
  onSelect: (id: string) => void
  noun: string
}) {
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null)

  // Distinct collections present across the loaded packs (only show the row when there's a choice).
  const collectionOptions = (() => {
    const byS = new Map<string, string>()
    for (const p of packs) for (const c of p.collections ?? []) byS.set(c.slug, c.name)
    return [...byS.entries()].map(([slug, name]) => ({ slug, name }))
  })()

  const matches = packs.filter((p) => {
    if (collectionFilter && !(p.collections ?? []).some((c) => c.slug === collectionFilter)) return false
    const q = search.toLowerCase().trim()
    if (!q) return true
    return p.title.toLowerCase().includes(q) || p.author_name.toLowerCase().includes(q)
  })

  // Few collections → chips (discoverable, one tap). Many → a compact dropdown that scales
  // without pushing the pack list down the screen.
  const useDropdown = collectionOptions.length > COLLECTION_CHIP_LIMIT

  return (
    <div className="space-y-2">
      {collectionOptions.length > 0 &&
        (useDropdown ? (
          <select
            value={collectionFilter ?? ''}
            onChange={(e) => setCollectionFilter(e.target.value || null)}
            aria-label="Filter by collection"
            className="input-field w-full text-sm"
          >
            <option value="">All collections</option>
            {collectionOptions.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCollectionFilter(null)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                collectionFilter === null
                  ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
              }`}
            >
              All collections
            </button>
            {collectionOptions.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCollectionFilter(c.slug)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  collectionFilter === c.slug
                    ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        ))}
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
                  {(pack.price_coins ?? 0) > 0 && (
                    <>
                      {' · '}
                      <span className="text-body font-semibold">{pack.owned ? 'Owned' : `🪙 ${pack.price_coins}`}</span>
                    </>
                  )}
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
  alsoIncludeGameTypes = [],
  noun = 'questions',
  onPick,
}: {
  gameType: string
  /** Extra library game types to list alongside `gameType` (e.g. Text Charades packs for Quick Draw). */
  alsoIncludeGameTypes?: string[]
  noun?: string
  onPick: (questions: unknown[], packId: string) => void
}) {
  const [packs, setPacks] = useState<LibraryPackLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const gameTypesKey = [gameType, ...alsoIncludeGameTypes].join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const types = [gameType, ...alsoIncludeGameTypes.filter((t) => t && t !== gameType)]
    Promise.all(
      types.map((type) =>
        fetch(`/api/library?game_type=${encodeURIComponent(type)}&page_size=100`).then((r) => r.json())
      )
    )
      .then((results) => {
        if (cancelled) return
        const byId = new Map<string, LibraryPackLite>()
        for (const d of results) {
          for (const pack of (d.packs ?? []) as LibraryPackLite[]) {
            byId.set(pack.id, pack)
          }
        }
        setPacks([...byId.values()])
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
  }, [gameType, gameTypesKey])

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
