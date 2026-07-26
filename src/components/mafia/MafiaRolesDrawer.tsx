'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
const AURA_CHIP: Record<string, string> = {
  good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  evil: 'bg-red-500/10 text-red-400 border-red-500/20',
  unknown: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
}
const AURA_LABEL: Record<string, string> = {
  good: 'Good',
  evil: 'Evil',
  unknown: 'Unknown',
}

interface MafiaRolesDrawerProps {
  rolesInGame: MafiaRole[]
  myRole?: MafiaRole | null
  roleCounts?: Partial<Record<MafiaRole, number>>
}

function RolesOverlay({
  roles,
  myRole,
  roleCounts,
  onClose,
}: {
  roles: MafiaRole[]
  myRole?: MafiaRole | null
  roleCounts?: Partial<Record<MafiaRole, number>>
  onClose: () => void
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ isolation: 'isolate' }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex flex-col w-full h-full max-w-md mx-auto">
        {/* Top close bar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[var(--background)] border-b border-[var(--border)]">
          <h2 className="text-base font-black text-[var(--foreground)]">Roles in this game</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--surface-inset-bg)] border border-[var(--border)] text-[var(--foreground)] text-base font-bold"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable roles list */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[var(--background)] px-4 py-3 space-y-2.5">
          {roles.map((role) => {
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
                    {roleCounts && <span className="text-[var(--muted)] font-normal"> x{roleCounts[role] ?? 0}</span>}
                    {isMine && <span className="text-[var(--primary)] font-normal"> (your role)</span>}
                  </p>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">{info.description}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TEAM_CHIP[info.team] ?? ''}`}
                    >
                      Team: {TEAM_LABEL[info.team] ?? info.team}
                    </span>
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${AURA_CHIP[info.aura] ?? ''}`}
                    >
                      Aura: {AURA_LABEL[info.aura] ?? info.aura}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom close button */}
        <div className="shrink-0 px-4 py-3 bg-[var(--background)] border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-[var(--primary)] text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

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

      {open &&
        createPortal(
          <RolesOverlay roles={sortedRoles} myRole={myRole} roleCounts={roleCounts} onClose={() => setOpen(false)} />,
          document.body
        )}
    </>
  )
}
