'use client'

import { useCallback } from 'react'
import type { Game, Participant, Player, Round, Vote } from '@/types'
import {
  parseGameType,
  gameTypeConfig,
  isPairGame,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isWhoSaidThis,
  isCustomGame,
} from '@/lib/game-types'
import { buildCustomLeaderboard } from '@/lib/custom-game'
import { getCategoryMeta, getVoteCategories, flagForParticipant, tallyWyrVotes, tallyMltVotes } from '@/lib/vote-stats'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import { tallyWstPlayerScores } from '@/lib/who-said-this'
import { useToast } from '@/components/ui/Toast'
import { filterParticipantsInRounds } from '@/lib/utils'

import { appDomain } from '@/lib/site'

function buildShareText({
  game,
  participants,
  votes,
  rounds,
  players,
}: {
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
}): string {
  const gameType = parseGameType(game.game_type)
  const config = gameTypeConfig(gameType)
  const lines: string[] = []

  lines.push(`${config.headerEmoji} ${game.title}`)
  lines.push(`${config.label} - ${players.length} players, ${rounds.length} rounds`)
  lines.push('')

  const isWyr = isBinaryChoiceGame(gameType)
  const isMlt = isMostLikelyTo(gameType)
  const isWst = isWhoSaidThis(gameType)

  if (isWyr) {
    // Show top WYR results
    lines.push('Top results:')
    const shownRounds = rounds.slice(0, 5)
    for (const round of shownRounds) {
      const roundVotes = votes.filter((v) => v.round_id === round.id)
      const { countA, countB } = tallyWyrVotes(roundVotes)
      const optA = round.wyr_option_a ?? 'Option A'
      const optB = round.wyr_option_b ?? 'Option B'
      const winner = countA >= countB ? optA : optB
      const winPct = Math.round((Math.max(countA, countB) / Math.max(1, countA + countB)) * 100)
      lines.push(`  ${winner} (${winPct}%)`)
    }
    if (rounds.length > 5) {
      lines.push(`  ...and ${rounds.length - 5} more rounds`)
    }
  } else if (isMlt) {
    // Show MLT winners
    lines.push('Most voted:')
    const isMltImport = isMltImportGame(game)
    const mltKind = isMltImport ? 'participant' : 'player'
    const mltTargets = mltVoteTargets(game, participants, players)
    const shownRounds = rounds.slice(0, 5)
    for (const round of shownRounds) {
      const roundVotes = votes.filter((v) => v.round_id === round.id)
      const { winnerNames } = tallyMltVotes(roundVotes, mltTargets, mltKind)
      const q = round.mlt_question ?? '?'
      const winner = winnerNames.length > 0 ? winnerNames.join(', ') : 'Tie'
      lines.push(`  ${q} - ${winner}`)
    }
    if (rounds.length > 5) {
      lines.push(`  ...and ${rounds.length - 5} more rounds`)
    }
  } else if (isWst) {
    // Show WST best guessers
    const scores = tallyWstPlayerScores(rounds, votes, players)
    lines.push('Best guessers:')
    const topScores = scores.slice(0, 3)
    const medals = ['1st', '2nd', '3rd']
    topScores.forEach((s, i) => {
      lines.push(`  ${medals[i]}: ${s.name} (${s.correctGuesses} correct)`)
    })
  } else if (isCustomGame(gameType)) {
    const slots = game.custom_slots?.slots ?? []
    const leaderboard = buildCustomLeaderboard(votes, participants, slots)
    for (const entry of leaderboard) {
      const top = entry.entries[0]
      if (top) {
        lines.push(`${entry.slot.emoji} Most ${entry.slot.label}: ${top.name}`)
      }
    }
  } else {
    // Trio and pair games - show category leaders
    const playedParticipants = filterParticipantsInRounds(participants, rounds)
    const categories = getVoteCategories(gameType)
    const pairGame = isPairGame(gameType)

    type TallyRow = {
      id: string
      name: string
      count: number
    }

    for (const category of categories) {
      const meta = getCategoryMeta(gameType, category)
      const tally: TallyRow[] = playedParticipants.map((p) => {
        let count: number
        if (category === 'kiss') {
          count = pairGame
            ? votes.filter((v) => flagForParticipant(v, p.id) === 'kiss').length
            : votes.filter((v) => v.kiss_participant_id === p.id).length
        } else if (category === 'marry') {
          count = votes.filter((v) => v.marry_participant_id === p.id).length
        } else {
          count = pairGame
            ? votes.filter((v) => flagForParticipant(v, p.id) === 'kill').length
            : votes.filter((v) => v.kill_participant_id === p.id).length
        }
        return { id: p.id, name: p.name, count }
      })

      tally.sort((a, b) => b.count - a.count)
      const top = tally[0]
      if (top && top.count > 0) {
        lines.push(`${meta.emoji} ${meta.leaderboardLabel}: ${top.name}`)
      }
    }
  }

  lines.push('')
  lines.push(`Play at ${appDomain()}`)

  return lines.join('\n')
}

export function ShareResults({
  game,
  participants,
  votes,
  rounds,
  players,
}: {
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
}) {
  const { success, error } = useToast()

  const handleShare = useCallback(async () => {
    const text = buildShareText({ game, participants, votes, rounds, players })

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (err: unknown) {
        // User cancelled or share failed - fall through to clipboard
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text)
      success('Results copied to clipboard!')
    } catch {
      error('Could not copy results')
    }
  }, [game, participants, votes, rounds, players, success, error])

  return (
    <button type="button" onClick={handleShare} className="btn-secondary w-full flex items-center justify-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
      </svg>
      Share Results
    </button>
  )
}
