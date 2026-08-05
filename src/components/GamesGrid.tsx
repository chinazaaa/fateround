'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { GameType } from '@/types'
import type { GameLandingContent } from '@/lib/game-landing'
import { GAME_CATEGORIES, gameTypeCategory, type GameCategory, type GameTypeConfig } from '@/lib/game-types'
import { matchesGameSearch } from '@/lib/game-search'
import { isMatureGame, MATURE_BADGE_LABEL } from '@/lib/game-maturity'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'

export type GamesGridItem = {
  type: GameType
  slug: string
  content: GameLandingContent
  cfg: GameTypeConfig
}

type CategoryFilter = GameCategory | 'all'
type SortKey = 'featured' | 'az'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Popular' },
  { key: 'az', label: 'A–Z' },
]

const CATEGORY_KEYS = new Set<string>(GAME_CATEGORIES.map((c) => c.key))

/** Lets links like /games?category=cards preselect a filter tab on load. */
function categoryFromParam(value: string | null): CategoryFilter {
  return value && CATEGORY_KEYS.has(value) ? (value as GameCategory) : 'all'
}

export function GamesGrid({ games }: { games: GamesGridItem[] }) {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>(() => categoryFromParam(searchParams.get('category')))
  const [sort, setSort] = useState<SortKey>('featured')

  // Searching spans every category, so an active query overrides the category chips —
  // otherwise a hit in a different tab looks like "no results".
  const searching = query.trim().length > 0

  const filtered = useMemo(() => {
    const result = games.filter(({ type, content }) => {
      if (searching) {
        return matchesGameSearch(type, query, [content.heroTitle, content.heroSubtitle])
      }
      if (category === 'all') return true
      return gameTypeCategory(type) === category
    })

    if (sort === 'az') {
      return [...result].sort((a, b) => a.content.heroTitle.localeCompare(b.content.heroTitle))
    }
    // 'featured' keeps the curated order the page passes in (pinned games first).
    return result
  }, [games, query, searching, category, sort])

  const tabs: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    ...GAME_CATEGORIES.map((c) => ({ key: c.key as CategoryFilter, label: c.label })),
  ]

  const countFor = (key: CategoryFilter) =>
    key === 'all' ? games.length : games.filter(({ type }) => gameTypeCategory(type) === key).length

  return (
    // No max-width here: the page wraps this in `.mk-wrap`, so the grid runs to
    // the same measure as the header and the homepage grids. The controls above
    // it keep their own narrower caps — a search field spanning 1120px would be
    // absurd — but the cards themselves fill the column.
    <div className="w-full space-y-6">
      {/* Controls panel. The homepage breaks its scroll with full-bleed bands,
          but search, filter and grid share state, so splitting them across two
          bands would mean lifting that state into the page for a purely visual
          gain. A sunken panel gives the same "these three belong together, and
          they are not the grid" reading, in one element. */}
      <div className="fr-controls">
        {/* Search */}
        <div className="relative mx-auto w-full max-w-[440px]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2"
            style={{ color: 'var(--text-faint)' }}
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search games"
            className="h-[46px] w-full pl-[42px] pr-4 text-[15px] outline-none"
            style={{
              background: 'var(--surface)',
              border: '1.5px solid var(--border-strong)',
              color: 'var(--text)',
              borderRadius: 'var(--radius-md)',
            }}
          />
        </div>

        {/* Category filter */}
        <div
          role="tablist"
          aria-label="Filter games by category"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {tabs.map((tab) => {
            const active = !searching && category === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setQuery('')
                  setCategory(tab.key)
                }}
                className={`fr-chip fr-chip--control shrink-0 !text-[13px] ${active ? 'font-extrabold' : ''}`}
                style={
                  active
                    ? {
                        background: 'var(--primary)',
                        borderColor: 'var(--primary)',
                        color: 'var(--primary-contrast)',
                        fontWeight: 800,
                      }
                    : undefined
                }
              >
                {tab.label}
                <span className={active ? 'opacity-80 font-semibold' : 'opacity-60'}>{countFor(tab.key)}</span>
              </button>
            )
          })}
        </div>

        {/* Sort */}
        <div className="flex items-center justify-center gap-2 text-[12.5px]">
          {SORTS.map((option) => {
            const active = sort === option.key
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSort(option.key)}
                className={`px-2.5 py-1 ${active ? 'font-black' : 'font-medium'}`}
                style={{
                  fontWeight: active ? 800 : 500,
                  color: active ? 'var(--primary)' : 'var(--text-faint)',
                  background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
          No games match &ldquo;{query.trim()}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ type, slug, content, cfg }) => (
            <Link
              key={slug}
              href={`/games/${slug}`}
              className="fr-gamecard group !gap-2.5"
              style={{ '--accent': cfg.card.accent } as React.CSSProperties}
            >
              <div className="flex items-start gap-3">
                <span className="fr-glyph fr-glyph--sm">
                  <Glyph icon={gameIcon(type)} size={22} />
                </span>
                <div className="min-w-0">
                  <h2 className="fr-gamecard__title !text-[15.5px]">
                    {content.heroTitle}
                    {isMatureGame(type) && (
                      <span
                        className="ml-1.5 inline-block rounded-full px-1.5 py-px align-middle text-[10px] font-bold tracking-wide"
                        style={{
                          background: 'color-mix(in srgb, var(--danger, #dc2626) 14%, transparent)',
                          color: 'var(--danger, #dc2626)',
                        }}
                      >
                        {MATURE_BADGE_LABEL}
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-faint)' }}>
                    {cfg.card.players} · {cfg.card.vibe}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                Learn more
              </span>
            </Link>
          ))}
        </div>
      )}

      <p className="text-center text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
        {searching || category !== 'all' ? `${filtered.length} of ${games.length} modes` : `${games.length} modes`}
      </p>
    </div>
  )
}
