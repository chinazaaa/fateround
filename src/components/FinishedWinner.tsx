import type { ReactNode } from 'react'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { ContentLabelChip } from '@/components/game-lobby/ContentLabelChip'
import { Glyph } from '@/components/icons/Glyph'
import { ChampionIcon, Flag02Icon, HeartHandshakeIcon } from '@hugeicons/core-free-icons'
import { CoinAwardPanel } from '@/components/coins/CoinAwardPanel'
import { WinnerAnimationOverlay } from '@/components/coins/WinnerAnimationOverlay'
import type { Game } from '@/types'

export interface WinnerStat {
  value: ReactNode
  label: string
}

function HeroIcon({ emoji }: { emoji?: string }) {
  if (emoji === '🤝') return <Glyph icon={HeartHandshakeIcon} size={32} />
  if (emoji === '🏁') return <Glyph icon={Flag02Icon} size={32} />
  return <Glyph icon={ChampionIcon} size={32} />
}

/**
 * Shared "finished / winner" hero for game results screens.
 *
 * Renders the trophy, a "{winner} wins!" headline (winner's name in the app's
 * accent), and a game-label subtitle. An optional stats strip (Rounds / Players /
 * Duration, etc.) is game-specific — pass `stats` when a game wants it, otherwise
 * it's omitted. Uses the app's current design tokens so it stays consistent with
 * the rest of the surfaces.
 */
export function FinishedWinnerHero({
  winnerName,
  game,
  subtitle,
  stats,
  emoji = '🏆',
  headline,
  gameCode,
  winnerAnimationSlug,
}: {
  /** Name of the first-place player. When absent, falls back to a neutral "Game over!". */
  winnerName?: string | null
  // `id` is optional on the pick so the ~50 existing callers that already
  // pass `game={game}` (where Game.id IS the room code) get scoped events
  // for free — no per-callsite change needed. Callers with a narrower
  // game object can still pass `gameCode` explicitly.
  game: Pick<Game, 'title' | 'game_type' | 'content_label'> & { id?: string }
  /** Overrides the game-label subtitle line (defaults to the game type's label). */
  subtitle?: ReactNode
  /** Optional stat strip; omit for games that don't have generic stats to show. */
  stats?: WinnerStat[]
  /** Hero emoji — override for draws (🤝) / ended-early (🏁) etc. Defaults to 🏆. */
  emoji?: string
  /**
   * Full headline override (e.g. "It's a draw!"). When omitted, renders
   * "{winnerName} wins!" (name in the accent) or "Game over!" if there's no winner.
   */
  headline?: ReactNode
  /**
   * The game code — passed through to the CoinAwardPanel so it only reacts
   * to coin events fired for THIS game (a second game finishing later in the
   * same tab must not re-render the first game's award panel).
   */
  gameCode?: string | null
  /**
   * Equipped winner-animation slug read from the winner's profile. When
   * present, an overlay plays once behind the hero at result-render time
   * (`docs/coins-and-shop-plan.md` §"Where cosmetics render" → "Winner
   * animation"). Falls back to no overlay if the slug is unknown.
   */
  winnerAnimationSlug?: string | null
}) {
  const cfg = gameTypeConfig(parseGameType(game.game_type))

  return (
    <div className="relative isolate text-center space-y-2">
      {winnerAnimationSlug ? <WinnerAnimationOverlay slug={winnerAnimationSlug} /> : null}
      <div className="flex justify-center pb-1">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] shadow-[0_8px_24px_-4px_color-mix(in_srgb,var(--primary)_35%,transparent)]">
          <HeroIcon emoji={emoji} />
        </span>
      </div>
      <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight text-body">
        {headline ??
          (winnerName ? (
            <>
              <span className="gradient-title">{winnerName}</span> wins!
            </>
          ) : (
            'Game over!'
          ))}
      </h2>
      <p className="text-faint text-[11px] font-bold uppercase tracking-[0.16em]">{subtitle ?? cfg.label}</p>
      {game.content_label?.trim() && (
        <div className="flex justify-center pt-0.5">
          <ContentLabelChip label={game.content_label} />
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="flex gap-2 sm:gap-3 pt-2">
          {stats.map((s) => (
            <div key={s.label} className="glass-card flex-1 px-2 py-3 text-center">
              <div className="text-xl font-black text-body tabular-nums">{s.value}</div>
              <div className="text-faint text-[10px] uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Coin panel renders itself when the attribute call reports a credit.
          Kept inside the hero so every game's finished screen inherits it
          without ~40 share-block components each wiring it up. Only mounts
          when a `gameCode` is supplied — an unscoped panel would react to
          any coin event and could show credits from a different game in a
          multi-game tab. Call sites that haven't been updated yet render
          silently; when they pass `gameCode` the panel lights up. */}
      {(() => {
        const effectiveCode = gameCode ?? game.id ?? null
        return effectiveCode ? (
          <div className="pt-2 text-left">
            <CoinAwardPanel gameCode={effectiveCode} />
          </div>
        ) : null
      })()}
    </div>
  )
}
