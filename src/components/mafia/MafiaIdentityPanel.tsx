'use client'

import { MafiaSecretChat } from './MafiaChat'
import type { MafiaMyState, MafiaChatMessage } from '@/types'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji, MAFIA_TEAM_ROLES } from './mafia-role-info'

const TEAM_TEXT: Record<string, string> = {
  village: 'text-emerald-400',
  mafia: 'text-red-400',
  solo: 'text-amber-400',
  special: 'text-pink-400',
}
const TEAM_BADGE: Record<string, string> = {
  village: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  mafia: 'bg-red-500/10 text-red-400 border-red-500/20',
  solo: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  special: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
}
const TEAM_LABEL: Record<string, string> = {
  village: 'Village',
  mafia: 'Mafia',
  solo: 'Solo',
  special: 'Special',
}

interface MafiaIdentityPanelProps {
  myState: MafiaMyState | null
  myPlayerId: string | null
  mySeatNumber: number | null
  amIAlive: boolean
  mafiaChatMessages: MafiaChatMessage[]
  onSendMafiaMessage: (msg: string) => Promise<void>
}

export function MafiaIdentityPanel({
  myState,
  myPlayerId,
  mySeatNumber,
  amIAlive,
  mafiaChatMessages,
  onSendMafiaMessage,
}: MafiaIdentityPanelProps) {
  const myRole = myState?.role
  const info = myRole ? MAFIA_ROLE_INFO[myRole] : null
  const team = info?.team ?? 'village'
  const isWolfTeam = !!myRole && MAFIA_TEAM_ROLES.includes(myRole)

  return (
    <div className="md:col-span-1 space-y-4">
      <div className="glass-card border border-[var(--border)] rounded-2xl p-5 flex flex-col items-center text-center space-y-3">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">
          Your Identity{mySeatNumber != null ? ` · #${mySeatNumber} (you)` : ''}
        </p>

        {myState && info ? (
          <>
            <div className="text-5xl">{mafiaRoleEmoji(myRole ?? 'villager')}</div>
            <div className={`text-xl font-extrabold tracking-widest ${TEAM_TEXT[team]}`}>{info.name.toUpperCase()}</div>
            <div className={`text-xs px-3 py-1 rounded-full font-semibold border ${TEAM_BADGE[team]}`}>
              Team {TEAM_LABEL[team]}
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">{info.description}</p>

            {myState.isLover && (
              <div className="w-full text-left bg-pink-500/5 border border-pink-500/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-1">💘 In Love</p>
                <p className="text-sm text-[var(--foreground)]">
                  You are linked with <strong>{myState.loverPartnerName ?? 'someone'}</strong>. You win together if you
                  both survive.
                </p>
              </div>
            )}

            {myState.mafiaTeammates.length > 0 && (
              <div className="w-full text-left bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">
                  {isWolfTeam ? 'Mafia Crew' : 'Mafia Allies'}
                </p>
                <p className="text-sm text-[var(--foreground)]">{myState.mafiaTeammates.join(', ')}</p>
              </div>
            )}

            {myState.detectiveResult && (
              <div className="w-full text-left bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-xl p-3">
                <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-1">
                  Investigation
                </p>
                <p className="text-sm">
                  <strong className="text-[var(--foreground)]">{myState.detectiveResult.targetName}</strong>
                  {' is '}
                  <span
                    className={
                      myState.detectiveResult.alignment === 'mafia'
                        ? 'text-red-400 font-bold'
                        : 'text-emerald-400 font-bold'
                    }
                  >
                    {myState.detectiveResult.alignment === 'mafia' ? 'MAFIA 🔪' : 'INNOCENT 🏘️'}
                  </span>
                </p>
              </div>
            )}

            {myState.trackerResult && (
              <div className="w-full text-left bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-xl p-3">
                <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-1">
                  Tracking Result
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  <strong>{myState.trackerResult.targetName}</strong>{' '}
                  {myState.trackerResult.visitedName
                    ? `visited ${myState.trackerResult.visitedName} last night.`
                    : 'visited no one last night.'}
                </p>
              </div>
            )}

            {myRole === 'bodyguard' && myState.bodyguardLastOutcome && myState.bodyguardLastOutcome !== 'no_attack' && (
              <div className="w-full text-left bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-xl p-3">
                <p className="text-sm text-[var(--foreground)]">
                  {myState.bodyguardLastOutcome === 'sacrificed'
                    ? 'You died protecting your target last night.'
                    : 'Your target was attacked and you saved them last night.'}
                </p>
              </div>
            )}

            {myRole === 'vigilante' && (
              <div className="w-full text-left bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-xl p-3">
                <p className="text-sm text-[var(--foreground)]">
                  Shots remaining: <strong>{myState.vigilanteShotsRemaining ?? 1}</strong>
                </p>
              </div>
            )}

            {myRole === 'framer' && myState.framerLastTargetName && (
              <div className="w-full text-left bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-xl p-3">
                <p className="text-sm text-[var(--foreground)]">
                  You framed <strong>{myState.framerLastTargetName}</strong> last night.
                </p>
              </div>
            )}

            {myRole === 'cupid' && myState.cupidLinkedNames && (
              <div className="w-full text-left bg-pink-500/5 border border-pink-500/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-1">💘 Lovers Linked</p>
                <p className="text-sm text-[var(--foreground)]">
                  {myState.cupidLinkedNames[0]} &amp; {myState.cupidLinkedNames[1]}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-4xl">👁️</div>
            <p className="text-sm text-[var(--muted)] font-semibold">Spectating</p>
            <p className="text-xs text-[var(--muted)]">You are watching this game.</p>
          </>
        )}

        <div className="pt-2 border-t border-[var(--border)] w-full text-center">
          <span
            className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-semibold border ${
              amIAlive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}
          >
            {amIAlive ? '💚 ALIVE' : '💀 ELIMINATED'}
          </span>
        </div>
      </div>

      {isWolfTeam && amIAlive && (
        <MafiaSecretChat messages={mafiaChatMessages} onSendMessage={onSendMafiaMessage} myPlayerId={myPlayerId} />
      )}
    </div>
  )
}
