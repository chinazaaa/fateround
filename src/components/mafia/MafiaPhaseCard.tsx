'use client'

import type { MafiaPhase, MafiaPublicPlayer, MafiaMyState, MafiaRole } from '@/types'
import { MafiaRoleRevealScreen } from './MafiaRoleRevealScreen'
import { NO_NIGHT_ACTION_ROLES, MAFIA_TEAM_ROLES } from './mafia-role-info'

const NIGHT_ACTION_PROMPT: Partial<Record<MafiaRole, string>> = {
  mafia: '🔪 Tap a player below to eliminate tonight.',
  alpha_wolf: '🐺 Tap a player below for the crew to eliminate tonight (your vote counts double).',
  framer: '🎭 Tap a player below to frame — the Detective will read them as Mafia tonight.',
  doctor: '🏥 Tap a player below to protect from any attack tonight.',
  detective: '🔍 Tap a player below to investigate their alignment.',
  bodyguard: '🛡️ Tap a player below to protect. If they are attacked, you die in their place.',
  vigilante: '🔫 Tap a player below to kill. You only get one shot for the whole game.',
  tracker: '👣 Tap a player below to track — learn who they visit tonight.',
  serial_killer: '🔪 Tap a player below to kill tonight.',
}

interface MafiaPhaseCardProps {
  phase: MafiaPhase
  dayNumber: number
  myState: MafiaMyState | null
  votedPlayer: MafiaPublicPlayer | undefined
  lastNightMafiaHadTarget: boolean
  amIAlive: boolean
  amISpectator: boolean
  acting: boolean
  cupidFirstPickName: string | null
  onIgnite: () => void
  onSkipVote: () => void
  newlyDeadTonight: MafiaPublicPlayer[]
  votesRequired?: number
}

/**
 * Phase narrative + status only — actually picking a target happens by tapping a tile in
 * MafiaPlayersGrid below (Wolvesville-style tap-the-player-photo, not a separate button list).
 * You can change your pick anytime before the phase ends by tapping a different tile.
 */
export function MafiaPhaseCard({
  phase,
  dayNumber,
  myState,
  votedPlayer,
  lastNightMafiaHadTarget,
  amIAlive,
  amISpectator,
  acting,
  cupidFirstPickName,
  onIgnite,
  onSkipVote,
  newlyDeadTonight,
  votesRequired,
}: MafiaPhaseCardProps) {
  const myRole = myState?.role

  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      {phase === 'role_reveal' && <MafiaRoleRevealScreen myState={myState} />}

      {phase === 'night' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌙</span>
            <h3 className="text-lg font-black text-[var(--foreground)]">Night</h3>
          </div>
          {amISpectator ? (
            <p className="text-sm text-[var(--muted)] py-2 text-center">Watching — night actions in progress...</p>
          ) : !amIAlive ? (
            <p className="text-sm text-[var(--muted)] py-2 text-center">
              You are eliminated. Watch the night unfold...
            </p>
          ) : myRole && NO_NIGHT_ACTION_ROLES.includes(myRole) ? (
            <p className="text-sm text-[var(--muted)] py-2 text-center">
              💤 You have no night action. Wait for sunrise...
            </p>
          ) : myRole === 'cupid' ? (
            myState?.cupidLinkedNames ? (
              <p className="text-sm text-pink-400 font-semibold">
                💘 You linked {myState.cupidLinkedNames[0]} &amp; {myState.cupidLinkedNames[1]} as Lovers.
              </p>
            ) : dayNumber !== 1 ? (
              <p className="text-sm text-[var(--muted)]">
                Cupid can only link Lovers on night one — nothing to do tonight.
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                💘 Tap two players below (in order) to link as Lovers.{' '}
                {cupidFirstPickName ? `First pick: ${cupidFirstPickName} — now tap the second.` : ''}
              </p>
            )
          ) : myRole === 'arsonist' ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">
                🔥 Tap a player below to douse them in fuel, or ignite everyone doused so far.
              </p>
              <button
                disabled={acting}
                onClick={onIgnite}
                className="w-full py-2 text-sm font-bold text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 rounded-xl transition"
              >
                🔥 Ignite (kill everyone doused so far)
              </button>
              {myState?.nightActionSubmitted && (
                <p className="text-xs text-emerald-400 font-semibold text-center">
                  ✓ Action submitted. Tap a different player to change it.
                </p>
              )}
            </div>
          ) : myRole === 'vigilante' && (myState?.vigilanteShotsRemaining ?? 0) < 1 ? (
            <p className="text-sm text-[var(--muted)]">You've used your one shot already. Nothing to do tonight.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">{myRole ? NIGHT_ACTION_PROMPT[myRole] : ''}</p>
              {myState?.nightActionSubmitted && (
                <p className="text-xs text-emerald-400 font-semibold">
                  ✓ Action submitted. Tap a different player to change it.
                </p>
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
                  #{p.seatNumber} {p.name}
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
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">☀️</span>
            <div>
              <h3 className="text-lg font-black text-[var(--foreground)]">Day {dayNumber} — Discussion</h3>
              <p className="text-xs text-[var(--muted)]">Debate who you think is Mafia. Voting opens next.</p>
            </div>
          </div>
          {amISpectator ? (
            <p className="text-sm text-[var(--muted)] text-center py-2">Watching the discussion...</p>
          ) : !amIAlive ? (
            <p className="text-sm text-[var(--muted)] text-center py-2">
              You are eliminated — watch the discussion below.
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)] text-center py-2">
              Use the chat below to discuss before voting opens.
            </p>
          )}
        </div>
      )}

      {phase === 'voting' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗳️</span>
            <div>
              <h3 className="text-lg font-black text-[var(--foreground)]">Day {dayNumber} — Vote</h3>
              <p className="text-xs text-[var(--muted)]">
                {votesRequired
                  ? `Get ready to vote! (${votesRequired} vote${votesRequired === 1 ? '' : 's'} required)`
                  : 'A strict majority of alive players is needed to lynch.'}
              </p>
            </div>
          </div>

          {amISpectator ? (
            <p className="text-sm text-[var(--muted)] text-center py-2">Watching — voting in progress...</p>
          ) : !amIAlive ? (
            <p className="text-sm text-[var(--muted)] text-center py-2">You are eliminated — watch the vote.</p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">Tap a player below to vote for them.</p>
              {myState?.dayVoteSubmitted && (
                <p className="text-xs text-emerald-400 font-semibold">
                  ✓ Vote cast{myRole === 'mayor' ? ' (counts double)' : ''}. Tap a different player to change it.
                </p>
              )}
              <button
                disabled={acting}
                onClick={onSkipVote}
                className="w-full py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] rounded-xl transition bg-[var(--surface-inset-bg)]"
              >
                ⏭ Skip / No Lynch
              </button>
            </>
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
              <p className="text-3xl font-black text-red-400">
                #{votedPlayer.seatNumber} {votedPlayer.name}
              </p>
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
