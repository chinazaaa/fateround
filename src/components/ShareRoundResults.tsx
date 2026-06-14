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
import { getCustomSlots, tallyCustomVotes } from '@/lib/custom-game'
import { getCategoryMeta, getVoteCategories, flagForParticipant, tallyWyrVotes, tallyMltVotes } from '@/lib/vote-stats'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import {
  tallyWstVotes,
  wstVoteTargets,
  wstCorrectParticipantIdFromRound,
  wstCorrectNameFromRound,
  isAnimeRound,
  tallyAnimeWstVotes,
} from '@/lib/who-said-this'
import { useToast } from '@/components/ui/Toast'
import { appDomain } from '@/lib/site'

function buildRoundShareText({
  game,
  round,
  votes,
  participants,
  players,
}: {
  game: Game
  round: Round
  votes: Vote[]
  participants: Participant[]
  players: Player[]
}): string {
  const gameType = parseGameType(game.game_type)
  const config = gameTypeConfig(gameType)
  const lines: string[] = []

  if (isBinaryChoiceGame(gameType)) {
    const { countA, countB } = tallyWyrVotes(votes)
    const optA = round.wyr_option_a ?? 'Option A'
    const optB = round.wyr_option_b ?? 'Option B'
    const total = countA + countB
    const winner = countA >= countB ? optA : optB
    const winPct = total > 0 ? Math.round((Math.max(countA, countB) / total) * 100) : 0

    lines.push(`🤔 ${config.label} - Round ${round.round_number} of ${game.rounds_count}`)
    lines.push(`"${optA}" vs "${optB}"`)
    lines.push(`Winner: ${winner} (${winPct}%)`)
  } else if (isMostLikelyTo(gameType)) {
    const isMltImport = isMltImportGame(game)
    const mltKind = isMltImport ? 'participant' : 'player'
    const mltTargets = mltVoteTargets(game, participants, players)
    const { winnerNames } = tallyMltVotes(votes, mltTargets, mltKind)
    const q = round.mlt_question ?? '?'
    const winner = winnerNames.length > 0 ? winnerNames.join(', ') : 'Tie'

    lines.push(`👀 ${config.label} - Round ${round.round_number} of ${game.rounds_count}`)
    lines.push(`Most likely to ${q.charAt(0).toLowerCase()}${q.slice(1)}`)
    lines.push(`Winner: ${winner}`)
  } else if (isWhoSaidThis(gameType)) {
    lines.push(`🕵️ ${config.label} - Round ${round.round_number} of ${game.rounds_count}`)
    lines.push(`"${round.quote_text ?? '(no quote)'}"`)

    if (isAnimeRound(round)) {
      const meta = round.anime_metadata as { anime_name: string; correct_character: string; choices: string[] }
      const { correctCount } = tallyAnimeWstVotes(votes, meta.choices, meta.correct_character)
      const voterCount = votes.filter((v) => v.anime_choice).length
      lines.push(
        `Answer: ${meta.correct_character} from ${meta.anime_name} (${correctCount} of ${voterCount} guessed right)`
      )
    } else {
      const targets = wstVoteTargets(participants)
      const correctId = wstCorrectParticipantIdFromRound(round, players)
      const correctName = wstCorrectNameFromRound(round, players, participants)
      const { correctCount } = tallyWstVotes(votes, targets, correctId)
      const voterCount = votes.filter((v) => v.target_participant_id).length
      lines.push(`Answer: ${correctName ?? 'Unknown'} (${correctCount} of ${voterCount} guessed right)`)
    }
  } else if (isCustomGame(gameType)) {
    const slots = getCustomSlots(game)
    const slotKeys = slots.map((s) => s.key)
    const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))
    const nameMap = new Map(roundParts.map((p) => [p.id, p.name]))
    const tally = tallyCustomVotes(votes, round.participant_ids, nameMap, slotKeys)

    lines.push(
      `\u270F\uFE0F ${game.custom_slots?.title ?? 'Custom Game'} - Round ${round.round_number} of ${game.rounds_count}`
    )
    for (const slot of slots) {
      const winner = tally.slotWinners[slot.key]
      if (winner) {
        lines.push(`${slot.emoji} Most ${slot.label}: ${winner.name} (${winner.count} votes)`)
      }
    }
  } else {
    // Trio and pair games (SMK, RF/GF, SoP)
    const pairGame = isPairGame(gameType)
    const categories = getVoteCategories(gameType)
    const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))

    lines.push(`${config.headerEmoji} ${config.label} - Round ${round.round_number} of ${game.rounds_count}`)

    for (const category of categories) {
      const meta = getCategoryMeta(gameType, category)

      type TallyRow = { id: string; name: string; count: number }
      const tally: TallyRow[] = roundParts.map((p) => {
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
        lines.push(`${meta.emoji} ${meta.leaderboardLabel}: ${top.name} (${top.count} votes)`)
      }
    }
  }

  lines.push('')
  lines.push(`Play at ${appDomain()}`)

  return lines.join('\n')
}

export function ShareRoundResults({
  game,
  round,
  votes,
  participants,
  players,
}: {
  game: Game
  round: Round
  votes: Vote[]
  participants: Participant[]
  players: Player[]
}) {
  const { success, error } = useToast()

  const handleShare = useCallback(async () => {
    const text = buildRoundShareText({ game, round, votes, participants, players })

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
  }, [game, round, votes, participants, players, success, error])

  return (
    <button type="button" onClick={handleShare} className="btn-secondary w-full flex items-center justify-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
      </svg>
      Share Round
    </button>
  )
}
