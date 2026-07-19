import type { Game } from '@/types'

/**
 * Compact pills showing which optional UNO rules are switched on for this game — so
 * players can see at a glance that it has Stacking, the 0-7 rule, Wild Draw Four
 * challenges, Multi-Play, or Team-Up. Shown on the join screen and during play.
 * Renders nothing when no optional rule is active.
 */
export function UnoRulePills({ game, className }: { game: Game; className?: string }) {
  const pills: { key: string; icon: string; label: string }[] = []
  if (game.uno_team_mode) pills.push({ key: 'team', icon: '🤝', label: 'Team-Up' })
  if (game.uno_stacking) pills.push({ key: 'stack', icon: '📚', label: 'Stacking' })
  if (game.uno_zero_seven) pills.push({ key: 'zeroseven', icon: '🔁', label: '0-7 rule' })
  if (game.uno_wd4_challenge !== false) pills.push({ key: 'wd4', icon: '⚖️', label: 'WD4 challenge' })
  if (game.uno_multi_play_mode && game.uno_multi_play_mode !== 'off') {
    pills.push({ key: 'multi', icon: '🃏', label: 'Multi-Play' })
  }

  if (pills.length === 0) return null

  return (
    <div className={`uno-rule-pills${className ? ` ${className}` : ''}`} aria-label="Active house rules">
      {pills.map((p) => (
        <span key={p.key} className="uno-rule-pill">
          <span aria-hidden>{p.icon}</span>
          {p.label}
        </span>
      ))}
    </div>
  )
}
