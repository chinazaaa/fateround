'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { GameType } from '@/types'
import type { GameLandingContent } from '@/lib/game-landing'
import type { GameTypeConfig } from '@/lib/game-types'

export type GamesGridItem = {
  type: GameType
  slug: string
  content: GameLandingContent
  cfg: GameTypeConfig
}

export function GamesGrid({ games }: { games: GamesGridItem[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return games
    return games.filter(
      ({ content, cfg }) =>
        content.heroTitle.toLowerCase().includes(q) ||
        cfg.card.vibe.toLowerCase().includes(q) ||
        content.heroSubtitle.toLowerCase().includes(q)
    )
  }, [query, games])

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5">
      {/* Search */}
      <div className="relative mx-auto max-w-[440px]">
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
          className="h-[46px] w-full rounded-full pl-[42px] pr-4 text-[15px] outline-none"
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border-strong)',
            color: 'var(--text)',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
          No games match &ldquo;{query.trim()}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map(({ slug, content, cfg }) => (
            <Link
              key={slug}
              href={`/games/${slug}`}
              className="fr-gamecard group !gap-2.5"
              style={{ '--accent': cfg.card.accent } as React.CSSProperties}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-2xl"
                  style={{ background: `color-mix(in srgb, ${cfg.card.accent} 14%, transparent)` }}
                >
                  {cfg.card.emoji}
                </span>
                <div className="min-w-0">
                  <h2 className="fr-gamecard__title !text-[15.5px]">{content.heroTitle}</h2>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-faint)' }}>
                    {cfg.card.players} · {cfg.card.vibe}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                Learn more →
              </span>
            </Link>
          ))}
        </div>
      )}

      <p className="text-center text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
        {games.length} modes · free forever · no sign-up
      </p>
    </div>
  )
}
