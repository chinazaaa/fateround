// Codewords end-game stat tallies — ported from web src/lib/codewords.ts so the
// mobile finish screen can show MVP cards + operative/spymaster leaderboards
// without touching shared package files.
import type { CodewordsGuess, CodewordsPlayerRole, CodewordsTeam } from '@fateround/shared'

export type CodewordsOperativeStat = {
  playerId: string
  name: string
  team: CodewordsTeam
  score: number
  correct: number
  wrong: number
  hitAssassin: boolean
}

export type CodewordsSpymasterStat = {
  playerId: string
  name: string
  team: CodewordsTeam
  score: number
  cluesGiven: number
  wordsFound: number
}

export function tallyCodewordsOperativeStats(
  guesses: CodewordsGuess[],
  roles: CodewordsPlayerRole[],
  players: Array<{ id: string; name: string }>
): CodewordsOperativeStat[] {
  const roleByPlayer = new Map(roles.map((r) => [r.player_id, r]))
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const stats = new Map<string, CodewordsOperativeStat>()

  for (const guess of guesses) {
    const role = roleByPlayer.get(guess.player_id)
    if (!role || role.role !== 'operative') continue

    let stat = stats.get(guess.player_id)
    if (!stat) {
      stat = {
        playerId: guess.player_id,
        name: nameById.get(guess.player_id) ?? 'Unknown',
        team: role.team,
        score: 0,
        correct: 0,
        wrong: 0,
        hitAssassin: false,
      }
      stats.set(guess.player_id, stat)
    }

    if (guess.cell_type === role.team) {
      stat.correct += 1
      stat.score += 10
    } else {
      stat.wrong += 1
      stat.score -= 2
      if (guess.cell_type === 'assassin') stat.hitAssassin = true
    }
  }

  for (const role of roles) {
    if (role.role !== 'operative' || stats.has(role.player_id)) continue
    stats.set(role.player_id, {
      playerId: role.player_id,
      name: nameById.get(role.player_id) ?? 'Unknown',
      team: role.team,
      score: 0,
      correct: 0,
      wrong: 0,
      hitAssassin: false,
    })
  }

  return Array.from(stats.values()).sort((a, b) => b.score - a.score || b.correct - a.correct)
}

export function tallyCodewordsSpymasterStats(
  guesses: CodewordsGuess[],
  roles: CodewordsPlayerRole[],
  players: Array<{ id: string; name: string }>
): CodewordsSpymasterStat[] {
  const spymasters = roles.filter((r) => r.role === 'spymaster')
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const clueGroups = new Map<string, CodewordsGuess[]>()

  for (const guess of guesses) {
    if (!guess.clue_word) continue
    const key = `${guess.team}:${guess.clue_word}:${guess.clue_number}`
    const list = clueGroups.get(key) ?? []
    list.push(guess)
    clueGroups.set(key, list)
  }

  const stats = new Map<string, CodewordsSpymasterStat>()
  for (const spy of spymasters) {
    stats.set(spy.player_id, {
      playerId: spy.player_id,
      name: nameById.get(spy.player_id) ?? 'Unknown',
      team: spy.team,
      score: 0,
      cluesGiven: 0,
      wordsFound: 0,
    })
  }

  for (const [key, group] of clueGroups) {
    const team = key.split(':')[0] as CodewordsTeam
    const spy = spymasters.find((s) => s.team === team)
    if (!spy) continue
    const stat = stats.get(spy.player_id)
    if (!stat) continue
    stat.cluesGiven += 1
    const found = group.filter((g) => g.cell_type === team).length
    stat.wordsFound += found
    stat.score += found * 5
  }

  return Array.from(stats.values()).sort((a, b) => b.score - a.score || b.wordsFound - a.wordsFound)
}

/** Prefer the winning team's spymaster; fall back to top clue stats when there is no winner. */
export function pickBestCodewordsSpymaster(
  stats: CodewordsSpymasterStat[],
  winner?: CodewordsTeam | null
): CodewordsSpymasterStat | null {
  if (stats.length === 0) return null
  if (winner) {
    const winningSpy = stats.find((s) => s.team === winner)
    if (winningSpy) return winningSpy
  }
  return stats[0] ?? null
}

/** Operative leaderboard rows for the shared finish standings / share card. */
export function codewordsOperativeLeaderboard(
  guesses: CodewordsGuess[],
  roles: CodewordsPlayerRole[],
  players: Array<{ id: string; name: string }>,
  myPlayerId?: string | null
) {
  return tallyCodewordsOperativeStats(guesses, roles, players).map((row, index) => ({
    name: row.name,
    score: row.score,
    scoreSuffix: 'pts',
    detail: `${row.team === 'red' ? '🔴' : '🔵'} ${row.correct} correct`,
    you: !!myPlayerId && row.playerId === myPlayerId,
    highlight: index === 0,
  }))
}
