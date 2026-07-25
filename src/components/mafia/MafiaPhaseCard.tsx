'use client'

import { useState } from 'react'
import type { MafiaPhase, MafiaPublicPlayer, MafiaMyState, MafiaRole } from '@/types'
import { MafiaRoleRevealScreen } from './MafiaRoleRevealScreen'
import { NO_NIGHT_ACTION_ROLES, MAFIA_TEAM_ROLES } from './mafia-role-info'

const NIGHT_ACTION_PROMPT: Partial<Record<MafiaRole, string>> = {
  mafia: '🔪 Choose a player to eliminate tonight.',
  alpha_wolf: '🐺 Choose a player for the pack to eliminate tonight (your vote counts double).',
  framer: '🎭 Choose a player to frame — the Detective will read them as Mafia tonight.',
  doctor: '🏥 Choose a player to protect from any attack tonight.',
  detective: '🔍 Choose a player to investigate their alignment.',
  bodyguard: '🛡️ Choose a player to protect. If they are attacked, you die in their place.',
  vigilante: '🔫 Choose a player to kill. You only get one shot for the whole game.',
  tracker: '👣 Choose a player to track — learn who they visit tonight.',
  serial_killer: '🔪 Choose a player to kill tonight.',
}

interface MafiaPhaseCardProps {
  phase: MafiaPhase
  dayNumber: number
  publicPlayers: MafiaPublicPlayer[]
  myPlayerId: string | null
  myState: MafiaMyState | null
  voteTallies: Record<string, number>
  votedPlayer: MafiaPublicPlayer | undefined
  lastNightMafiaHadTarget: boolean
  amIAlive: boolean
  amISpectator: boolean
  acting: boolean
  onNightAction: (targetId: string, secondTargetId?: string) => void
  onDayVote: (targetId: string | null) => void
}

export function MafiaPhaseCard({
  phase,
  dayNumber,
  publicPlayers,
  myPlayerId,
  myState,
  voteTallies,
  votedPlayer,
  lastNightMafiaHadTarget,
  amIAlive,
  amISpectator,
  acting,
  onNightAction,
  onDayVote,
}: MafiaPhaseCardProps) {
  const myRole = myState?.role
  const [cupidFirstPick, setCupidFirstPick] = useState<string | null>(null)

  // Deaths from the night that just ended are visible directly on the public roster —
  // any player whose deathDay matches the current day number and wasn't a day-vote lynch.
  const newlyDeadTonight = publicPlayers.filter(
    (p) => !p.isAlive && p.deathDay === dayNumber && p.deathCause !== 'village_vote'
  )

  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      {phase === 'role_reveal' && <MafiaRoleRevealScreen myState={myState} />}

      {phase === 'night' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌙</span>
            <h3 className="text-lg font-black text-[var(--foreground)]">Night</h3>
          </div>
          {amISpectator ? (
            <p className="text-sm text-[var(--muted)] py-4 text-center">Watching — night actions in progress...</p>
          ) : !amIAlive ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-3xl">👻</p>
              <p className="text-sm text-[var(--muted)]">You are eliminated. Watch the night unfold...</p>
            </div>
          ) : myRole && NO_NIGHT_ACTION_ROLES.includes(myRole) ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-5xl animate-pulse">💤</div>
              <p className="text-[var(--muted)] text-sm">You have no night action. Wait for sunrise...</p>
            </div>
          ) : myRole === 'cupid' ? (
            <div className="space-y-3">
              {myState?.cupidLinkedNames ? (
                <div className="flex items-center gap-2 text-sm text-pink-400 bg-pink-500/10 border border-pink-500/20 rounded-xl px-4 py-3">
                  <span>💘</span>
                  <span className="font-semibold">
                    You linked {myState.cupidLinkedNames[0]} &amp; {myState.cupidLinkedNames[1]} as Lovers.
                  </span>
                </div>
              ) : dayNumber !== 1 ? (
                <p className="text-sm text-[var(--muted)] py-4 text-center">
                  Cupid can only link Lovers on night one — nothing to do tonight.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--muted)]">
                    💘 Choose two players (in order) to link as Lovers.{' '}
                    {cupidFirstPick
                      ? `First pick: ${publicPlayers.find((p) => p.id === cupidFirstPick)?.name ?? '?'} — now choose the second.`
                      : 'Choose the first player.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {publicPlayers
                      .filter((p) => p.isAlive && p.id !== cupidFirstPick)
                      .map((p) => (
                        <button
                          key={p.id}
                          disabled={acting}
                          onClick={() => {
                            if (!cupidFirstPick) setCupidFirstPick(p.id)
                            else {
                              onNightAction(cupidFirstPick, p.id)
                              setCupidFirstPick(null)
                            }
                          }}
                          className={`px-4 py-3 border rounded-xl text-left text-sm font-medium transition-all ${
                            p.id === cupidFirstPick
                              ? 'bg-pink-500/10 border-pink-500/40'
                              : 'bg-[var(--surface-inset-bg)] border-[var(--border)] hover:border-[var(--primary)]'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : myRole === 'arsonist' ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                🔥 Douse a player in fuel, or ignite everyone doused so far.
              </p>
              {myState?.nightActionSubmitted ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <span>✓</span>
                  <span className="font-semibold">Action submitted. Waiting for others...</span>
                </div>
              ) : (
                <>
                  <button
                    disabled={acting || !myPlayerId}
                    onClick={() => myPlayerId && onNightAction(myPlayerId)}
                    className="w-full py-2 text-sm font-bold text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 rounded-xl transition"
                  >
                    🔥 Ignite (kill everyone doused so far)
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    {publicPlayers
                      .filter((p) => p.isAlive && p.id !== myPlayerId)
                      .map((p) => (
                        <button
                          key={p.id}
                          disabled={acting}
                          onClick={() => onNightAction(p.id)}
                          className="px-4 py-3 bg-[var(--surface-inset-bg)] border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--card)] rounded-xl text-left text-sm font-medium transition-all"
                        >
                          {p.name}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          ) : myRole === 'vigilante' && (myState?.vigilanteShotsRemaining ?? 0) < 1 ? (
            <p className="text-sm text-[var(--muted)] py-4 text-center">
              You've used your one shot already. Nothing to do tonight.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">{myRole ? NIGHT_ACTION_PROMPT[myRole] : ''}</p>
              {myState?.nightActionSubmitted ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <span>✓</span>
                  <span className="font-semibold">Action submitted. Waiting for others...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {publicPlayers
                    .filter((p) => p.isAlive && p.id !== myPlayerId)
                    .map((p) => (
                      <button
                        key={p.id}
                        disabled={acting}
                        onClick={() => onNightAction(p.id)}
                        className="px-4 py-3 bg-[var(--surface-inset-bg)] border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--card)] rounded-xl text-left text-sm font-medium transition-all group flex justify-between items-center"
                      >
                        <span className="text-[var(--foreground)]">{p.name}</span>
                        <span className="text-xs text-[var(--muted)] group-hover:text-[var(--primary)] font-bold uppercase tracking-wider">
                          Select
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {phase === 'day_report' && (
        <div className="text-center py-8 space-y-4">
          <div className="text-4xl">🌅</div>
          <h3 className="text-2xl font-black text-[var(--foreground)]">Sunrise</h3>
          {newlyDeadTonight.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">
                Last night, {newlyDeadTonight.length > 1 ? 'these players died' : 'this player died'}:
              </p>
              {newlyDeadTonight.map((p) => (
                <p key={p.id} className="text-3xl font-black text-red-400">
                  {p.name}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p
                className={`text-lg font-bold ${lastNightMafiaHadTarget ? 'text-emerald-400' : 'text-[var(--muted)]'}`}
              >
                {lastNightMafiaHadTarget ? '🏥 Someone was saved!' : '😴 No one was attacked.'}
              </p>
              <p className="text-sm text-[var(--muted)]">Nobody died last night.</p>
            </div>
          )}
        </div>
      )}

      {phase === 'day' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">☀️</span>
            <div>
              <h3 className="text-lg font-black text-[var(--foreground)]">Day {dayNumber} — Discuss &amp; Vote</h3>
              <p className="text-xs text-[var(--muted)]">
                Debate and vote out a suspect — a strict majority is needed to lynch.
              </p>
            </div>
          </div>

          {amISpectator ? (
            <p className="text-sm text-[var(--muted)] text-center py-4">Watching — voting in progress...</p>
          ) : !amIAlive ? (
            <div className="text-center py-4 space-y-1">
              <p className="text-2xl">👻</p>
              <p className="text-sm text-[var(--muted)]">You are eliminated — watch the vote.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myState?.dayVoteSubmitted && (
                <div className="flex items-center justify-between text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <span>✓</span>
                    <span>Vote cast{myRole === 'mayor' ? ' (counts double)' : ''}</span>
                  </span>
                  <button
                    disabled={acting}
                    onClick={() => onDayVote(null)}
                    className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] underline transition"
                  >
                    Change vote
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {publicPlayers
                  .filter((p) => p.isAlive && p.id !== myPlayerId)
                  .map((p) => {
                    const voteCount = voteTallies?.[p.id] ?? 0
                    return (
                      <button
                        key={p.id}
                        disabled={acting}
                        onClick={() => onDayVote(p.id)}
                        className="px-4 py-3 bg-[var(--surface-inset-bg)] border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--card)] rounded-xl text-left text-sm font-medium transition-all"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[var(--foreground)] font-semibold">{p.name}</span>
                          {voteCount > 0 && (
                            <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold">
                              {voteCount}
                            </span>
                          )}
                        </div>
                        {voteCount > 0 && (
                          <div className="flex gap-0.5 mt-1">
                            {Array.from({ length: Math.min(voteCount, 8) }).map((_, i) => (
                              <span key={i} className="text-[10px] text-red-400">
                                ●
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
              </div>

              <button
                disabled={acting}
                onClick={() => onDayVote(null)}
                className="w-full py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] rounded-xl transition bg-[var(--surface-inset-bg)]"
              >
                ⏭ Skip / No Lynch
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'elimination' && (
        <div className="text-center py-8 space-y-4">
          <div className="text-4xl">⚖️</div>
          <h3 className="text-2xl font-black text-[var(--foreground)]">Vote Results</h3>
          {votedPlayer ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">The village voted to eliminate:</p>
              <p className="text-3xl font-black text-red-400">{votedPlayer.name}</p>
              {votedPlayer.role && (
                <p className="text-sm text-[var(--muted)]">
                  They were a{' '}
                  <span
                    className={`font-bold ${
                      MAFIA_TEAM_ROLES.includes(votedPlayer.role)
                        ? 'text-red-400'
                        : votedPlayer.role === 'jester'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {votedPlayer.role.toUpperCase().replace(/_/g, ' ')}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-bold text-[var(--muted)]">🤝 No majority reached.</p>
              <p className="text-sm text-[var(--muted)]">Nobody was eliminated this round.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
