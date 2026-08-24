import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard for the "numbers only update after a force-quit" bug class on mobile.
 *
 * Trophy points, streaks and trophy counts are written SERVER-SIDE by the award pass when a
 * game finishes. A mobile screen that fetches them once on mount therefore shows whatever was
 * true when it first rendered — and because Expo keeps the mounted screen alive, navigating
 * away and back does not remount it. The only thing that ever refreshed the Home chip's 🏆
 * count was force-quitting the app, which is exactly how this was reported.
 *
 * `useRefreshOnFocus` fixes it by refetching on screen focus AND on app resume. This test
 * fails when a screen or component reads profile/trophy data without one of those triggers,
 * so the next one added doesn't quietly reintroduce the bug.
 *
 * Deliberately narrow: it only looks at files that fetch PROFILE-DERIVED data, because that's
 * the data the award pass mutates behind the user's back. A screen reading its own game's
 * realtime state has other mechanisms and is not in scope.
 */

const MOBILE = join(process.cwd(), 'apps', 'mobile')

/** Fetches that return award-pass-owned numbers. */
const PROFILE_DATA = /fetchProfileGames|fetchProfileTrophies|\/api\/profile\/me|\/api\/leaderboard\/trophies/

/**
 * Any of these means the file re-reads rather than trusting its mount-time snapshot.
 *
 * Matches the CALL, not the identifier: an earlier version of this test matched the bare name
 * and so was satisfied by the `import { useRefreshOnFocus }` line alone — it passed against a
 * deliberately reintroduced bug. Import lines are stripped before matching for the same reason.
 */
const REFRESH_TRIGGER = /\buse(RefreshOnFocus|FocusEffect|OnAppResume)\s*\(/

/** Source with import statements removed, so an import can never stand in for a call. */
function bodyOf(rel: string): string {
  return readFileSync(join(MOBILE, rel), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*import\b/.test(line))
    .join('\n')
}

/**
 * Files that read profile data but legitimately need no focus refresh. Each needs a reason —
 * "it seemed fine" is the bug this test exists to catch.
 */
const EXEMPT: Record<string, string> = {
  // A one-shot prompt, not a stats display: it reads the handle to decide whether to ask for
  // a better name, and closes. Nothing on it goes stale while the user looks at it.
  'components/daily/DailyNamePrompt.tsx': 'one-shot name prompt, not a stats surface',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('mobile profile-derived screens refresh rather than trusting a mount snapshot', () => {
  const candidates = [join(MOBILE, 'app'), join(MOBILE, 'components')]
    .flatMap((dir) => walk(dir))
    .filter((file) => PROFILE_DATA.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(MOBILE.length + 1).replace(/\\/g, '/'))

  it('finds the profile-reading files (the guard is looking at something)', () => {
    expect(candidates.length).toBeGreaterThanOrEqual(3)
  })

  it('every profile-reading screen refetches on focus or app resume', () => {
    const stale = candidates.filter((rel) => !(rel in EXEMPT)).filter((rel) => !REFRESH_TRIGGER.test(bodyOf(rel)))
    expect(
      stale,
      'reads profile/trophy data with no focus or resume refetch — these numbers change ' +
        'server-side at game finish, so the screen would show pre-game values until the app ' +
        'is force-quit. Use useRefreshOnFocus, or add an EXEMPT entry with a reason.'
    ).toEqual([])
  })

  it('has no stale exemptions', () => {
    const gone = Object.keys(EXEMPT).filter((rel) => !candidates.includes(rel))
    expect(gone, 'exempted file no longer reads profile data — drop the exemption').toEqual([])
  })

  it('the shared hook covers both triggers', () => {
    const hook = readFileSync(join(MOBILE, 'hooks', 'useRefreshOnFocus.ts'), 'utf8')
    // Focus alone misses "app was backgrounded while this screen stayed focused"; resume alone
    // misses "navigated back to a screen that never unmounted". Both are needed.
    expect(hook, 'must refetch on screen focus').toMatch(/useFocusEffect/)
    expect(hook, 'must refetch when the app returns from the background').toMatch(/useOnAppResume/)
  })
})
