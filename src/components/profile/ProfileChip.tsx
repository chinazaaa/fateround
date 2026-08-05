'use client'

import { useState } from 'react'
import { SaveToProfileModal } from '@/components/profile/SaveToProfileModal'
import { useProfile } from '@/hooks/useProfile'

/**
 * The "you" button in the header (`docs/trophies-and-streaks.md` §2.5).
 *
 * It does two jobs at once, which is why it is one button and not a "Log in" link:
 *  - it is the **status label** — the word "Guest" is how a player learns their streak lives
 *    only on this device and isn't saved anywhere,
 *  - it is the **way in** — for a new player it's the save door, and for a returning player on
 *    a fresh device it's the login door, available before they play anything.
 *
 * Never a gate. Play is always instant and this is never shown at lobby join; it and the
 * post-win prompt are the only two places we ever raise signing in (§2.6).
 *
 * Counters are hidden until they're worth something. The spec shows `🔥 3 · 🏆 12 · Guest`, but
 * every counter reads 0 until the trophies batch ships, and `🔥 0 · 🏆 0` advertises emptiness
 * rather than progress. They appear on their own once the numbers are real.
 */
type Props = {
  /**
   * Which design-system scope the chip is rendered into.
   *
   * `fr-*` classes only resolve inside a `.fr-site` subtree — outside it their tokens don't
   * exist and the button renders unstyled. So the marketing header gets `site`, and the
   * in-game chrome (which is app-scope) gets `app`.
   */
  tone?: 'site' | 'app'
}

const APP_CLASS =
  'inline-flex h-9 max-w-44 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3.5 text-sm font-semibold text-muted transition-colors hover:text-[var(--foreground)] hover:border-[var(--border-strong)]'

export function ProfileChip({ tone = 'site' }: Props) {
  const [open, setOpen] = useState(false)
  const { profile, refresh } = useProfile()

  const signedIn = Boolean(profile && !profile.is_anonymous)
  // A guest reads "Guest", never their remembered name. The word is doing real work: it is how
  // a player learns their streak lives only on this device. Showing the name we remember from
  // Slice 1 would look friendlier and quietly imply the opposite.
  const label = signedIn ? profile?.handle || 'You' : 'Guest'

  const streak = profile?.current_streak ?? 0
  const trophies = profile?.trophy_points ?? 0

  return (
    <>
      <button
        type="button"
        className={tone === 'app' ? APP_CLASS : 'fr-icon-btn'}
        onClick={() => setOpen(true)}
        aria-label={signedIn ? `${label}${streak > 0 ? `, ${streak} day streak` : ''}` : 'Save your progress'}
      >
        {streak > 0 ? (
          <span className="shrink-0" aria-hidden>
            🔥 {streak}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
      </button>

      <SaveToProfileModal open={open} onClose={() => setOpen(false)} profile={profile} onChanged={refresh} />
    </>
  )
}
