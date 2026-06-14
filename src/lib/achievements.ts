import type { Game, Participant, Player, Round, Vote } from '@/types'
import { parseGameType, isPairGame, isBinaryChoiceGame, isMostLikelyTo, isWhoSaidThis } from '@/lib/game-types'
import { flagForParticipant, tallyWyrVotes, tallyMltVotes } from '@/lib/vote-stats'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import { tallyWstPlayerScores, wstCorrectParticipantIdFromRound } from '@/lib/who-said-this'

export interface Achievement {
  id: string
  emoji: string
  title: string
  description: string
  participantId?: string
  participantName?: string
}

// ── Trio / pair game achievements (SMK, Red Flag/Green Flag, Smash or Pass) ──

function trioAndPairAchievements(
  game: Game,
  participants: Participant[],
  rounds: Round[],
  votes: Vote[],
  _players: Player[]
): Achievement[] {
  const gameType = parseGameType(game.game_type)
  const achievements: Achievement[] = []
  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  if (finishedRounds.length === 0) return achievements

  const nameById = new Map(participants.map((p) => [p.id, p.name]))

  // Track per-participant stats across all rounds
  const positiveCount = new Map<string, number>() // kiss = smash / green flag
  const negativeCount = new Map<string, number>() // kill = kill / red flag / pass
  const roundsAppeared = new Map<string, string[]>() // participant -> round ids
  const neverNegative = new Set<string>()

  // Track consecutive positive streaks
  const orderedRounds = [...finishedRounds].sort((a, b) => a.round_number - b.round_number)
  const streakMap = new Map<string, number>() // current streak
  const maxStreakMap = new Map<string, number>() // best streak

  // Track unanimous rounds
  const unanimousAchievements: Achievement[] = []

  for (const participant of participants) {
    positiveCount.set(participant.id, 0)
    negativeCount.set(participant.id, 0)
    roundsAppeared.set(participant.id, [])
    neverNegative.add(participant.id)
    streakMap.set(participant.id, 0)
    maxStreakMap.set(participant.id, 0)
  }

  for (const round of orderedRounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    if (roundVotes.length === 0) continue
    const roundParticipantIds = round.participant_ids

    for (const pid of roundParticipantIds) {
      const appeared = roundsAppeared.get(pid)
      if (appeared) appeared.push(round.id)

      let posCount = 0
      let negCount = 0

      if (isPairGame(gameType)) {
        for (const vote of roundVotes) {
          const flag = flagForParticipant(vote, pid)
          if (flag === 'kiss') posCount++
          if (flag === 'kill') negCount++
        }
      } else {
        // Trio game (SMK)
        for (const vote of roundVotes) {
          if (vote.kiss_participant_id === pid) posCount++
          if (vote.kill_participant_id === pid) negCount++
        }
      }

      positiveCount.set(pid, (positiveCount.get(pid) ?? 0) + posCount)
      negativeCount.set(pid, (negativeCount.get(pid) ?? 0) + negCount)

      if (negCount > 0) neverNegative.delete(pid)

      // Streak tracking
      if (posCount > 0 && negCount === 0) {
        streakMap.set(pid, (streakMap.get(pid) ?? 0) + 1)
      } else if (roundParticipantIds.includes(pid)) {
        streakMap.set(pid, 0)
      }
      const currentStreak = streakMap.get(pid) ?? 0
      if (currentStreak > (maxStreakMap.get(pid) ?? 0)) {
        maxStreakMap.set(pid, currentStreak)
      }

      // Unanimous check: everyone voted the same way for this person
      if (roundVotes.length >= 3) {
        const allSame = isPairGame(gameType)
          ? roundVotes.every((v) => flagForParticipant(v, pid) === flagForParticipant(roundVotes[0], pid))
          : roundVotes.every(
              (v) =>
                (v.kiss_participant_id === pid) === (roundVotes[0].kiss_participant_id === pid) &&
                (v.marry_participant_id === pid) === (roundVotes[0].marry_participant_id === pid) &&
                (v.kill_participant_id === pid) === (roundVotes[0].kill_participant_id === pid)
            )
        if (allSame && !unanimousAchievements.some((a) => a.participantId === pid)) {
          unanimousAchievements.push({
            id: `unanimous-${pid}`,
            emoji: '🎯',
            title: 'Unanimous',
            description: 'Everyone voted the same way for them in a round',
            participantId: pid,
            participantName: nameById.get(pid),
          })
        }
      }
    }
  }

  // Heartthrob — most total positive votes
  const maxPos = Math.max(...positiveCount.values())
  if (maxPos > 0) {
    for (const [pid, count] of positiveCount) {
      if (count === maxPos) {
        const label = gameType === 'red_flag_green_flag' ? 'green flags' : 'smashes'
        achievements.push({
          id: `heartthrob-${pid}`,
          emoji: '💖',
          title: 'Heartthrob',
          description: `Most ${label} across all rounds (${count})`,
          participantId: pid,
          participantName: nameById.get(pid),
        })
        break // only one
      }
    }
  }

  // Lightning Rod — most kills/red flags
  const maxNeg = Math.max(...negativeCount.values())
  if (maxNeg > 0) {
    for (const [pid, count] of negativeCount) {
      if (count === maxNeg) {
        const label = gameType === 'red_flag_green_flag' ? 'red flags' : 'kills'
        achievements.push({
          id: `lightning-rod-${pid}`,
          emoji: '⚡',
          title: 'Lightning Rod',
          description: `Most ${label} across all rounds (${count})`,
          participantId: pid,
          participantName: nameById.get(pid),
        })
        break
      }
    }
  }

  // Survivor — appeared in the most rounds without getting killed
  const survivorCandidates = [...neverNegative].filter((pid) => (roundsAppeared.get(pid)?.length ?? 0) >= 2)
  if (survivorCandidates.length > 0) {
    const bestSurvivor = survivorCandidates.reduce((best, pid) =>
      (roundsAppeared.get(pid)?.length ?? 0) > (roundsAppeared.get(best)?.length ?? 0) ? pid : best
    )
    const label = gameType === 'red_flag_green_flag' ? 'red-flagged' : 'killed'
    achievements.push({
      id: `survivor-${bestSurvivor}`,
      emoji: '🛡️',
      title: 'Survivor',
      description: `${roundsAppeared.get(bestSurvivor)?.length} rounds without getting ${label}`,
      participantId: bestSurvivor,
      participantName: nameById.get(bestSurvivor),
    })
  }

  // Untouched — never got killed/red-flagged (only if they appeared in 2+ rounds)
  const untouchedCandidates = [...neverNegative].filter(
    (pid) => (roundsAppeared.get(pid)?.length ?? 0) >= 2 && pid !== survivorCandidates.reduce((best, _p) => best, '') // avoid duplicate with survivor
  )
  // Only show if different from survivor
  if (untouchedCandidates.length > 0 && untouchedCandidates.length <= 2) {
    for (const pid of untouchedCandidates) {
      if (achievements.some((a) => a.id === `survivor-${pid}`)) continue
      const label = gameType === 'red_flag_green_flag' ? 'red-flagged' : 'killed'
      achievements.push({
        id: `untouched-${pid}`,
        emoji: '✨',
        title: 'Untouched',
        description: `Never got ${label} across all rounds`,
        participantId: pid,
        participantName: nameById.get(pid),
      })
    }
  }

  // Polarizing — got the most positive AND most negative in the same game
  for (const [pid, pos] of positiveCount) {
    const neg = negativeCount.get(pid) ?? 0
    if (pos === maxPos && neg === maxNeg && maxPos > 0 && maxNeg > 0) {
      achievements.push({
        id: `polarizing-${pid}`,
        emoji: '🌪️',
        title: 'Polarizing',
        description: 'Got the most love AND the most hate',
        participantId: pid,
        participantName: nameById.get(pid),
      })
      break
    }
  }

  // Hot Streak — 3+ consecutive rounds with positive votes only
  for (const [pid, streak] of maxStreakMap) {
    if (streak >= 3) {
      const label = gameType === 'red_flag_green_flag' ? 'green-flagged' : 'smashed'
      achievements.push({
        id: `hot-streak-${pid}`,
        emoji: '🔥',
        title: 'Hot Streak',
        description: `Got ${label} ${streak} rounds in a row`,
        participantId: pid,
        participantName: nameById.get(pid),
      })
    }
  }

  // Add unanimous achievements
  achievements.push(...unanimousAchievements.slice(0, 2))

  return achievements
}

// ── WYR achievements ──

function wyrAchievements(rounds: Round[], votes: Vote[], players: Player[]): Achievement[] {
  const achievements: Achievement[] = []
  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  if (finishedRounds.length < 2) return achievements

  const playerMinority = new Map<string, number>()
  const playerMajority = new Map<string, number>()
  const playerRounds = new Map<string, number>()

  for (const round of finishedRounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    if (roundVotes.length < 2) continue
    const { countA, countB } = tallyWyrVotes(roundVotes)
    const majorityChoice = countA >= countB ? 'a' : 'b'

    for (const vote of roundVotes) {
      const pid = vote.player_id
      playerRounds.set(pid, (playerRounds.get(pid) ?? 0) + 1)
      if (vote.wyr_choice === majorityChoice) {
        playerMajority.set(pid, (playerMajority.get(pid) ?? 0) + 1)
      } else if (vote.wyr_choice) {
        playerMinority.set(pid, (playerMinority.get(pid) ?? 0) + 1)
      }
    }
  }

  // Contrarian — voted with the minority most often
  const maxMinority = Math.max(0, ...playerMinority.values())
  if (maxMinority >= 2) {
    for (const [pid, count] of playerMinority) {
      if (count === maxMinority) {
        const player = players.find((p) => p.id === pid)
        achievements.push({
          id: `contrarian-${pid}`,
          emoji: '🐺',
          title: 'Contrarian',
          description: `Voted with the minority ${count} times`,
          participantId: pid,
          participantName: player?.name,
        })
        break
      }
    }
  }

  // Popular Vote — voted with the majority most often
  const maxMajority = Math.max(0, ...playerMajority.values())
  if (maxMajority >= 2) {
    for (const [pid, count] of playerMajority) {
      if (count === maxMajority) {
        const player = players.find((p) => p.id === pid)
        achievements.push({
          id: `popular-vote-${pid}`,
          emoji: '🗳️',
          title: 'Popular Vote',
          description: `Voted with the majority ${count} times`,
          participantId: pid,
          participantName: player?.name,
        })
        break
      }
    }
  }

  // Sheep — always voted with the majority
  for (const [pid, count] of playerMajority) {
    const totalRounds = playerRounds.get(pid) ?? 0
    if (totalRounds >= 3 && count === totalRounds) {
      const player = players.find((p) => p.id === pid)
      achievements.push({
        id: `sheep-${pid}`,
        emoji: '🐑',
        title: 'Sheep',
        description: `Voted with the majority every single round`,
        participantId: pid,
        participantName: player?.name,
      })
      break
    }
  }

  return achievements
}

// ── MLT achievements ──

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

  const isMltImport = isMltImportGame(game)
  const mltKind = isMltImport ? 'participant' : 'player'
  const targets = mltVoteTargets(game, participants, players)
  const totalVotes = new Map<string, number>()

  for (const round of finishedRounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    const { rows } = tallyMltVotes(roundVotes, targets, mltKind as 'player' | 'participant')
    for (const row of rows) {
      totalVotes.set(row.playerId, (totalVotes.get(row.playerId) ?? 0) + row.count)
    }
  }

  if (totalVotes.size === 0) return achievements

  const maxVotes = Math.max(...totalVotes.values())
  const minVotes = Math.min(...totalVotes.values())

  // Main Character — most total votes across all rounds
  if (maxVotes > 0) {
    for (const [tid, count] of totalVotes) {
      if (count === maxVotes) {
        const target = targets.find((t) => t.id === tid)
        achievements.push({
          id: `main-character-${tid}`,
          emoji: '👑',
          title: 'Main Character',
          description: `Got the most total votes across all rounds (${count})`,
          participantId: tid,
          participantName: target?.name,
        })
        break
      }
    }
  }

  // Wallflower — fewest total votes
  if (minVotes < maxVotes) {
    for (const [tid, count] of totalVotes) {
      if (count === minVotes) {
        const target = targets.find((t) => t.id === tid)
        achievements.push({
          id: `wallflower-${tid}`,
          emoji: '🌸',
          title: 'Wallflower',
          description: count === 0 ? 'Never got a single vote' : `Got the fewest votes across all rounds (${count})`,
          participantId: tid,
          participantName: target?.name,
        })
        break
      }
    }
  }

  return achievements
}

// ── WST achievements ──

function wstAchievements(
  rounds: Round[],
  votes: Vote[],
  players: Player[],
  participants: Participant[]
): Achievement[] {
  const achievements: Achievement[] = []
  const scores = tallyWstPlayerScores(rounds, votes, players)
  if (scores.length < 2) return achievements

  // Best Guesser — most correct guesses (already shown in leaderboard, but worth an achievement too)
  const maxCorrect = scores[0]?.correctGuesses ?? 0
  if (maxCorrect > 0) {
    const best = scores[0]
    achievements.push({
      id: `best-guesser-${best.playerId}`,
      emoji: '🧠',
      title: 'Best Guesser',
      description: `Got ${best.correctGuesses} correct guesses`,
      participantId: best.playerId,
      participantName: best.name,
    })
  }

  // Most fooling — the participant whose quote was guessed wrong the most
  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  const fooledCount = new Map<string, number>()

  for (const round of finishedRounds) {
    const correctId = wstCorrectParticipantIdFromRound(round, players)
    if (!correctId) continue
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    const wrongGuesses = roundVotes.filter((v) => v.target_participant_id !== correctId).length
    fooledCount.set(correctId, (fooledCount.get(correctId) ?? 0) + wrongGuesses)
  }

  const maxFooled = Math.max(0, ...fooledCount.values())
  if (maxFooled >= 2) {
    for (const [pid, count] of fooledCount) {
      if (count === maxFooled) {
        const participant = participants.find((p) => p.id === pid)
        achievements.push({
          id: `trickster-${pid}`,
          emoji: '🎭',
          title: 'Trickster',
          description: `Their quotes fooled people ${count} times`,
          participantId: pid,
          participantName: participant?.name,
        })
        break
      }
    }
  }

  return achievements
}

// ── Main export ──

export function computeAchievements(
  game: Game,
  participants: Participant[],
  rounds: Round[],
  votes: Vote[],
  players: Player[]
): Achievement[] {
  const gameType = parseGameType(game.game_type)

  if (isBinaryChoiceGame(gameType)) {
    return wyrAchievements(rounds, votes, players)
  }

  if (isMostLikelyTo(gameType)) {
    return mltAchievements(game, participants, rounds, votes, players)
  }

  if (isWhoSaidThis(gameType)) {
    return wstAchievements(rounds, votes, players, participants)
  }

  // Trio and pair games
  return trioAndPairAchievements(game, participants, rounds, votes, players)
}
