'use client'

import { useMemo } from 'react'
import { CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import {
  tallyCodewordsOperativeStats,
  tallyCodewordsSpymasterStats,
  pickBestCodewordsSpymaster,
  teamLabel,
} from '@/lib/codewords'
import type { CodewordsGuess, CodewordsPlayerRole, Player } from '@/types'

function MvpCard({ emoji, title, name, detail }: { emoji: string; title: string; name: string; detail: string }) {
  return (
    <div className="glass-card p-5 text-center space-y-1 border-amber-400/25">
      <p className="text-3xl">{emoji}</p>
      <p className="label-caps text-xs">{title}</p>
      <p className="text-xl font-black">{name}</p>
      <p className="text-muted text-sm">{detail}</p>
    </div>
  )
}

export function CodewordsEndGameStats({
  guesses,
  roles,
  players,
  highlightPlayerId,
  winner,
}: {
  guesses: CodewordsGuess[]
  roles: CodewordsPlayerRole[]
  players: Player[]
  highlightPlayerId?: string | null
  winner?: 'red' | 'blue' | null
}) {
  const operativeStats = useMemo(() => tallyCodewordsOperativeStats(guesses, roles, players), [guesses, roles, players])
  const spymasterStats = useMemo(() => tallyCodewordsSpymasterStats(guesses, roles, players), [guesses, roles, players])

  const bestOperative = operativeStats[0] ?? null
  const bestSpymaster = useMemo(() => pickBestCodewordsSpymaster(spymasterStats, winner), [spymasterStats, winner])
  const hasGuesses = guesses.length > 0

  if (!hasGuesses && operativeStats.length === 0 && spymasterStats.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {winner && (
        <p className="text-center text-sm text-muted">
          {teamLabel(winner)} team wins — here&apos;s how everyone played
        </p>
      )}

      {(bestOperative || bestSpymaster) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bestOperative && (
            <MvpCard
              emoji="🎯"
              title="Best operative"
              name={bestOperative.name}
              detail={`${bestOperative.correct} correct · ${bestOperative.score} pts`}
            />
          )}
          {bestSpymaster && (
            <MvpCard
              emoji="🕵️"
              title="Best spymaster"
              name={bestSpymaster.name}
              detail={`${bestSpymaster.wordsFound} words found · ${bestSpymaster.cluesGiven} clues`}
            />
          )}
        </div>
      )}

      {operativeStats.length > 0 && (
        <PaginatedLeaderboard
          title="Operative leaderboard"
          rows={operativeStats.map((row, i) => ({
            id: row.playerId,
            name: row.name,
            score: row.score,
            rank: i + 1,
          }))}
          highlightId={highlightPlayerId}
          scoreLabel={(score) => `${score} pts`}
        />
      )}

      {spymasterStats.length > 0 && (
        <div className="space-y-2">
          {[...spymasterStats]
            .sort((a, b) => {
              if (!winner) return 0
              if (a.team === winner) return -1
              if (b.team === winner) return 1
              return 0
            })
            .map((spy) => (
              <div
                key={spy.playerId}
                className={[
                  'glass-card p-4 flex items-center justify-between gap-3',
                  spy.playerId === highlightPlayerId ? 'ring-2 ring-teal-400/40' : '',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <p className="font-bold truncate">
                    {spy.name}
                    {spy.playerId === highlightPlayerId ? ' (you)' : ''}
                  </p>
                  <p className="text-faint text-xs mt-0.5">
                    <CodewordsTeamBadge team={spy.team} /> Spymaster
                  </p>
                </div>
                <div className="text-right text-sm shrink-0">
                  <p className="font-semibold tabular-nums">{spy.score} pts</p>
                  <p className="text-faint text-xs">
                    {spy.wordsFound} found · {spy.cluesGiven} clues
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
