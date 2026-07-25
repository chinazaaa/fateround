'use client'

import type { MafiaMyState } from '@/types'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from './mafia-role-info'

const TEAM_STYLE: Record<string, string> = {
  village: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  mafia: 'text-red-400 bg-red-500/10 border-red-500/20',
  solo: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  special: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
}

const TEAM_LABEL: Record<string, string> = {
  village: 'Village',
  mafia: 'Mafia',
  solo: 'Solo',
  special: 'Special',
}

interface MafiaRoleRevealScreenProps {
  myState: MafiaMyState | null
}

/**
 * A full-screen "you are..." moment shown once per player before night 1, matching
 * Wolvesville's explicit role-reveal beat instead of a generic placeholder.
 */
export function MafiaRoleRevealScreen({ myState }: MafiaRoleRevealScreenProps) {
  if (!myState) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="text-5xl">👁️</div>
        <h3 className="text-xl font-black text-[var(--foreground)]">You are spectating</h3>
        <p className="text-sm text-[var(--muted)]">Roles have been assigned. Night begins shortly...</p>
      </div>
    )
  }

  const info = MAFIA_ROLE_INFO[myState.role]
  const teamStyle = TEAM_STYLE[info.team]

  return (
    <div className="text-center py-8 space-y-5">
      <p className="text-xs uppercase tracking-widest text-[var(--muted)] font-bold">You are...</p>
      <div className="text-7xl">{mafiaRoleEmoji(myState.role)}</div>
      <h2 className="text-3xl font-black text-[var(--foreground)]">{info.name}</h2>
      <span className={`inline-flex text-xs px-3 py-1 rounded-full font-semibold border ${teamStyle}`}>
        Team {TEAM_LABEL[info.team]}
      </span>
      <p className="max-w-sm mx-auto text-sm text-[var(--muted)] leading-relaxed">{info.description}</p>

      {myState.mafiaTeammates.length > 0 && (
        <div className="max-w-sm mx-auto text-left bg-red-500/5 border border-red-500/20 rounded-xl p-3">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">Your Allies</p>
          <p className="text-sm text-[var(--foreground)]">{myState.mafiaTeammates.join(', ')}</p>
        </div>
      )}

      <div className="inline-flex items-center gap-2 text-xs text-[var(--muted)] bg-[var(--surface-inset-bg)] px-4 py-2 rounded-full border border-[var(--border)]">
        <span>🤫</span> Do not show your screen to anyone!
      </div>
    </div>
  )
}
