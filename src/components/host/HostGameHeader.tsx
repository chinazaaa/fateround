'use client'

import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { ContentLabelChip } from '@/components/game-lobby/ContentLabelChip'
import type { Game } from '@/types'

type Props = {
  game: Pick<Game, 'title' | 'status' | 'game_type' | 'content_label'>
  subtitle?: string
  className?: string
}

/**
 * Compact in-game header — mirrors the mobile session header: title + a small
 * game-type pill, left-aligned, with no oversized emoji or redundant "Host
 * panel" caption. Keeps the top of the screen light so gameplay leads.
 */
export function HostGameHeader({ game, subtitle, className = '' }: Props) {
  const cfg = gameTypeConfig(parseGameType(game.game_type))
  const finished = game.status === 'finished'

  return (
    <div className={`space-y-1.5 ${className}`}>
      <h1 className="truncate text-lg sm:text-xl font-black tracking-tight text-body">{game.title}</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--chip-active-border)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--primary)]">
          <span aria-hidden>{cfg.headerEmoji}</span>
          {cfg.label}
        </span>
        <ContentLabelChip label={game.content_label} />
        {subtitle ? (
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{subtitle}</span>
        ) : finished ? (
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Final results</span>
        ) : null}
      </div>
    </div>
  )
}
