'use client'

import Link from 'next/link'
import { BookIcon, ChevronRightIcon } from '@/components/host/host-icons'
import { gameRulesHref } from '@/lib/game-landing'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import type { GameType } from '@/types'

/**
 * Premium "How to play" row for the Manage tab — replaces the old subtle inline link.
 * Opens the game's rules page in a new tab.
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
      className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--card-hover)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
        <BookIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">How to play</p>
        <p className="text-faint text-xs truncate">{cfg.label} rules &amp; scoring</p>
      </div>
      <span className="shrink-0 text-faint transition-colors group-hover:text-[var(--foreground)]">
        <ChevronRightIcon size={18} />
      </span>
    </Link>
  )
}
