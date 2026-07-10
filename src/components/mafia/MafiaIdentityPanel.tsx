'use client'

import { MafiaSecretChat } from './MafiaChat'
import type { MafiaMyState, MafiaChatMessage } from '@/types'

const ROLE_EMOJI: Record<string, string> = {
  mafia: '🔪',
  doctor: '🏥',
  detective: '🔍',
  villager: '🏘️',
}

const ROLE_DESC: Record<string, string> = {
  mafia: 'Eliminate villagers at night. Blend in and avoid getting voted out.',
  doctor: 'Protect one player each night from the Mafia.',
  detective: 'Investigate one player each night to learn their alignment.',
  villager: 'Debate during the day to find and vote out the Mafia.',
}

interface MafiaIdentityPanelProps {
  myState: MafiaMyState | null
  myPlayerId: string | null
  amIAlive: boolean
  mafiaChatMessages: MafiaChatMessage[]
  onSendMafiaMessage: (msg: string) => Promise<void>
}

export function MafiaIdentityPanel({
  myState,
  myPlayerId,
  amIAlive,
  mafiaChatMessages,
  onSendMafiaMessage,
}: MafiaIdentityPanelProps) {
  const myRole = myState?.role
  const myTeam = myState?.team

  return (
    <div className="md:col-span-1 space-y-4">
      <div className="glass-card border border-[var(--border)] rounded-2xl p-5 flex flex-col items-center text-center space-y-3">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">Your Identity</p>

        {myState ? (
          <>
            <div className="text-5xl">{ROLE_EMOJI[myRole ?? 'villager']}</div>
            <div
              className={`text-xl font-extrabold tracking-widest ${
                myTeam === 'mafia' ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {(myRole ?? 'villager').toUpperCase()}
            </div>
            <div
              className={`text-xs px-3 py-1 rounded-full font-semibold border ${
                myTeam === 'mafia'
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}
            >
              Team {myTeam === 'mafia' ? 'Mafia 🔪' : 'Village 🏘️'}
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">{ROLE_DESC[myRole ?? 'villager']}</p>

            {myState.mafiaTeammates.length > 0 && (
              <div className="w-full text-left bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">Mafia Allies</p>
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

      {myState?.role === 'mafia' && amIAlive && (
        <MafiaSecretChat
          messages={mafiaChatMessages}
          onSendMessage={onSendMafiaMessage}
          myPlayerId={myPlayerId}
        />
      )}
    </div>
  )
}
