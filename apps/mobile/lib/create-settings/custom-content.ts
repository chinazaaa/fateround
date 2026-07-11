import type { Game, GameType, TriviaCategory } from '@fateround/shared'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
} from '@fateround/shared/poll-games'
import {
  isCodewordsGame,
  isDescribeItGame,
  isQuickDrawGame,
  isQuiplashGame,
  isTriviaGame,
} from '@fateround/shared/game-type-checks'

/** Mirrors web `CODEWORDS_MIN_CUSTOM_POOL` (one full 25-tile board). */
export const CODEWORDS_MIN_CUSTOM_POOL = 25
/** Mirrors web `PAN_MIN_POOL`. */
export const PICK_A_NUMBER_MIN_POOL = 5
export const MAX_TRIVIA_CHOICES = 4

export type CustomQuestionSource = 'platform' | 'custom' | 'library'

/** Which manual editor a game needs. */
export type CustomContentKind = 'binary' | 'trivia' | 'list'

export type WyrPairDraft = { optionA: string; optionB: string }
export type TriviaDraft = {
  question: string
  choices: string[]
  correctIndex: number
  category: TriviaCategory
}

export type CustomContentState = {
  source: CustomQuestionSource
  pairs: WyrPairDraft[]
  prompts: string[]
  trivia: TriviaDraft[]
  /** Title of the picked community pack when `source === 'library'` (UI only). */
  libraryPackTitle: string | null
}

/** Library and custom both persist as `question_source: 'custom'` — they share buffers. */
export function usesCustomQuestions(source: CustomQuestionSource): boolean {
  return source !== 'platform'
}

/** Games that expose a community "library" pack tier (mirrors web `questionSourceOptions`). */
export function supportsLibrary(gameType: GameType): boolean {
  return (
    isTriviaGame(gameType) ||
    isBinaryChoiceGame(gameType) ||
    isMostLikelyTo(gameType) ||
    isNeverHaveIEver(gameType) ||
    isPickANumber(gameType) ||
    isCodewordsGame(gameType) ||
    isDescribeItGame(gameType) ||
    isQuickDrawGame(gameType)
  )
}

export function emptyTriviaDraft(): TriviaDraft {
  return { question: '', choices: ['', ''], correctIndex: 0, category: 'general' }
}

export function defaultCustomContentState(): CustomContentState {
  return {
    source: 'platform',
    pairs: [{ optionA: '', optionB: '' }],
    prompts: [''],
    trivia: [emptyTriviaDraft()],
    libraryPackTitle: null,
  }
}

/** Convert a community pack's raw `questions` into the editor buffers for a game. */
export function packQuestionsToState(
  gameType: GameType,
  questions: unknown[],
  title: string
): Partial<CustomContentState> {
  const kind = customContentKind(gameType)
  if (kind === 'binary') {
    const pairs = questions
      .map((q) => {
        const o = (q ?? {}) as { optionA?: unknown; optionB?: unknown }
        return { optionA: String(o.optionA ?? '').trim(), optionB: String(o.optionB ?? '').trim() }
      })
      .filter((p) => p.optionA && p.optionB)
    return { source: 'library', libraryPackTitle: title, pairs: pairs.length ? pairs : [{ optionA: '', optionB: '' }] }
  }
  if (kind === 'trivia') {
    const trivia = questions
      .map((q) => {
        const o = (q ?? {}) as { question?: unknown; choices?: unknown; correctIndex?: unknown; category?: unknown }
        const choices = Array.isArray(o.choices)
          ? o.choices.filter((c): c is string => typeof c === 'string').map((c) => c.trim()).filter(Boolean)
          : []
        return {
          question: String(o.question ?? '').trim(),
          choices: choices.slice(0, MAX_TRIVIA_CHOICES),
          correctIndex: Number(o.correctIndex) || 0,
          category: (o.category === 'tech' ? 'tech' : 'general') as TriviaCategory,
        }
      })
      .filter((t) => t.question && t.choices.length >= 2 && t.correctIndex < t.choices.length)
    return { source: 'library', libraryPackTitle: title, trivia: trivia.length ? trivia : [emptyTriviaDraft()] }
  }
  const prompts = questions
    .map((q) => (typeof q === 'string' ? q : String((q as { question?: unknown })?.question ?? '')))
    .map((p) => p.trim())
    .filter(Boolean)
  return { source: 'library', libraryPackTitle: title, prompts: prompts.length ? prompts : [''] }
}

/** Build editor state from a game's stored pool (for lobby word-pool editing). */
export function customContentStateFromGame(game: Pick<Game, 'game_type' | 'question_source' | 'custom_questions'>): CustomContentState {
  const base = defaultCustomContentState()
  const isCustom = game.question_source === 'custom' && Array.isArray(game.custom_questions) && game.custom_questions.length > 0
  if (!isCustom) return base
  return {
    ...base,
    ...packQuestionsToState(game.game_type, game.custom_questions as unknown[], ''),
    source: 'custom',
    libraryPackTitle: null,
  }
}

/**
 * The manual-entry editor a game type uses, or `null` when the game has no
 * host-supplied question/word pool. Mirrors `parseCustomQuestionsBody` on
 * `src/app/api/games/route.ts` — the games the server accepts `custom_questions`
 * for.
 */
export function customContentKind(gameType: GameType): CustomContentKind | null {
  if (isBinaryChoiceGame(gameType)) return 'binary'
  if (isTriviaGame(gameType)) return 'trivia'
  if (
    isMostLikelyTo(gameType) ||
    isNeverHaveIEver(gameType) ||
    isPickANumber(gameType) ||
    isQuiplashGame(gameType) ||
    isQuickDrawGame(gameType) ||
    isCodewordsGame(gameType) ||
    isDescribeItGame(gameType)
  ) {
    return 'list'
  }
  return null
}

export function supportsCustomContent(gameType: GameType): boolean {
  return customContentKind(gameType) !== null
}

/** Single word, no whitespace, ≤ 40 chars — mirrors web `normalizeCodeword`. */
export function normalizeCodeword(word: string): string | null {
  const trimmed = word.trim()
  if (!trimmed || trimmed.length > 40) return null
  if (/\s/.test(trimmed)) return null
  return trimmed
}

/** The noun shown to the host for a game's custom items. */
export function customContentNoun(gameType: GameType, plural = true): string {
  if (isCodewordsGame(gameType)) return plural ? 'words' : 'word'
  if (isDescribeItGame(gameType) || isQuickDrawGame(gameType)) return plural ? 'words' : 'word'
  return plural ? 'questions' : 'question'
}

export type CustomContentCopy = {
  /** Label for the source segmented control's "custom" option. */
  sourceHint: string
  /** Empty-state helper under the list. */
  hint: string
  addLabel: string
  placeholder: string
}

export function customContentCopy(gameType: GameType): CustomContentCopy {
  if (isBinaryChoiceGame(gameType)) {
    return {
      sourceHint: 'Add your own either/or prompts.',
      hint: 'Two options per prompt — e.g. Coffee vs Tea.',
      addLabel: 'Add prompt',
      placeholder: 'Option',
    }
  }
  if (isTriviaGame(gameType)) {
    return {
      sourceHint: 'Write your own multiple-choice questions.',
      hint: 'Question, 2–4 answers, and mark the correct one.',
      addLabel: 'Add question',
      placeholder: 'Question',
    }
  }
  if (isCodewordsGame(gameType)) {
    return {
      sourceHint: `Add at least ${CODEWORDS_MIN_CUSTOM_POOL} single words for your boards.`,
      hint: 'One single word per row (no spaces).',
      addLabel: 'Add word',
      placeholder: 'Word',
    }
  }
  if (isDescribeItGame(gameType) || isQuickDrawGame(gameType)) {
    return {
      sourceHint: 'Add your own words and prompts.',
      hint: 'One word or short prompt per row.',
      addLabel: 'Add word',
      placeholder: 'Word or prompt',
    }
  }
  if (isNeverHaveIEver(gameType)) {
    return {
      sourceHint: 'Add your own prompts.',
      hint: 'The "Never have I ever" prefix is added automatically.',
      addLabel: 'Add prompt',
      placeholder: 'been skydiving',
    }
  }
  if (isPickANumber(gameType)) {
    return {
      sourceHint: `Add at least ${PICK_A_NUMBER_MIN_POOL} questions for the numbered list.`,
      hint: 'One question per row.',
      addLabel: 'Add question',
      placeholder: 'Question',
    }
  }
  return {
    sourceHint: 'Write your own questions.',
    hint: 'One question per row.',
    addLabel: 'Add question',
    placeholder: 'Question',
  }
}

function validPairs(custom: CustomContentState): WyrPairDraft[] {
  return custom.pairs
    .map((p) => ({ optionA: p.optionA.trim(), optionB: p.optionB.trim() }))
    .filter((p) => p.optionA && p.optionB)
}

function validTrivia(custom: CustomContentState): TriviaDraft[] {
  const out: TriviaDraft[] = []
  for (const t of custom.trivia) {
    const question = t.question.trim()
    const choices = t.choices.map((c) => c.trim()).filter(Boolean).slice(0, MAX_TRIVIA_CHOICES)
    if (!question || choices.length < 2) continue
    if (t.correctIndex < 0 || t.correctIndex >= choices.length) continue
    out.push({ question, choices, correctIndex: t.correctIndex, category: t.category })
  }
  return out
}

function validListItems(gameType: GameType, custom: CustomContentState): string[] {
  if (isCodewordsGame(gameType)) {
    const out: string[] = []
    for (const raw of custom.prompts) {
      const word = normalizeCodeword(raw)
      if (word) out.push(word)
    }
    return out
  }
  return custom.prompts.map((p) => p.trim()).filter(Boolean)
}

/** Count of valid, ready-to-send items for the current game. */
export function customContentCount(gameType: GameType, custom: CustomContentState): number {
  const kind = customContentKind(gameType)
  if (kind === 'binary') return validPairs(custom).length
  if (kind === 'trivia') return validTrivia(custom).length
  if (kind === 'list') return validListItems(gameType, custom).length
  return 0
}

/** Minimum items the host must supply for the given round count. */
export function customContentMinimum(gameType: GameType, roundsCount: number): number {
  if (isCodewordsGame(gameType)) return CODEWORDS_MIN_CUSTOM_POOL
  if (isPickANumber(gameType)) return PICK_A_NUMBER_MIN_POOL
  return Math.max(1, roundsCount)
}

/**
 * `null` when the custom pool is valid (or unused). Mirrors the 400s in
 * `POST /api/games` so the host sees the error before we hit the network.
 */
export function validateCustomContent(
  gameType: GameType,
  custom: CustomContentState,
  roundsCount: number
): string | null {
  if (!supportsCustomContent(gameType) || !usesCustomQuestions(custom.source)) return null
  const count = customContentCount(gameType, custom)
  const min = customContentMinimum(gameType, roundsCount)
  if (count < min) {
    const noun = customContentNoun(gameType)
    const lead = custom.source === 'library' ? 'Pick a pack with at least' : 'Add at least'
    if (isCodewordsGame(gameType) || isPickANumber(gameType)) {
      return `${lead} ${min} ${noun} (${count} so far)`
    }
    return `${lead} ${min} ${noun} for ${roundsCount} rounds (${count} so far)`
  }
  return null
}

/** `question_source` + `custom_questions` for the create payload. */
export function customContentPayload(
  gameType: GameType,
  custom: CustomContentState
): Record<string, unknown> {
  if (!supportsCustomContent(gameType) || !usesCustomQuestions(custom.source)) {
    return { question_source: 'platform' }
  }
  const kind = customContentKind(gameType)
  let customQuestions: unknown[] = []
  if (kind === 'binary') customQuestions = validPairs(custom)
  else if (kind === 'trivia') customQuestions = validTrivia(custom)
  else if (kind === 'list') customQuestions = validListItems(gameType, custom)

  return { question_source: 'custom', custom_questions: customQuestions }
}
