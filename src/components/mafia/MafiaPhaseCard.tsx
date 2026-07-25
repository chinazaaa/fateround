'use client'

import type { MafiaPhase, MafiaMyState, MafiaRole } from '@/types'
import { MafiaRoleRevealScreen } from './MafiaRoleRevealScreen'
import { NO_NIGHT_ACTION_ROLES } from './mafia-role-info'

const NIGHT_ACTION_PROMPT: Partial<Record<MafiaRole, string>> = {
  mafia: '🔪 Tap a player below to eliminate tonight.',
  alpha_wolf: '🐺 Tap a player below for the crew to eliminate tonight (your vote counts double).',
  framer: '🎭 Tap a player below to frame — the Detective will read them as Mafia tonight.',
  doctor: '🏥 Tap a player below to protect from any attack tonight.',
  aura_seer: '🔍 Tap a player below to investigate their alignment.',
  bodyguard: '🛡️ Tap a player below to protect tonight. You auto-protect yourself too.',
  vigilante: '🔫 Your actions happen during the day. Wait for sunrise...',
  tracker: '👣 Tap a player below to track — learn who they visit tonight.',
  serial_killer: '🔪 Tap a player below to kill tonight.',
  medium: '🔮 Tap a dead player below to revive them.',
}

interface MafiaPhaseCardProps {
  phase: MafiaPhase
  dayNumber: number
  myState: MafiaMyState | null
  amIAlive: boolean
  amISpectator: boolean
  acting: boolean
  cupidFirstPickName: string | null
  onIgnite: () => void
  arsonistMode: 'douse' | 'ignite' | null
  onArsonistModeChange: (mode: 'douse' | 'ignite' | null) => void
  arsonistFirstPickName: string | null
  detectiveFirstPickName: string | null
  hasDeadPlayers: boolean
}

/**
 * Private per-player status only (role reveal, night-action instructions, voting's skip
 * control) — everything that's public narrative (day started, sunrise/vote results, votes
 * required) lives as system lines in the shared activity feed instead, since it's visible
 * to the whole town, not just the acting player. Actually picking a target/vote happens by
 * tapping a tile in MafiaPlayersGrid, not a button list here.
 */
export function MafiaPhaseCard({
  phase,
  dayNumber,
  myState,
  amIAlive,
  amISpectator,
  acting,
  cupidFirstPickName,
  onIgnite,
  arsonistMode,
  onArsonistModeChange,
  arsonistFirstPickName,
  detectiveFirstPickName,
  hasDeadPlayers,
}: MafiaPhaseCardProps) {
  const myRole = myState?.role

  if (phase === 'role_reveal') {
    return (
      <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
        <MafiaRoleRevealScreen myState={myState} />
      </div>
    )
  }

  if (phase === 'night') {
    return (
      <div className="glass-card border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌙</span>
          <h3 className="text-lg font-black text-[var(--foreground)]">Night</h3>
        </div>
        {amISpectator ? (
          <p className="text-sm text-[var(--muted)] py-2 text-center">Watching — night actions in progress...</p>
        ) : !amIAlive ? (
          <p className="text-sm text-[var(--muted)] py-2 text-center">You are eliminated. Watch the night unfold...</p>
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
            {!arsonistMode ? (
              <>
                <p className="text-sm text-[var(--muted)]">🔥 Choose your action for tonight:</p>
                <div className="flex gap-2">
                  <button
                    disabled={acting}
                    onClick={() => onArsonistModeChange('douse')}
                    className="flex-1 py-2 text-sm font-bold text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 rounded-xl transition"
                  >
                    🛢️ Douse (2 players)
                  </button>
                  <button
                    disabled={acting}
                    onClick={() => {
                      onArsonistModeChange('ignite')
                      onIgnite()
                    }}
                    className="flex-1 py-2 text-sm font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-xl transition"
                  >
                    🔥 Ignite all
                  </button>
                </div>
              </>
            ) : arsonistMode === 'douse' ? (
              <>
                <p className="text-sm text-[var(--muted)]">
                  🛢️ Tap two players below to douse in gasoline.{' '}
                  {arsonistFirstPickName ? `First pick: ${arsonistFirstPickName} — now tap the second.` : ''}
                </p>
                <button onClick={() => onArsonistModeChange(null)} className="text-xs text-[var(--muted)] underline">
                  Cancel
                </button>
                {myState?.nightActionSubmitted && (
                  <p className="text-xs text-emerald-400 font-semibold text-center">✓ Douse targets submitted.</p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-emerald-400 font-semibold text-center">
                  🔥 Ignite submitted — all doused players will burn!
                </p>
                <button onClick={() => onArsonistModeChange(null)} className="text-xs text-[var(--muted)] underline">
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : myRole === 'detective' ? (
          <p className="text-sm text-[var(--muted)]">
            🕵️ Tap two players below (in order) to check if they're on the same team.{' '}
            {detectiveFirstPickName ? `First pick: ${detectiveFirstPickName} — now tap the second.` : ''}
          </p>
        ) : myRole === 'vigilante' && (myState?.vigilanteShotsRemaining ?? 0) < 1 ? (
          <p className="text-sm text-[var(--muted)]">You've used your one shot already. Nothing to do tonight.</p>
        ) : myRole === 'medium' && (myState?.mediumReviveRemaining ?? 0) < 1 ? (
          <p className="text-sm text-[var(--muted)]">You've already used your revive. Nothing to do tonight.</p>
        ) : myRole === 'medium' && !hasDeadPlayers ? (
          <p className="text-sm text-[var(--muted)]">🔮 No one has died yet — nothing to revive tonight.</p>
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
    )
  }

  if (phase === 'voting' && amIAlive && !amISpectator && myState?.dayVoteSubmitted) {
    return (
      <div className="glass-card border border-[var(--border)] rounded-2xl p-4">
        <p className="text-xs text-emerald-400 font-semibold">
          ✓ Vote cast{myRole === 'mayor' ? ' (counts double)' : ''}. Tap a different player to change it.
        </p>
      </div>
    )
  }

  return null
}
