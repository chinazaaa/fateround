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
  isMonopolyGame,
  isWhotGame,
  isCrazyEightsGame,
  isUnoGame,
  isLudoGame,
  isSnakeAndLadderGame,
  isTicTacToeGame,
  isChessGame,
  isCheckersGame,
  isDraughts10Game,
  isAyoGame,
  isMahjongGame,
  isICallOnGame,
  isCodewordsGame,
  isWordHuntGame,
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
import { shareImageBlob, downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import { ShareActionButtons } from '@/components/ShareActionButtons'
import type { MonopolyStanding } from '@/lib/monopoly'
import { formatMonopolyMoney } from '@/lib/monopoly'
import type { WhotStanding } from '@/lib/whot'
import type { LudoStanding } from '@/lib/ludo'
import type { SnakeLadderStanding } from '@/lib/snake-and-ladder'

function buildShareText({
  game,
  participants,
  votes,
  rounds,
  players,
  triviaAnswers,
  bingoWinnerName,
  bingoEndedEarly,
  yahtzeeScores,
  yahtzeeWinnerName,
  monopolyStandings,
  monopolyWinnerName,
  whotStandings,
  whotWinnerName,
  ludoStandings,
  ludoWinnerName,
  ludoEndedEarly,
  snakeLadderStandings,
  snakeLadderWinnerName,
  snakeLadderEndedEarly,
  ticTacToeWinnerName,
  ticTacToeIsDraw,
  ticTacToeEndedEarly,
  mahjongWinnerName,
  mahjongIsDraw,
  npatLeaderboard,
  npatWinnerLabel,
  codewordsOperativeStats,
  codewordsWinnerLabel,
  wordHuntLeaderboard,
  wordHuntWinnerName,
}: {
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
  triviaAnswers?: TriviaAnswer[]
  bingoWinnerName?: string
  bingoEndedEarly?: boolean
  yahtzeeScores?: YahtzeePlayerScore[]
  yahtzeeWinnerName?: string
  monopolyStandings?: MonopolyStanding[]
  monopolyWinnerName?: string
  whotStandings?: WhotStanding[]
  whotWinnerName?: string
  ludoStandings?: LudoStanding[]
  ludoWinnerName?: string
  ludoEndedEarly?: boolean
  snakeLadderStandings?: SnakeLadderStanding[]
  snakeLadderWinnerName?: string
  snakeLadderEndedEarly?: boolean
  ticTacToeWinnerName?: string
  ticTacToeIsDraw?: boolean
  ticTacToeEndedEarly?: boolean
  mahjongWinnerName?: string
  mahjongIsDraw?: boolean
  npatLeaderboard?: { name: string; score: number }[]
  npatWinnerLabel?: string
  codewordsOperativeStats?: { name: string; score: number }[]
  codewordsWinnerLabel?: string
  wordHuntLeaderboard?: { name: string; score: number; wordCount: number }[]
  wordHuntWinnerName?: string
}): string {
  const gameType = parseGameType(game.game_type)
  const config = gameTypeConfig(gameType)
  const gameHeader = [config.headerEmoji, game.title, config.label, '']

  if (isWordHuntGame(gameType) && wordHuntLeaderboard && wordHuntLeaderboard.length > 0) {
    const lines = [
      ...gameHeader,
      wordHuntWinnerName ? `🏆 ${wordHuntWinnerName} wins!` : "⏱️ Time's up!",
      '',
      'Final leaderboard:',
      ...wordHuntLeaderboard
        .slice(0, 8)
        .map((row, i) => `  ${i + 1}. ${row.name} (${row.score} pts · ${row.wordCount}w)`),
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  if (isCodewordsGame(gameType)) {
    const lines = [...gameHeader, codewordsWinnerLabel ?? '🏆 Game over', '']
    if (codewordsOperativeStats && codewordsOperativeStats.length > 0) {
      lines.push(
        'Operative leaderboard:',
        ...codewordsOperativeStats.slice(0, 8).map((row, i) => `  ${i + 1}. ${row.name} (${row.score} pts)`),
        ''
      )
    }
    lines.push(`Play at ${appDomain()}`)
    return lines.join('\n')
  }

  if (isICallOnGame(gameType) && npatLeaderboard && npatLeaderboard.length > 0) {
    const lines = [
      ...gameHeader,
      npatWinnerLabel ?? '🏆 Game over',
      '',
      'Final leaderboard:',
      ...npatLeaderboard.slice(0, 8).map((row, i) => `  ${i + 1}. ${row.name} (${row.score} pts)`),
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  if (isLudoGame(gameType) && ludoStandings && ludoStandings.length > 0) {
    const lines = [
      ...gameHeader,
      ludoWinnerName ? `🏆 ${ludoWinnerName} wins!` : ludoEndedEarly ? '🏁 Game ended early' : '🏁 Game over',
      '',
      'Final standings:',
      ...ludoStandings.slice(0, 8).map((row) => `  ${row.rank}. ${row.name} — ${row.finishedCount}/4 home`),
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  if (isMahjongGame(gameType)) {
    const lines = [
      ...gameHeader,
      mahjongWinnerName ? `🏆 ${mahjongWinnerName} calls Mahjong!` : mahjongIsDraw ? '🤝 Wall draw' : '🏁 Game over',
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  if (isSnakeAndLadderGame(gameType) && snakeLadderStandings && snakeLadderStandings.length > 0) {
    const lines = [
      ...gameHeader,
      snakeLadderWinnerName
        ? `🏆 ${snakeLadderWinnerName} wins!`
        : snakeLadderEndedEarly
          ? '🏁 Game ended early'
          : '🏁 Game over',
      '',
      'Final standings:',
      ...snakeLadderStandings.slice(0, 8).map((row) => `  ${row.rank}. ${row.name} — square ${row.position}`),
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  if (
    (isWhotGame(gameType) || isCrazyEightsGame(gameType) || isUnoGame(gameType)) &&
    whotStandings &&
    whotStandings.length > 0
  ) {
    const lines = [
      ...gameHeader,
      whotWinnerName ? `🏆 ${whotWinnerName} wins!` : '🏆 Game over',
      '',
      'Final standings:',
      ...whotStandings.slice(0, 8).map((row) => {
        if (row.cardCount === 0) return `  ${row.rank}. ${row.name} — out of cards`
        return `  ${row.rank}. ${row.name} — ${row.cardCount} cards (${row.handSum} pts)`
      }),
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  if (isMonopolyGame(gameType) && monopolyStandings && monopolyStandings.length > 0) {
    const lines = [
      ...gameHeader,
      monopolyWinnerName ? `🏆 ${monopolyWinnerName} wins!` : '🏆 Game over',
      '',
      'Final standings (total assets):',
      ...monopolyStandings
        .slice(0, 8)
        .map((row) => `  ${row.rank}. ${row.name} — ${formatMonopolyMoney(row.netWorth)}`),
      '',
      `Play at ${appDomain()}`,
    ]
    return lines.join('\n')
  }

  if (isBingoGame(gameType) && (bingoWinnerName || bingoEndedEarly)) {
    if (bingoWinnerName) {
      return [...gameHeader, '🏆', '', 'BINGO!', '', `${bingoWinnerName} wins!`, '', `Play at ${appDomain()}`].join(
        '\n'
      )
    }
    return [...gameHeader, '🏁', '', 'Game ended early', '', `Play at ${appDomain()}`].join('\n')
  }

  // Tic-Tac-Toe, Chess and Checkers share the same winner / draw / ended-early result signal.
  if (
    isTicTacToeGame(gameType) ||
    isChessGame(gameType) ||
    isCheckersGame(gameType) ||
    isDraughts10Game(gameType) ||
    isAyoGame(gameType)
  ) {
    if (ticTacToeIsDraw) {
      return [...gameHeader, '🤝', '', "It's a draw!", '', `Play at ${appDomain()}`].join('\n')
    }
    if (ticTacToeWinnerName) {
      return [...gameHeader, '🏆', '', `${ticTacToeWinnerName} wins!`, '', `Play at ${appDomain()}`].join('\n')
    }
    if (ticTacToeEndedEarly) {
      return [...gameHeader, '🏁', '', 'Game ended early', '', `Play at ${appDomain()}`].join('\n')
    }
  }

  if (isYahtzeeGame(gameType) && yahtzeeScores && yahtzeeScores.length > 0) {
    const sorted = [...yahtzeeScores]
      .map((row) => ({
        name: players.find((p) => p.id === row.player_id)?.name ?? 'Player',
        score: totalScore(row.scores.categories, row.scores.bonusYahtzees),
      }))
      .sort((a, b) => b.score - a.score)

    const lines = [
      ...gameHeader,
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
  lines.push(config.label)
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
      lines.push(`  ${medals[i]}: ${s.name} (${s.points} pts)`)
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
  bingoEndedEarly,
  yahtzeeScores,
  yahtzeeWinnerName,
  monopolyStandings,
  monopolyWinnerName,
  whotStandings,
  whotWinnerName,
  ludoStandings,
  ludoWinnerName,
  ludoEndedEarly,
  snakeLadderStandings,
  snakeLadderWinnerName,
  snakeLadderEndedEarly,
  ticTacToeWinnerName,
  ticTacToeIsDraw,
  ticTacToeEndedEarly,
  mahjongWinnerName,
  mahjongIsDraw,
  npatLeaderboard,
  npatWinnerLabel,
  codewordsOperativeStats,
  codewordsWinnerLabel,
  wordHuntLeaderboard,
  wordHuntWinnerName,
  primary,
}: {
  captureRef?: RefObject<HTMLElement | null>
  game: Game
  participants: Participant[]
  votes: Vote[]
  rounds: Round[]
  players: Player[]
  triviaAnswers?: TriviaAnswer[]
  bingoWinnerName?: string
  bingoEndedEarly?: boolean
  yahtzeeScores?: YahtzeePlayerScore[]
  yahtzeeWinnerName?: string
  monopolyStandings?: MonopolyStanding[]
  monopolyWinnerName?: string
  whotStandings?: WhotStanding[]
  whotWinnerName?: string
  ludoStandings?: LudoStanding[]
  ludoWinnerName?: string
  ludoEndedEarly?: boolean
  snakeLadderStandings?: SnakeLadderStanding[]
  snakeLadderWinnerName?: string
  snakeLadderEndedEarly?: boolean
  ticTacToeWinnerName?: string
  ticTacToeIsDraw?: boolean
  ticTacToeEndedEarly?: boolean
  mahjongWinnerName?: string
  mahjongIsDraw?: boolean
  npatLeaderboard?: { name: string; score: number }[]
  npatWinnerLabel?: string
  codewordsOperativeStats?: { name: string; score: number }[]
  codewordsWinnerLabel?: string
  wordHuntLeaderboard?: { name: string; score: number; wordCount: number }[]
  wordHuntWinnerName?: string
  /** Render the Share button as the primary action (results screens). */
  primary?: boolean
}) {
  const { success, error } = useToast()
  const [sharing, setSharing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const busyLock = useRef(false)

  const buildText = useCallback(
    () =>
      buildShareText({
        game,
        participants,
        votes,
        rounds,
        players,
        triviaAnswers,
        bingoWinnerName,
        bingoEndedEarly,
        yahtzeeScores,
        yahtzeeWinnerName,
        monopolyStandings,
        monopolyWinnerName,
        whotStandings,
        whotWinnerName,
        ludoStandings,
        ludoWinnerName,
        ludoEndedEarly,
        snakeLadderStandings,
        snakeLadderWinnerName,
        snakeLadderEndedEarly,
        ticTacToeWinnerName,
        ticTacToeIsDraw,
        ticTacToeEndedEarly,
        mahjongWinnerName,
        mahjongIsDraw,
        npatLeaderboard,
        npatWinnerLabel,
        codewordsOperativeStats,
        codewordsWinnerLabel,
        wordHuntLeaderboard,
        wordHuntWinnerName,
      }),
    [
      game,
      participants,
      votes,
      rounds,
      players,
      triviaAnswers,
      bingoWinnerName,
      bingoEndedEarly,
      yahtzeeScores,
      yahtzeeWinnerName,
      monopolyStandings,
      monopolyWinnerName,
      whotStandings,
      whotWinnerName,
      ludoStandings,
      ludoWinnerName,
      ludoEndedEarly,
      snakeLadderStandings,
      snakeLadderWinnerName,
      snakeLadderEndedEarly,
      ticTacToeWinnerName,
      ticTacToeIsDraw,
      ticTacToeEndedEarly,
      mahjongWinnerName,
      mahjongIsDraw,
      npatLeaderboard,
      npatWinnerLabel,
      codewordsOperativeStats,
      codewordsWinnerLabel,
      wordHuntLeaderboard,
      wordHuntWinnerName,
    ]
  )

  const handleShare = useCallback(async () => {
    if (busyLock.current) return

    const wantsImage = !!captureRef
    const target = captureRef?.current

    if (wantsImage && (!target || target.offsetHeight === 0)) {
      error('Nothing to share yet')
      return
    }

    busyLock.current = true
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

      const text = buildText()
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
        await navigator.clipboard.writeText(buildText())
        success('Results copied to clipboard!')
      } catch {
        error(err instanceof Error ? err.message : 'Could not share results')
      }
    } finally {
      busyLock.current = false
      setSharing(false)
    }
  }, [captureRef, buildText, success, error])

  const handleDownload = useCallback(async () => {
    if (busyLock.current) return

    const wantsImage = !!captureRef
    const target = captureRef?.current

    if (wantsImage && (!target || target.offsetHeight === 0)) {
      error('Nothing to download yet')
      return
    }

    busyLock.current = true
    setDownloading(true)
    try {
      const stem = shareFilenameStem(game.title)
      if (target) {
        const blob = await captureElementAsImage(target)
        downloadBlobAsFile(blob, `${stem}-results.png`)
        success('Image downloaded')
        return
      }

      const blob = new Blob([buildText()], { type: 'text/plain' })
      downloadBlobAsFile(blob, `${stem}-results.txt`)
      success('Results downloaded')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not download results')
    } finally {
      busyLock.current = false
      setDownloading(false)
    }
  }, [captureRef, game.title, buildText, success, error])

  return (
    <ShareActionButtons
      shareLabel="Share Results"
      onShare={handleShare}
      onDownload={handleDownload}
      sharing={sharing}
      downloading={downloading}
      primary={primary}
    />
  )
}
