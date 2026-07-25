import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from './mafia-role-info'
import type { MafiaRole } from '@/types'

const TEAM_ORDER: Array<{ key: 'village' | 'mafia' | 'solo' | 'special'; label: string; color: string }> = [
  { key: 'village', label: 'Village', color: '#34d399' },
  { key: 'mafia', label: 'Mafia', color: '#f87171' },
  { key: 'solo', label: 'Solo', color: '#fbbf24' },
  { key: 'special', label: 'Special', color: '#f472b6' },
]

const TEAM_BG: Record<string, string> = {
  village: 'color-mix(in srgb, #34d399 8%, var(--surface))',
  mafia: 'color-mix(in srgb, #f87171 8%, var(--surface))',
  solo: 'color-mix(in srgb, #fbbf24 8%, var(--surface))',
  special: 'color-mix(in srgb, #f472b6 8%, var(--surface))',
}

export function MafiaRolesLanding() {
  const roles = Object.values(MAFIA_ROLE_INFO)

  return (
    <section>
      <h2 className="sec-title-fr">All roles</h2>
      <div className="space-y-6">
        {TEAM_ORDER.map((team) => {
          const teamRoles = roles.filter((r) => r.team === team.key)
          if (teamRoles.length === 0) return null
          return (
            <div key={team.key}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: team.color }}>
                {team.label} team
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {teamRoles.map((info) => (
                  <div
                    key={info.role}
                    className="flex gap-3 rounded-[var(--radius-lg)] px-4 py-3"
                    style={{
                      background: TEAM_BG[info.team],
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span className="text-2xl leading-none mt-0.5">{mafiaRoleEmoji(info.role as MafiaRole)}</span>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                        {info.name}
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {info.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
