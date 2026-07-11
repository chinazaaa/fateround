import type { Game, GameType, Participant, Player, Round, Vote } from '@fateround/shared'
import {
  isBinaryChoiceGame,
  isBinaryPeoplePollGame,
  isMostLikelyTo,
  isWhoSaidThis,
  mltVoteTargets,
  parseGameType,
} from '@fateround/shared/poll-games'
import { flagForParticipant, tallyMltVotes, tallyWyrVotes } from '@fateround/shared/vote-stats'
import { tallyWstScores } from '@/lib/wst-standings'

/**
 * End-of-game achievements for poll games. Ported from web `src/lib/achievements.ts`,
 * adapted to shared helpers (mltVoteTargets uses the shared `(game, players, participants)`
 * arg order). Purely presentational — no DB, no migration.
 */

export type Achievement = {
  id: string
  emoji: string
  title: string
  description: string
  participantName?: string
}

// ── Trio / pair games (SMK, Red Flag/Green Flag, Smash or Pass, etc.) ──

function trioAndPairAchievements(
  gameType: GameType,
  participants: Participant[],
  rounds: Round[],
  votes: Vote[]
): Achievement[] {
  const achievements: Achievement[] = []
  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  if (finishedRounds.length === 0) return achievements

  const nameById = new Map(participants.map((p) => [p.id, p.name]))
  const pairGame = isBinaryPeoplePollGame(gameType)

  const positiveCount = new Map<string, number>()
  const negativeCount = new Map<string, number>()
  const roundsAppeared = new Map<string, number>()
  const neverNegative = new Set<string>()
  const streakMap = new Map<string, number>()
  const maxStreakMap = new Map<string, number>()
  const unanimous: Achievement[] = []

  for (const p of participants) {
    positiveCount.set(p.id, 0)
    negativeCount.set(p.id, 0)
    roundsAppeared.set(p.id, 0)
    neverNegative.add(p.id)
    streakMap.set(p.id, 0)
    maxStreakMap.set(p.id, 0)
  }

  const ordered = [...finishedRounds].sort((a, b) => a.round_number - b.round_number)
  for (const round of ordered) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    if (roundVotes.length === 0) continue
    const ids = round.participant_ids ?? []
    for (const pid of ids) {
      roundsAppeared.set(pid, (roundsAppeared.get(pid) ?? 0) + 1)
      let pos = 0
      let neg = 0
      if (pairGame) {
        for (const v of roundVotes) {
          const flag = flagForParticipant(v, pid)
          if (flag === 'kiss') pos++
          if (flag === 'kill') neg++
        }
      } else {
        for (const v of roundVotes) {
          if (v.kiss_participant_id === pid) pos++
          if (v.kill_participant_id === pid) neg++
        }
      }
      positiveCount.set(pid, (positiveCount.get(pid) ?? 0) + pos)
      negativeCount.set(pid, (negativeCount.get(pid) ?? 0) + neg)
      if (neg > 0) neverNegative.delete(pid)

      if (pos > 0 && neg === 0) streakMap.set(pid, (streakMap.get(pid) ?? 0) + 1)
      else streakMap.set(pid, 0)
      const cur = streakMap.get(pid) ?? 0
      if (cur > (maxStreakMap.get(pid) ?? 0)) maxStreakMap.set(pid, cur)

      if (roundVotes.length >= 3) {
        const allSame = pairGame
          ? roundVotes.every((v) => flagForParticipant(v, pid) === flagForParticipant(roundVotes[0], pid))
          : roundVotes.every(
              (v) =>
                (v.kiss_participant_id === pid) === (roundVotes[0].kiss_participant_id === pid) &&
                (v.marry_participant_id === pid) === (roundVotes[0].marry_participant_id === pid) &&
                (v.kill_participant_id === pid) === (roundVotes[0].kill_participant_id === pid)
            )
        if (allSame && !unanimous.some((a) => a.id === `unanimous-${pid}`)) {
          unanimous.push({
            id: `unanimous-${pid}`,
            emoji: '🎯',
            title: 'Unanimous',
            description: 'Everyone voted the same way for them in a round',
            participantName: nameById.get(pid),
          })
        }
      }
    }
  }

  const posLabel =
    gameType === 'red_flag_green_flag' ? 'green flags' : gameType === 'parent_approval' ? 'yes votes' : 'smashes'
  const negLabel =
    gameType === 'red_flag_green_flag' ? 'red flags' : gameType === 'parent_approval' ? 'no votes' : 'kills'

  const maxPos = Math.max(0, ...positiveCount.values())
  if (maxPos > 0) {
    for (const [pid, count] of positiveCount) {
      if (count === maxPos) {
        achievements.push({
          id: `heartthrob-${pid}`,
          emoji: '💖',
          title: 'Heartthrob',
          description: `Most ${posLabel} across all rounds (${count})`,
          participantName: nameById.get(pid),
        })
        break
      }
    }
  }

  const maxNeg = Math.max(0, ...negativeCount.values())
  if (maxNeg > 0) {
    for (const [pid, count] of negativeCount) {
      if (count === maxNeg) {
        achievements.push({
          id: `lightning-rod-${pid}`,
          emoji: '⚡',
          title: 'Lightning Rod',
          description: `Most ${negLabel} across all rounds (${count})`,
          participantName: nameById.get(pid),
        })
        break
      }
    }
  }

  const negPastTense =
    gameType === 'red_flag_green_flag' ? 'red-flagged' : gameType === 'parent_approval' ? 'rejected' : 'killed'
  const survivors = [...neverNegative].filter((pid) => (roundsAppeared.get(pid) ?? 0) >= 2)
  if (survivors.length > 0) {
    const best = survivors.reduce((b, pid) =>
      (roundsAppeared.get(pid) ?? 0) > (roundsAppeared.get(b) ?? 0) ? pid : b
    )
    achievements.push({
      id: `survivor-${best}`,
      emoji: '🛡️',
      title: 'Survivor',
      description: `${roundsAppeared.get(best)} rounds without getting ${negPastTense}`,
      participantName: nameById.get(best),
    })
  }

  for (const [pid, pos] of positiveCount) {
    const neg = negativeCount.get(pid) ?? 0
    if (pos === maxPos && neg === maxNeg && maxPos > 0 && maxNeg > 0) {
      achievements.push({
        id: `polarizing-${pid}`,
        emoji: '🌪️',
        title: 'Polarizing',
        description: 'Got the most love AND the most hate',
        participantName: nameById.get(pid),
      })
      break
    }
  }

  for (const [pid, streak] of maxStreakMap) {
    if (streak >= 3) {
      const label = gameType === 'red_flag_green_flag' ? 'green-flagged' : 'smashed'
      achievements.push({
        id: `hot-streak-${pid}`,
        emoji: '🔥',
        title: 'Hot Streak',
        description: `Got ${label} ${streak} rounds in a row`,
        participantName: nameById.get(pid),
      })
    }
  }

  achievements.push(...unanimous.slice(0, 2))
  return achievements
}

// ── WYR / This-or-That ──

function wyrAchievements(rounds: Round[], votes: Vote[], players: Player[]): Achievement[] {
  const achievements: Achievement[] = []
  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  if (finishedRounds.length < 2) return achievements

  const minority = new Map<string, number>()
  const majority = new Map<string, number>()
  const roundsPlayed = new Map<string, number>()

  for (const round of finishedRounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    if (roundVotes.length < 2) continue
    const { countA, countB } = tallyWyrVotes(roundVotes)
    const majorityChoice = countA >= countB ? 'a' : 'b'
    for (const v of roundVotes) {
      roundsPlayed.set(v.player_id, (roundsPlayed.get(v.player_id) ?? 0) + 1)
      if (v.wyr_choice === majorityChoice) majority.set(v.player_id, (majority.get(v.player_id) ?? 0) + 1)
      else if (v.wyr_choice) minority.set(v.player_id, (minority.get(v.player_id) ?? 0) + 1)
    }
  }

  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name

  const maxMin = Math.max(0, ...minority.values())
  if (maxMin >= 2) {
    for (const [pid, count] of minority) {
      if (count === maxMin) {
        achievements.push({
          id: `contrarian-${pid}`,
          emoji: '🐺',
          title: 'Contrarian',
          description: `Voted with the minority ${count} times`,
          participantName: nameOf(pid),
        })
        break
      }
    }
  }

  const maxMaj = Math.max(0, ...majority.values())
  if (maxMaj >= 2) {
    for (const [pid, count] of majority) {
      if (count === maxMaj) {
        achievements.push({
          id: `popular-vote-${pid}`,
          emoji: '🗳️',
          title: 'Popular Vote',
          description: `Voted with the majority ${count} times`,
          participantName: nameOf(pid),
        })
        break
      }
    }
  }

  for (const [pid, count] of majority) {
    const total = roundsPlayed.get(pid) ?? 0
    if (total >= 3 && count === total) {
      achievements.push({
        id: `sheep-${pid}`,
        emoji: '🐑',
        title: 'Sheep',
        description: 'Voted with the majority every single round',
        participantName: nameOf(pid),
      })
      break
    }
  }

  return achievements
}

// ── Most Likely To ──

function mltAchievements(
  game: Game,
  participants: Participant[],
  rounds: Round[],
  votes: Vote[],
  players: Player[]
): Achievement[] {
  const achievements: Achievement[] = []
  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  if (finishedRounds.length < 2) return achievements

  const targets = mltVoteTargets(game, players, participants)
  const kind = targets[0]?.kind === 'participant' ? 'participant' : 'player'
  const totalVotes = new Map<string, number>()

  for (const round of finishedRounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    const { rows } = tallyMltVotes(roundVotes, targets, kind)
    for (const row of rows) totalVotes.set(row.playerId, (totalVotes.get(row.playerId) ?? 0) + row.count)
  }
  if (totalVotes.size === 0) return achievements

  const nameOf = (tid: string) => targets.find((t) => t.id === tid)?.name
  const maxVotes = Math.max(...totalVotes.values())
  const minVotes = Math.min(...totalVotes.values())

  if (maxVotes > 0) {
    for (const [tid, count] of totalVotes) {
      if (count === maxVotes) {
        achievements.push({
          id: `main-character-${tid}`,
          emoji: '👑',
          title: 'Main Character',
          description: `Got the most total votes across all rounds (${count})`,
          participantName: nameOf(tid),
        })
        break
      }
    }
  }

  if (minVotes < maxVotes) {
    for (const [tid, count] of totalVotes) {
      if (count === minVotes) {
        achievements.push({
          id: `wallflower-${tid}`,
          emoji: '🌸',
          title: 'Wallflower',
          description: count === 0 ? 'Never got a single vote' : `Got the fewest votes across all rounds (${count})`,
          participantName: nameOf(tid),
        })
        break
      }
    }
  }

  return achievements
}

// ── Who Said This ──

function wstCorrectId(round: Round, players: Player[]): string | null {
  if (round.quote_author_participant_id) return round.quote_author_participant_id
  if (!round.submitter_player_id) return null
  return players.find((p) => p.id === round.submitter_player_id)?.participant_id ?? null
}

function wstAchievements(
  rounds: Round[],
  votes: Vote[],
  players: Player[],
  participants: Participant[]
): Achievement[] {
  const achievements: Achievement[] = []
  const scores = tallyWstScores(rounds, votes, players)
  if (scores.length < 2) return achievements

  const best = scores[0]
  if (best && best.correctGuesses > 0) {
    achievements.push({
      id: `best-guesser-${best.playerId}`,
      emoji: '🧠',
      title: 'Best Guesser',
      description: `Got ${best.correctGuesses} correct guesses`,
      participantName: best.name,
    })
  }

  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  const fooled = new Map<string, number>()
  for (const round of finishedRounds) {
    const correctId = wstCorrectId(round, players)
    if (!correctId) continue
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    const wrong = roundVotes.filter((v) => v.target_participant_id !== correctId && !!v.target_participant_id).length
    fooled.set(correctId, (fooled.get(correctId) ?? 0) + wrong)
  }

  const maxFooled = Math.max(0, ...fooled.values())
  if (maxFooled >= 2) {
    for (const [pid, count] of fooled) {
      if (count === maxFooled) {
        achievements.push({
          id: `trickster-${pid}`,
          emoji: '🎭',
          title: 'Trickster',
          description: `Their quotes fooled people ${count} times`,
          participantName: participants.find((p) => p.id === pid)?.name,
        })
        break
      }
    }
  }

  return achievements
}

export function computePollAchievements(
  game: Game,
  participants: Participant[],
  rounds: Round[],
  votes: Vote[],
  players: Player[]
): Achievement[] {
  const gameType = parseGameType(game.game_type)
  if (isBinaryChoiceGame(gameType)) return wyrAchievements(rounds, votes, players)
  if (isMostLikelyTo(gameType)) return mltAchievements(game, participants, rounds, votes, players)
  if (isWhoSaidThis(gameType)) return wstAchievements(rounds, votes, players, participants)
  return trioAndPairAchievements(gameType, participants, rounds, votes)
}
