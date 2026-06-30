import type { GameType } from '@/types'
import {
  gameTypeConfig,
  isHotSeat,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isThisOrThat,
  isTriviaGame,
  isWhoSaidThis,
  isWouldYouRather,
  isCodewordsGame,
  isDescribeItGame,
} from '@/lib/game-types'
import { questionSampleFile } from '@/lib/custom-questions'
import { isPeoplePollGame } from '@/lib/player-participant-pool'
import { participantSampleFile, participantsNeedGenderForGame } from '@/lib/participants'

export type CustomContentHint = {
  headline: string
  body: string
  promptExample: string
  sampleHref: string
  sampleDownload: string
}

export function supportsQuestionCustomContentHint(gameType: GameType): boolean {
  return (
    isWouldYouRather(gameType) ||
    isThisOrThat(gameType) ||
    isMostLikelyTo(gameType) ||
    isNeverHaveIEver(gameType) ||
    isPickANumber(gameType) ||
    isTriviaGame(gameType) ||
    isCodewordsGame(gameType) ||
    isDescribeItGame(gameType)
  )
}

export function supportsParticipantCustomContentHint(gameType: GameType): boolean {
  return isPeoplePollGame(gameType) || isWhoSaidThis(gameType) || isHotSeat(gameType) || isMostLikelyTo(gameType)
}

export function getQuestionCustomContentHint(gameType: GameType): CustomContentHint | null {
  if (!supportsQuestionCustomContentHint(gameType)) return null

  const label = gameTypeConfig(gameType).label
  const sample = questionSampleFile(gameType)

  // Word-list games (Text Charades, Codewords) use plain words, not Q&A — phrase the tip for words.
  if (isDescribeItGame(gameType) || isCodewordsGame(gameType)) {
    return {
      headline: 'Any theme you want',
      body: `Any theme works — a fandom, a holiday, inside jokes. Generate a word list with AI, upload your own, or add them by hand.`,
      promptExample: `"Create a list of 30 words about [your theme], one per line."`,
      sampleHref: sample.href,
      sampleDownload: sample.download,
    }
  }

  return {
    headline: 'Any theme you want',
    body: `Any theme works — a fandom, a holiday, inside jokes. Generate ${label} questions with AI, upload a CSV, or add them by hand.`,
    promptExample: `"Create 30 ${label} questions about [your theme] as a CSV using the format in ${sample.download}."`,
    sampleHref: sample.href,
    sampleDownload: sample.download,
  }
}

export function getParticipantCustomContentHint(
  gameType: GameType,
  opts?: Parameters<typeof participantsNeedGenderForGame>[1]
): CustomContentHint | null {
  if (!supportsParticipantCustomContentHint(gameType)) return null

  const label = gameTypeConfig(gameType).label
  const sample = participantSampleFile(gameType, opts)
  const needsGender = participantsNeedGenderForGame(gameType, opts)

  return {
    headline: 'Build any poll you want',
    body: `Upload any list — celebrities, fictional characters, friends, inside jokes. Ask an AI assistant to generate names for your ${label} game in our CSV format${needsGender ? ' (name + gender columns)' : ''}, then import the file.`,
    promptExample: `"Create a CSV of 24 names for a ${label} game about [your theme] using the format in ${sample.download}${needsGender ? ' — include name and gender columns' : ''}."`,
    sampleHref: sample.href,
    sampleDownload: sample.download,
  }
}

export function getGameLandingCustomContentHints(gameType: GameType): CustomContentHint[] {
  const hints: CustomContentHint[] = []
  const questionHint = getQuestionCustomContentHint(gameType)
  const participantHint = getParticipantCustomContentHint(gameType)
  if (questionHint) hints.push(questionHint)
  if (participantHint) hints.push(participantHint)
  return hints
}
