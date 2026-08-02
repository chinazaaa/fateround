'use client'

import { useEffect, useState } from 'react'
import { SaveToProfileModal } from '@/components/profile/SaveToProfileModal'
import { useProfile } from '@/hooks/useProfile'
import { onTrophiesEarned, type EarnedTrophy } from '@/lib/trophies/earned-events'

const TIER_EMOJI: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '🏆',
}

/**
 * The second — and only active — signup surface (`docs/trophies-and-streaks.md` §2.6).
 *
 * The profile chip is passive: it is always there and never interrupts, which means it only
 * converts people who go looking. This is the one moment we actually ask, and it is deliberately
 * the moment of highest motivation: the player has just earned something and has not yet been
 * told it might not be kept.
 *
 * RULES THIS MUST NOT BREAK:
 *  - It appears only AFTER earned value, never at lobby join. It is driven by an award event,
 *    so there is no path where it can fire before a game is finished.
 *  - A signed-in player is congratulated and never asked for anything — showing a save prompt
 *    to someone whose progress is already saved is noise that teaches people to dismiss it.
 *  - It is a card, not a blocking modal. This lands right after a game ends, next to the
 *    results everyone is reading; stealing the screen there would be worse than not asking.
 */
export function PostWinPrompt() {
  const [trophies, setTrophies] = useState<EarnedTrophy[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const { profile, refresh } = useProfile()

  useEffect(() => {
    return onTrophiesEarned((earned) => {
      setTrophies(earned)
      setDismissed(false)
    })
  }, [])

  if (!trophies.length || dismissed) return null

  const signedIn = Boolean(profile && !profile.is_anonymous)
  const best = trophies[0]
  const emoji = TIER_EMOJI[best.tier] ?? '🏅'
  const headline =
    trophies.length === 1 ? `${emoji} ${best.title}` : `${emoji} ${best.title} +${trophies.length - 1} more`

  return (
    <>
      <div
        role="status"
        className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card-strong)] p-4 shadow-lg backdrop-blur-md sm:left-auto sm:right-4 sm:mx-0"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold">{headline}</p>
            <p className="mt-0.5 text-sm text-muted">
              {signedIn
                ? 'Added to your profile.'
                : // The specific thing they'd lose, not a generic "sign up" — the loss is the
                  // reason, and naming it is the whole pitch.
                  "Saved on this device only. Add your email so it's not lost."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="shrink-0 text-faint hover:text-[var(--foreground)]"
          >
            ✕
          </button>
        </div>

        {!signedIn && (
          <button type="button" className="btn-primary mt-3 py-2 text-sm" onClick={() => setSaveOpen(true)}>
            Save to profile
          </button>
        )}
      </div>

      <SaveToProfileModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        profile={profile}
        onChanged={() => {
          refresh()
          // Once saved there is nothing left to ask for, so the card retires itself rather than
          // sitting there with a button that would now be a no-op.
          setDismissed(true)
        }}
      />
    </>
  )
}
