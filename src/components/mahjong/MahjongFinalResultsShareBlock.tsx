'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, MahjongSession, Player } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { MahjongCard } from '@/components/mahjong/MahjongChrome'
import { mahjongTileShortLabel } from '@/lib/mahjong'
import { mahjongRulesetLabel } from '@/lib/mahjong-rulesets'

function patternLabel(pattern: string | undefined): string {
  if (pattern === 'seven_pairs') return 'Seven pairs'
  if (pattern === 'thirteen_orphans') return 'Thirteen orphans'
  if (pattern === 'knitted_straight') return 'Knitted straight'
  if (pattern === 'greater_honors_knitted') return 'Greater honors knitted'
  if (pattern === 'lesser_honors_knitted') return 'Lesser honors knitted'
  return 'Standard hand'
}

export function MahjongFinalResultsShareBlock({
  game,
  players,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  session: MahjongSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const winnerPlayerId = session?.winner_player_id ?? null
  const winnerPlayerIds = session?.winner_player_ids?.length
    ? session.winner_player_ids
    : winnerPlayerId
      ? [winnerPlayerId]
      : []
  const winnerNames = winnerPlayerIds.map((id) => players.find((p) => p.id === id)?.name ?? 'Player')
  const displayWinner = winnerName ?? (winnerNames.length > 0 ? winnerNames.join(', ') : null) ?? null
  const isDraw = session?.phase === 'finished' && !displayWinner
  const winType = session?.win_type === 'self_draw' ? 'Self draw' : session?.win_type === 'discard' ? 'On discard' : ''
  const score = session?.score_summary ?? null

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">{isDraw ? '🤝' : '🏆'}</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {displayWinner ? `${displayWinner} calls Mahjong!` : 'Wall draw'}
        </p>
        {session?.winning_tile && (
          <p className="text-sm text-center text-muted">
            {winType} on <span className="font-bold">{mahjongTileShortLabel(session.winning_tile)}</span>
          </p>
        )}
        {score && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div>
                <p className="label-caps">Pattern</p>
                <p className="font-black text-sm">{patternLabel(score.pattern)}</p>
              </div>
              <div>
                <p className="label-caps">Ruleset</p>
                <p className="font-black text-sm">{mahjongRulesetLabel(score.ruleset)}</p>
              </div>
              <div>
                <p className="label-caps">{score.ruleset === 'mcr' ? 'Points' : 'Fan'}</p>
                <p className="font-black text-sm">{score.fan}</p>
              </div>
              <div>
                <p className="label-caps">{score.fu ? 'Fu' : 'Paid'}</p>
                <p className="font-black text-sm">{score.fu ?? score.total_points}</p>
              </div>
            </div>
            {score.limit && <p className="text-center text-xs font-bold text-[var(--primary)]">{score.limit}</p>}
            {score.lines.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {score.lines.map((line) => (
                  <span
                    key={`${line.label}-${line.fan}`}
                    className="rounded-full bg-[var(--surface-bg)] px-2.5 py-1 text-xs font-bold text-muted"
                  >
                    {line.label} +{line.fan}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {players.map((player) => {
            const delta = score?.payments.find((payment) => payment.player_id === player.id)?.delta ?? null
            const total = session?.scores?.[player.id]
            const status =
              total != null
                ? `${total} pts${delta != null ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`
                : delta != null
                  ? `${delta > 0 ? '+' : ''}${delta} pts`
                  : winnerPlayerIds.includes(player.id)
                    ? 'Winner'
                    : 'Player'
            return (
              <MahjongCard key={player.id} className="p-3 text-center">
                <p className="font-bold text-sm truncate">
                  {player.name}
                  {player.id === highlightPlayerId ? ' (you)' : ''}
                </p>
                <p className="text-xs text-faint">{status}</p>
              </MahjongCard>
            )
          })}
        </div>
      </div>
      <HostGameFinishedActions
        playAgainButton={playAgainButton}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            mahjongWinnerName={displayWinner ?? undefined}
            mahjongIsDraw={isDraw}
          />
        }
      />
    </div>
  )
}
