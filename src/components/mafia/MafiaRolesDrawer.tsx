'use client'

import { useState } from 'react'
import type { MafiaRole } from '@/types'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from './mafia-role-info'

const TEAM_TEXT: Record<string, string> = {
  village: 'text-emerald-400',
  mafia: 'text-red-400',
  solo: 'text-amber-400',
  special: 'text-pink-400',
}
const TEAM_CHIP: Record<string, string> = {
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

interface MafiaRolesDrawerProps {
  /** Roles actually assigned to a player this game (alive or eliminated) — what the drawer
   *  should list. Falls back to enabledRoles (the host's toggle settings) only if the game
   *  hasn't assigned roles yet. */
  rolesInGame: MafiaRole[]
  /** The local player's own role — sorted first in the list so it's the first (and easiest
   *  to read) thing they see, matching Wolvesville's role-detail popup. */
  myRole?: MafiaRole | null
  /** How many players are still alive with each role — shown as "x{count}", matching
   *  Wolvesville, and decrementing live as role-holders are eliminated. */
  roleCounts?: Partial<Record<MafiaRole, number>>
}

/**
 * Persistent "Roles" info button + slide-over drawer listing every role actually assigned to
 * someone in this game (not every role the host merely toggled on), so players can check what
 * a role does at any time without it being a spoiler — rules text only, no live game info. A
 * role a late joiner is assigned appears the next time this list refreshes.
 */
export function MafiaRolesDrawer({ rolesInGame, myRole, roleCounts }: MafiaRolesDrawerProps) {
  const [open, setOpen] = useState(false)
  const sortedRoles = myRole ? [myRole, ...rolesInGame.filter((r) => r !== myRole)] : rolesInGame

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-semibold border border-[var(--border)] bg-[var(--surface-inset-bg)] hover:border-[var(--primary)] transition"
      >
        ℹ️ Roles
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-[80%] max-w-sm bg-[var(--background)] border-l border-[var(--border)] shadow-2xl flex flex-col max-h-dvh h-dvh overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[var(--background)] border-b border-[var(--border)]">
              <h2 className="text-base font-black text-[var(--foreground)]">Roles in this game</h2>
              <button
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--surface-inset-bg)] text-[var(--foreground)] text-lg font-bold"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2.5 pb-[env(safe-area-inset-bottom,16px)]">
              {sortedRoles.map((role) => {
                const info = MAFIA_ROLE_INFO[role]
                if (!info) return null
                const isMine = role === myRole
                return (
                  <div
                    key={role}
                    className={`bg-[var(--surface-inset-bg)] border rounded-xl p-3 flex gap-3 ${
                      isMine ? 'border-[var(--primary)]' : 'border-[var(--border)]'
                    }`}
                  >
                    <span className="text-2xl">{mafiaRoleEmoji(role)}</span>
                    <div className="space-y-1">
                      <p className={`font-bold text-sm ${TEAM_TEXT[info.team] ?? 'text-[var(--foreground)]'}`}>
                        {info.name}
                        {roleCounts && (
                          <span className="text-[var(--muted)] font-normal"> x{roleCounts[role] ?? 0}</span>
                        )}
                        {isMine && <span className="text-[var(--primary)] font-normal"> (your role)</span>}
                      </p>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">{info.description}</p>
                      <span
                        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TEAM_CHIP[info.team] ?? ''}`}
                      >
                        Team: {TEAM_LABEL[info.team] ?? info.team}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
