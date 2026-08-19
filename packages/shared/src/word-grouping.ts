export const WORD_GROUPING_MIN_PLAYERS = 1
export const WORD_GROUPING_MAX_PLAYERS = 20
export const WORD_GROUPING_DEFAULT_MAX_PLAYERS = 20

export const WORD_GROUPING_DEFAULT_DURATION = 300
export const WORD_GROUPING_GAME_DURATION_OPTIONS = [0, 120, 180, 240, 300, 600] as const

export const WORD_GROUPING_MAX_MISTAKES = 4
export const WORD_GROUPING_TOTAL_GROUPS = 4
export const WORD_GROUPING_WORDS_PER_GROUP = 4

export const WORD_GROUPING_GROUP_POINTS: Record<number, number> = {
  1: 100,
  2: 200,
  3: 300,
  4: 400,
}

export function formatWordGroupingGameDuration(seconds: number): string {
  if (!seconds) return 'No limit'
  const minutes = Math.round(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export const WORD_GROUPING_FIRST_BONUS = 50
export const WORD_GROUPING_MISTAKE_PENALTY = -25
export const WORD_GROUPING_PERFECT_BONUS = 500

export interface WordGroupingGroup {
  category: string
  words: string[]
  difficulty: 1 | 2 | 3 | 4
}

export interface WordGroupingPuzzle {
  words: string[]
  groups: WordGroupingGroup[]
}

export function tallyWordGroupingScores(
  players: { id: string; name: string }[],
  submissions: {
    player_id: string
    group_index: number
    difficulty: number
    is_correct: boolean
    mistakes_at_time: number
    submitted_at: string
  }[]
): { id: string; name: string; points: number; groups: number; mistakes: number; lastAt: string }[] {
  const map = new Map<string, { points: number; groups: number; mistakes: number; lastAt: string }>()

  for (const p of players) {
    map.set(p.id, { points: 0, groups: 0, mistakes: 0, lastAt: '' })
  }

  const groupFirstSolver = new Map<number, string>()
  const sortedSubs = [...submissions]
    .filter((s) => s.is_correct)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))

  for (const sub of sortedSubs) {
    if (!groupFirstSolver.has(sub.group_index)) {
      groupFirstSolver.set(sub.group_index, sub.player_id)
    }
  }

  for (const sub of submissions) {
    const entry = map.get(sub.player_id)
    if (!entry) continue

    if (sub.is_correct) {
      const base = WORD_GROUPING_GROUP_POINTS[sub.difficulty] ?? 100
      const firstBonus = groupFirstSolver.get(sub.group_index) === sub.player_id ? WORD_GROUPING_FIRST_BONUS : 0
      entry.points += base + firstBonus
      entry.groups += 1
      if (sub.submitted_at > entry.lastAt) entry.lastAt = sub.submitted_at
    } else {
      entry.points += WORD_GROUPING_MISTAKE_PENALTY
      entry.mistakes += 1
    }
  }

  for (const [, entry] of map) {
    if (entry.groups === WORD_GROUPING_TOTAL_GROUPS && entry.mistakes === 0) {
      entry.points += WORD_GROUPING_PERFECT_BONUS
    }
  }

  return (
    players
      .map((p) => {
        const e = map.get(p.id)!
        // lastAt = when this player's final correct group landed, so callers can show how
        // long they took. Empty string when they never solved one.
        return { id: p.id, name: p.name, points: e.points, groups: e.groups, mistakes: e.mistakes, lastAt: e.lastAt }
      })
      // Final tiebreak on finish time: whoever got there first wins an otherwise exact tie,
      // instead of the order being whatever the players array happened to be. Plain lexicographic
      // compare — ISO timestamps sort correctly with `<`/`>`, and `localeCompare` here would
      // apply ICU collation (ignorables, variable weights) that's the wrong tool for this string
      // shape. Empty `lastAt` sorts LAST so never-solved players fall to the bottom on ties.
      .sort((a, b) => {
        const primary = b.points - a.points || b.groups - a.groups || a.mistakes - b.mistakes
        if (primary !== 0) return primary
        const ea = a.lastAt === ''
        const eb = b.lastAt === ''
        if (ea && eb) return 0
        if (ea) return 1
        if (eb) return -1
        return a.lastAt < b.lastAt ? -1 : a.lastAt > b.lastAt ? 1 : 0
      })
  )
}
