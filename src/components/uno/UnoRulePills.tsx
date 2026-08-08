import type { Game } from '@/types'
import { Glyph } from '@/components/icons/Glyph'
import type { IconSvgElement } from '@hugeicons/react'
import {
  UserGroupIcon,
  Layers01Icon,
  CardExchange01Icon,
  BalanceScaleIcon,
  Cards01Icon,
  ZapIcon,
  FireIcon,
} from '@hugeicons/core-free-icons'

/**
 * Compact pills showing which optional UNO rules are switched on for this game — so
 * players can see at a glance that it has Stacking, the 0-7 rule, Wild Draw Four
 * challenges, Multi-Play, or Team-Up. Shown on the join screen and during play.
 * Renders nothing when no optional rule is active.
 */
export function UnoRulePills({ game, className }: { game: Game; className?: string }) {
  const pills: { key: string; icon: IconSvgElement; label: string }[] = []
  const noMercy = game.uno_mode === 'no_mercy'
  if (noMercy) {
    pills.push({
      key: 'nomercy',
      icon: FireIcon,
      label: game.uno_no_mercy_win === 'last_standing' ? 'High Stakes · last standing' : 'High Stakes',
    })
  }
  if (!noMercy && game.uno_team_mode) pills.push({ key: 'team', icon: UserGroupIcon, label: 'Team-Up' })
  if (game.uno_stacking || noMercy) pills.push({ key: 'stack', icon: Layers01Icon, label: 'Stacking' })
  if (game.uno_zero_seven || noMercy) pills.push({ key: 'zeroseven', icon: CardExchange01Icon, label: '0-7 rule' })
  if (!noMercy && game.uno_wd4_challenge !== false) {
    pills.push({ key: 'wd4', icon: BalanceScaleIcon, label: 'WD4 challenge' })
  }
  if (game.uno_multi_play_mode && game.uno_multi_play_mode !== 'off') {
    pills.push({ key: 'multi', icon: Cards01Icon, label: 'Multi-Play' })
  }
  if (game.uno_jump_in || noMercy) pills.push({ key: 'jumpin', icon: ZapIcon, label: 'Jump-In' })

  if (pills.length === 0) return null

  return (
    <div className={`uno-rule-pills${className ? ` ${className}` : ''}`} aria-label="Active house rules">
      {pills.map((p) => (
        <span key={p.key} className="uno-rule-pill flex items-center gap-1">
          <Glyph icon={p.icon} size={11} className="shrink-0 text-[var(--primary)]" />
          <span>{p.label}</span>
        </span>
      ))}
    </div>
  )
}
