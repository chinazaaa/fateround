'use client'

import { GameInfoChips, gameInfoItems } from '@/components/game-lobby/GameInfoChips'
import type { Game } from '@/types'

/**
 * "Rules in play" chip summary rendered inside a player's or host's ⚙ settings sheet during
 * ACTIVE play, so someone can recall the house rules the host picked (bank loans, forced
 * auctions, UNO no-mercy, Wordle category, etc.) without going back to the lobby.
 *
 * Renders nothing when the game has no configurable rule chips to show — a chess or
 * tic-tac-toe sheet stays lean instead of showing a bare "Rules in play" heading.
 * Same chip component as the join screen, so wording never diverges.
 *
 * Host: HostActiveSettings renders its own copy at the top of the sheet when the host
 * passes `game={game}`. Player: import this and drop it at the top of the settings-node
 * div (before EditNameInline).
 */
export function RulesInPlaySection({ game }: { game: Game | null | undefined }) {
  if (gameInfoItems(game).length === 0) return null
  return (
    <div className="space-y-2">
      <p className="label-caps">Rules in play</p>
      <GameInfoChips game={game} />
    </div>
  )
}
