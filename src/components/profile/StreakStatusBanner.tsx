'use client'

import { streakStatus, type StreakStanding } from '@/lib/trophies/streak'

/**
 * The at-risk state for a day streak, on the surfaces where a player would look for it.
 *
 * WHY THIS EXISTS. The streak was write-only in the UI: a number and a flame, with nothing to
 * say it was about to lapse. A player who had built 30 days got the same "🔥 30" at 9am on a
 * day they'd played and at 11pm on a day they hadn't — the one moment the number should be
 * shouting. Visibility is the whole payoff for coming back (`docs/trophies-and-streaks.md`
 * §4.5), and half of visibility is knowing when it's in danger.
 *
 * The banner renders nothing in the states with nothing to say: no streak, already played
 * today, or already lost. A nudge about a streak that's already gone reads as a reprimand.
 */
export type StreakProfileFields = {
  current_streak: number
  last_active_date: string | null
  streak_freezes: number
}

/** Copy per standing. `null` means "say nothing" — see the note above. */
function noteFor(
  standing: StreakStanding,
  streak: number,
  freezes: number
): { text: string; tone: 'warn' | 'info' } | null {
  if (standing === 'at_risk') {
    return {
      text:
        freezes > 0
          ? `Play today to keep your ${streak}-day streak — or one of your ${freezes === 1 ? 'freeze' : `${freezes} freezes`} covers it.`
          : `Play today to keep your ${streak}-day streak.`,
      tone: 'warn',
    }
  }
  if (standing === 'frozen') {
    // They already missed a day. The freeze is not spent until they next play, so returning
    // today is what stops the bill growing.
    return {
      text: `You missed a day — a freeze will cover it. Play today so it doesn't cost another.`,
      tone: 'info',
    }
  }
  return null
}

export function StreakStatusBanner({ profile }: { profile: StreakProfileFields | null | undefined }) {
  if (!profile) return null
  const { standing, streak, freezes } = streakStatus(profile)
  const note = noteFor(standing, streak, freezes)
  if (!note) return null

  return (
    <div
      className={`glass-card flex items-center gap-3 p-3 text-sm ${
        note.tone === 'warn' ? 'border-[color-mix(in_srgb,var(--primary)_45%,transparent)]' : ''
      }`}
      role="status"
    >
      <span className="text-xl" aria-hidden>
        {note.tone === 'warn' ? '🔥' : '🧊'}
      </span>
      <p className="text-body min-w-0 flex-1">{note.text}</p>
    </div>
  )
}

/**
 * Whether the flame should read as "burning down" rather than lit — used by `ProfileChip`,
 * where there is only room for the number itself.
 */
export function streakIsAtRisk(profile: StreakProfileFields | null | undefined): boolean {
  if (!profile) return false
  const { standing } = streakStatus(profile)
  return standing === 'at_risk' || standing === 'frozen'
}
