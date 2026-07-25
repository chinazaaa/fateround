'use client'

import { MafiaSecretChat } from './MafiaChat'
import type { MafiaMyState, MafiaChatMessage, MafiaPhase } from '@/types'
import { MAFIA_TEAM_ROLES } from './mafia-role-info'

interface MafiaIdentityPanelProps {
  myState: MafiaMyState | null
  myPlayerId: string | null
  mySeatNumber: number | null
  amIAlive: boolean
  phase: MafiaPhase
  mafiaChatMessages: MafiaChatMessage[]
  onSendMafiaMessage: (msg: string) => Promise<void>
}

/**
 * Dynamic private results only (investigation/tracking results, teammates, lover status,
 * bodyguard/vigilante/framer/cupid outcomes) plus the Mafia secret chat. Your role/team card
 * itself lives on your own tile in MafiaPlayersGrid instead of a separate panel, to keep the
 * page compact.
 */
export function MafiaIdentityPanel({
  myState,
  myPlayerId,
  amIAlive,
  phase,
  mafiaChatMessages,
  onSendMafiaMessage,
}: MafiaIdentityPanelProps) {
  const myRole = myState?.role
  const isWolfTeam = !!myRole && MAFIA_TEAM_ROLES.includes(myRole)
  // The wolf-team secret chat is night-only — during the day it's just noise, and coordination
  // for the next kill only matters once night starts again.
  const showSecretChat = isWolfTeam && amIAlive && phase === 'night'

  const hasDynamicInfo =
    !!myState &&
    (myState.isLover ||
      myState.mafiaTeammates.length > 0 ||
      !!myState.detectiveResult ||
      !!myState.trackerResult ||
      (myRole === 'bodyguard' && !!myState.bodyguardLastOutcome && myState.bodyguardLastOutcome !== 'no_attack') ||
      (myRole === 'doctor' && !!myState.doctorLastOutcome && myState.doctorLastOutcome !== 'no_attack') ||
      myRole === 'vigilante' ||
      (myRole === 'framer' && !!myState.framerLastTargetName) ||
      (myRole === 'cupid' && !!myState.cupidLinkedNames))

  if (!hasDynamicInfo && !showSecretChat) return null

  return (
    <div className="space-y-3">
      {myState?.isLover && (
        <div className="glass-card border border-pink-500/20 rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-1">💘 In Love</p>
          <p className="text-sm text-[var(--foreground)]">
            You are linked with <strong>{myState.loverPartnerName ?? 'someone'}</strong>. You win together if you both
            survive.
          </p>
        </div>
      )}

      {myState && myState.mafiaTeammates.length > 0 && (
        <div className="glass-card border border-red-500/20 rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">
            {isWolfTeam ? 'Mafia Crew' : 'Mafia Allies'}
          </p>
          <p className="text-sm text-[var(--foreground)]">{myState.mafiaTeammates.join(', ')}</p>
        </div>
      )}

      {myState?.detectiveResult && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-1">Investigation</p>
          <p className="text-sm">
            <strong className="text-[var(--foreground)]">{myState.detectiveResult.targetName}</strong>
            {' is '}
            <span
              className={
                myState.detectiveResult.alignment === 'mafia' ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'
              }
            >
              {myState.detectiveResult.alignment === 'mafia' ? 'MAFIA 🔪' : 'INNOCENT 🏘️'}
            </span>
          </p>
        </div>
      )}

      {myState?.trackerResult && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-1">Tracking Result</p>
          <p className="text-sm text-[var(--foreground)]">
            <strong>{myState.trackerResult.targetName}</strong>{' '}
            {myState.trackerResult.visitedName
              ? `visited ${myState.trackerResult.visitedName} last night.`
              : 'visited no one last night.'}
          </p>
        </div>
      )}

      {myRole === 'bodyguard' && myState?.bodyguardLastOutcome && myState.bodyguardLastOutcome !== 'no_attack' && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">
            {myState.bodyguardLastOutcome === 'sacrificed'
              ? 'You died protecting your target last night.'
              : 'Your target was attacked and you saved them last night.'}
          </p>
        </div>
      )}

      {myRole === 'doctor' && myState?.doctorLastOutcome && myState.doctorLastOutcome !== 'no_attack' && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">Your target was attacked and you saved them last night.</p>
        </div>
      )}

      {myRole === 'vigilante' && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">
            Shots remaining: <strong>{myState?.vigilanteShotsRemaining ?? 1}</strong>
          </p>
        </div>
      )}

      {myRole === 'framer' && myState?.framerLastTargetName && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">
            You framed <strong>{myState.framerLastTargetName}</strong> last night.
          </p>
        </div>
      )}

      {myRole === 'cupid' && myState?.cupidLinkedNames && (
        <div className="glass-card border border-pink-500/20 rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-1">💘 Lovers Linked</p>
          <p className="text-sm text-[var(--foreground)]">
            {myState.cupidLinkedNames[0]} &amp; {myState.cupidLinkedNames[1]}
          </p>
        </div>
      )}

      {showSecretChat && (
        <MafiaSecretChat messages={mafiaChatMessages} onSendMessage={onSendMafiaMessage} myPlayerId={myPlayerId} />
      )}
    </div>
  )
}
