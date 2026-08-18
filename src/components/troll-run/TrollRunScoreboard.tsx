'use client'

import React from 'react'
import type { TrollRunPlayerState, TrollRunSession } from '@/types'
import { buildTrollRunStandings } from '@/lib/troll-run'

export interface TrollRunScoreboardProps {
  session: TrollRunSession
  playerStates: TrollRunPlayerState[]
  playerNames: Map<string, string>
  isHost?: boolean
  onNextRound?: () => void
  loading?: boolean
}

export function TrollRunScoreboard({
  session,
  playerStates,
  playerNames,
  isHost,
  onNextRound,
  loading = false,
}: TrollRunScoreboardProps) {
  const standings = buildTrollRunStandings(playerStates, playerNames)
  const isFinalRound = session.current_round >= session.total_rounds

  return (
    <div className="w-full max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <span className="text-4xl">{isFinalRound ? '🏆' : '🏁'}</span>
        <h2 className="text-2xl font-black tracking-tight text-white">
          {isFinalRound ? 'Final Championship Standings' : `Round ${session.current_round} Results`}
        </h2>
        <p className="text-xs text-slate-400">
          World: <span className="text-amber-400 capitalize font-bold">{session.current_world}</span> · Round{' '}
          {session.current_round} of {session.total_rounds}
        </p>
      </div>

      {/* Standings Table */}
      <div className="space-y-2">
        {standings.map((p, idx) => {
          const isTop3 = idx < 3
          const badge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`

          return (
            <div
              key={p.playerId}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                idx === 0 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-black w-6 text-center">{badge}</span>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    {p.name}
                    {p.finishPosition && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-semibold">
                        Finished #{p.finishPosition}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 flex gap-3 mt-0.5">
                    <span>
                      🏁 Cleared: <strong className="text-slate-200">{p.levelsCleared}</strong>
                    </span>
                    <span>
                      💀 Deaths: <strong className="text-rose-400">{p.deaths}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono text-base font-black text-amber-400">{p.totalScore} pts</div>
                <div className="text-[10px] text-slate-400 font-mono">+{p.roundScore} this round</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Host Actions */}
      {isHost && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onNextRound}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 font-black text-slate-950 tracking-wide text-sm transition shadow-lg disabled:opacity-50"
          >
            {loading
              ? 'Loading...'
              : isFinalRound
                ? 'Finish Game & View Final Standings'
                : `Start Round ${session.current_round + 1} →`}
          </button>
        </div>
      )}

      {!isHost && (
        <div className="text-center text-xs text-slate-500 italic">Waiting for host to begin next round...</div>
      )}
    </div>
  )
}
