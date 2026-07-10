'use client'

import type { MafiaPhase, MafiaPublicPlayer, MafiaMyState } from '@/types'

interface MafiaPhaseCardProps {
  phase: MafiaPhase
  dayNumber: number
  publicPlayers: MafiaPublicPlayer[]
  myPlayerId: string | null
  myState: MafiaMyState | null
  voteTallies: Record<string, number>
  killedPlayer: MafiaPublicPlayer | undefined
  votedPlayer: MafiaPublicPlayer | undefined
  lastNightMafiaHadTarget: boolean
  amIAlive: boolean
  amISpectator: boolean
  acting: boolean
  onNightAction: (targetId: string) => void
  onDayVote: (targetId: string | null) => void
}

export function MafiaPhaseCard({
  phase,
  dayNumber,
  publicPlayers,
  myPlayerId,
  myState,
  voteTallies,
  killedPlayer,
  votedPlayer,
  lastNightMafiaHadTarget,
  amIAlive,
  amISpectator,
  acting,
  onNightAction,
  onDayVote,
}: MafiaPhaseCardProps) {
  const myRole = myState?.role

  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      {phase === 'role_reveal' && (
        <div className="text-center py-8 space-y-4">
          <div className="text-5xl animate-bounce">👁️🕵️🐺</div>
          <h3 className="text-xl font-black text-[var(--foreground)]">Roles have been assigned</h3>
          <p className="text-sm text-[var(--muted)]">
            Look at your identity card.
            <br />
            Do <strong>not</strong> show your screen to anyone!
          </p>
          <div className="inline-flex items-center gap-2 text-xs text-[var(--muted)] bg-[var(--surface-inset-bg)] px-4 py-2 rounded-full border border-[var(--border)]">
            <span className="animate-pulse">⏳</span> Night begins shortly...
          </div>
        </div>
      )}

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
          ) : myRole === 'villager' ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-5xl animate-pulse">💤</div>
              <p className="text-[var(--muted)] text-sm">The village sleeps. Wait for sunrise...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                {myRole === 'mafia' && '🔪 Choose a villager to eliminate tonight.'}
                {myRole === 'doctor' && '🏥 Choose a player to protect from the Mafia tonight.'}
                {myRole === 'detective' && '🔍 Choose a player to investigate their alignment.'}
              </p>
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
          {killedPlayer ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">Last night, the Mafia eliminated:</p>
              <p className="text-3xl font-black text-red-400">{killedPlayer.name}</p>
              {killedPlayer.role && (
                <p className="text-sm text-[var(--muted)]">
                  They were a{' '}
                  <span
                    className={`font-bold ${killedPlayer.role === 'mafia' ? 'text-red-400' : 'text-emerald-400'}`}
                  >
                    {killedPlayer.role.toUpperCase()}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p
                className={`text-lg font-bold ${
                  lastNightMafiaHadTarget ? 'text-emerald-400' : 'text-[var(--muted)]'
                }`}
              >
                {lastNightMafiaHadTarget ? '🏥 The Doctor saved the village!' : '😴 The Mafia chose no target.'}
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
              <h3 className="text-lg font-black text-[var(--foreground)]">
                Day {dayNumber} — Discuss &amp; Vote
              </h3>
              <p className="text-xs text-[var(--muted)]">Debate and vote out who you think is Mafia</p>
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
                    <span>Vote cast</span>
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
                    className={`font-bold ${votedPlayer.role === 'mafia' ? 'text-red-400' : 'text-emerald-400'}`}
                  >
                    {votedPlayer.role.toUpperCase()}
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
