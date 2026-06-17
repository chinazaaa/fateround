'use client'

import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Game, Participant, Player, Round, TriviaAnswer, Vote, YahtzeePlayerScore } from '@/types'
import {
  parseGameType,
  gameTypeConfig,
  isBinaryPeoplePollGame,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isWhoSaidThis,
  isCustomGame,
  isTriviaGame,
  isBingoGame,
  isYahtzeeGame,
} from '@/lib/game-types'
import { tallyTriviaPlayerScores } from '@/lib/trivia'
import { totalScore } from '@/lib/yahtzee'
import { buildCustomLeaderboard } from '@/lib/custom-game'
import { getCategoryMeta, getVoteCategories, flagForParticipant, tallyWyrVotes, tallyMltVotes } from '@/lib/vote-stats'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import { tallyWstPlayerScores } from '@/lib/who-said-this'
import { useToast } from '@/components/ui/Toast'
import { filterParticipantsInRounds } from '@/lib/utils'
import { appDomain } from '@/lib/site'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob } from '@/lib/share-image'

function buildShareText({
  game,
  participants,
  votes,
  rounds,
  players,
  triviaAnswers,
  bingoWinnerName,
  yahtzeeScores,
  yahtzeeWinnerName,
}: {
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
  triviaAnswers?: TriviaAnswer[]
  bingoWinnerName?: string
  yahtzeeScores?: YahtzeePlayerScore[]
  yahtzeeWinnerName?: string
}): string {
  const gameType = parseGameType(game.game_type)
  const config = gameTypeConfig(gameType)

  if (isBingoGame(gameType) && bingoWinnerName) {
    return [
      config.headerEmoji,
      game.title,
      '',
      '🏆',
      '',
      'BINGO!',
      '',
      `${bingoWinnerName} wins!`,
      '',
      `Play at ${appDomain()}`,
    ].join('\n')
  }

  if (isYahtzeeGame(gameType) && yahtzeeScores && yahtzeeScores.length > 0) {
    const sorted = [...yahtzeeScores]
      .map((row) => ({
        name: players.find((p) => p.id === row.player_id)?.name ?? 'Player',
        score: totalScore(row.scores.categories),
      }))
      .sort((a, b) => b.score - a.score)

    const lines = [
      config.headerEmoji,
      game.title,
      '',
      yahtzeeWinnerName ? `🏆 ${yahtzeeWinnerName} wins!` : 'Game over',
      '',
      'Final leaderboard:',
      ...sorted.slice(0, 8).map((entry, i) => `  ${i + 1}. ${entry.name} (${entry.score} pts)`),
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  const lines: string[] = []

  lines.push(`${config.headerEmoji} ${game.title}`)
  lines.push(`${config.label} - ${players.length} players, ${rounds.length} rounds`)
  lines.push('')

  const isWyr = isBinaryChoiceGame(gameType)
  const isMlt = isMostLikelyTo(gameType)
  const isWst = isWhoSaidThis(gameType)
  const isTrivia = isTriviaGame(gameType)

  if (isTrivia && triviaAnswers) {
    const scores = tallyTriviaPlayerScores(triviaAnswers, players)
    lines.push('Final leaderboard:')
    const medals = ['1st', '2nd', '3rd']
    scores.slice(0, 5).forEach((s, i) => {
      const label = i < 3 ? medals[i] : `${i + 1}.`
      lines.push(`  ${label}: ${s.name} (${s.score} pts)`)
    })
    if (scores.length > 5) {
      lines.push(`  ...and ${scores.length - 5} more players`)
    }
  } else if (isWyr) {
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
    const playedParticipants = filterParticipantsInRounds(participants, rounds)
    const categories = getVoteCategories(gameType)
    const pairGame = isBinaryPeoplePollGame(gameType)

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
  captureRef,
  game,
  participants,
  votes,
  rounds,
  players,
  triviaAnswers,
  bingoWinnerName,
  yahtzeeScores,
  yahtzeeWinnerName,
}: {
  captureRef?: RefObject<HTMLElement | null>
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
  triviaAnswers?: TriviaAnswer[]
  bingoWinnerName?: string
  yahtzeeScores?: YahtzeePlayerScore[]
  yahtzeeWinnerName?: string
}) {
  const { success, error } = useToast()
  const [sharing, setSharing] = useState(false)
  const sharingLock = useRef(false)

  const handleShare = useCallback(async () => {
    if (sharingLock.current) return

    const wantsImage = !!captureRef
    const target = captureRef?.current

    if (wantsImage && (!target || target.offsetHeight === 0)) {
      error('Nothing to share yet')
      return
    }

    sharingLock.current = true
    setSharing(true)
    try {
      if (target) {
        const blob = await captureElementAsImage(target)
        const result = await shareImageBlob(blob, 'final-results.png')

        if (result === 'copied') {
          success('Image copied — paste into Stories or chat')
        } else if (result === 'shared') {
          success('Shared!')
        } else {
          success('Image downloaded')
        }
        return
      }

      const text = buildShareText({
        game,
        participants,
        votes,
        rounds,
        players,
        triviaAnswers,
        bingoWinnerName,
        yahtzeeScores,
        yahtzeeWinnerName,
      })
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ text })
          return
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') return
        }
      }

      await navigator.clipboard.writeText(text)
      success('Results copied to clipboard!')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return

      if (wantsImage) {
        error(err instanceof Error ? err.message : 'Could not share results image')
        return
      }

      try {
        const text = buildShareText({
        game,
        participants,
        votes,
        rounds,
        players,
        triviaAnswers,
        bingoWinnerName,
        yahtzeeScores,
        yahtzeeWinnerName,
      })
        await navigator.clipboard.writeText(text)
        success('Results copied to clipboard!')
      } catch {
        error(err instanceof Error ? err.message : 'Could not share results')
      }
    } finally {
      sharingLock.current = false
      setSharing(false)
    }
  }, [captureRef, game, participants, votes, rounds, players, triviaAnswers, bingoWinnerName, yahtzeeScores, yahtzeeWinnerName, success, error])

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
      </svg>
      {sharing ? 'Sharing…' : 'Share Results'}
    </button>
  )
}
