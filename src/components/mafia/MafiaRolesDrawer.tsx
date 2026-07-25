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

interface MafiaRolesDrawerProps {
  enabledRoles: MafiaRole[]
}

/**
 * Persistent "Roles" info button + slide-over drawer listing every role enabled in this
 * game, so players can check what a role does at any time without it being a spoiler —
 * rules text only, no live game info.
 */
export function MafiaRolesDrawer({ enabledRoles }: MafiaRolesDrawerProps) {
  const [open, setOpen] = useState(false)

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
          <div className="relative w-full max-w-sm h-full bg-[var(--background)] border-l border-[var(--border)] shadow-2xl overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-[var(--foreground)]">Roles in this game</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {enabledRoles.map((role) => {
                const info = MAFIA_ROLE_INFO[role]
                if (!info) return null
                return (
                  <div
                    key={role}
                    className="bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-xl p-3 flex gap-3"
                  >
                    <span className="text-2xl">{mafiaRoleEmoji(role)}</span>
                    <div>
                      <p className={`font-bold text-sm ${TEAM_TEXT[info.team] ?? 'text-[var(--foreground)]'}`}>
                        {info.name}
                      </p>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">{info.description}</p>
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
