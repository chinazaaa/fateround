'use client'

import Link from 'next/link'
import { gameRulesHref } from '@/lib/game-landing'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { Glyph } from '@/components/icons/Glyph'
import { ArrowRight01Icon, BookOpen01Icon } from '@hugeicons/core-free-icons'
import type { GameType } from '@/types'

/**
 * Premium "How to play" row for the Host settings sheet.
 */
export function HostRulesRow({ gameType }: { gameType: GameType | string | null | undefined }) {
  if (!gameType) return null

  const type = parseGameType(gameType)
  const cfg = gameTypeConfig(type)

  return (
    <Link
      href={gameRulesHref(type)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-all hover:border-[var(--primary)] no-underline"
    >
      <span className="fr-glyph flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
        <Glyph icon={BookOpen01Icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>
          How to play
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {cfg.label} rules &amp; scoring
        </p>
      </div>
      <span className="shrink-0 transition-transform group-hover:translate-x-0.5 text-[var(--primary)]">
        <Glyph icon={ArrowRight01Icon} size={18} />
      </span>
    </Link>
  )
}
