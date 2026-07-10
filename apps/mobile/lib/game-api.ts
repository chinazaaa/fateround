import { apiUrl } from '@/lib/config'

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export function postTicTacToeMove(gameId: string, resumeToken: string, cellIndex: number) {
  return postJson<{ success: boolean }>('/api/tic-tac-toe/move', { gameId, resumeToken, cellIndex })
}

export function postCheckersMove(gameId: string, resumeToken: string, from: string, to: string) {
  return postJson<{ success: boolean }>('/api/checkers/move', { gameId, resumeToken, from, to })
}

export function postAyoMove(gameId: string, resumeToken: string, pitIndex: number) {
  return postJson<{ success: boolean }>('/api/ayo/move', { gameId, resumeToken, pitIndex })
}

export function postBingoMark(gameId: string, resumeToken: string, cellIndex: number) {
  return postJson<{ success: boolean; marked_indices?: number[] }>('/api/bingo/mark', {
    gameId,
    resumeToken,
    cellIndex,
  })
}

export function postTriviaAnswer(gameId: string, resumeToken: string, roundId: string, choiceIndex: number) {
  return postJson<{ success: boolean; isCorrect: boolean; points: number }>('/api/trivia/answer', {
    gameId,
    resumeToken,
    roundId,
    choiceIndex,
  })
}

export function postPlayerReady(gameId: string, resumeToken: string, ready: boolean) {
  return postJson<{ success: boolean }>('/api/players/ready', { gameId, resumeToken, ready })
}

export function postVote(gameId: string, resumeToken: string, roundId: string, body: Record<string, unknown>) {
  return postJson<{ success: boolean; revealedQuestion?: string; pickedNumber?: number }>('/api/votes', {
    gameId,
    resumeToken,
    roundId,
    ...body,
  })
}

export function postMatchingPairsFlip(
  gameId: string,
  resumeToken: string,
  pairIndex: number,
  isMatch: boolean
) {
  return postJson<{ success: boolean; pointsAfter: number; finished?: boolean }>('/api/matching-pairs/flip', {
    gameId,
    resumeToken,
    pairIndex,
    isMatch,
  })
}

export function postSudokuSubmit(
  gameId: string,
  resumeToken: string,
  row: number,
  col: number,
  value: number
) {
  return postJson<{ success: boolean; isCorrect: boolean; pointsAwarded: number }>('/api/sudoku/submit', {
    gameId,
    resumeToken,
    row,
    col,
    value,
  })
}

export function postYahtzeeRoll(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/yahtzee/roll', { gameId, resumeToken })
}

export function postYahtzeeHold(gameId: string, resumeToken: string, held: boolean[]) {
  return postJson<{ success: boolean }>('/api/yahtzee/hold', { gameId, resumeToken, held })
}

export function postYahtzeeScore(gameId: string, resumeToken: string, category: string) {
  return postJson<{ success: boolean }>('/api/yahtzee/score', { gameId, resumeToken, category })
}

export function postSnakeLadderRoll(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean; roll?: number }>('/api/snake-and-ladder/roll', { gameId, resumeToken })
}

export function postLudoRoll(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean; dice?: unknown }>('/api/ludo/roll', { gameId, resumeToken })
}

export function postLudoMove(gameId: string, resumeToken: string, pieceId: number, diceIndex: number) {
  return postJson<{ success: boolean }>('/api/ludo/move', { gameId, resumeToken, pieceId, diceIndex })
}

export function postCrazyEightsPlay(gameId: string, resumeToken: string, cardId: string) {
  return postJson<{ success: boolean }>('/api/crazy-eights/play', { gameId, resumeToken, cardId })
}

export function postCrazyEightsDraw(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/crazy-eights/draw', { gameId, resumeToken })
}

export function postCrazyEightsChoose(gameId: string, resumeToken: string, suit: string) {
  return postJson<{ success: boolean }>('/api/crazy-eights/choose', { gameId, resumeToken, suit })
}

export function postWhotPlay(gameId: string, resumeToken: string, cardId: string) {
  return postJson<{ success: boolean }>('/api/whot/play', { gameId, resumeToken, cardId })
}

export function postWhotDraw(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/whot/draw', { gameId, resumeToken })
}

export function postWhotChooseShape(gameId: string, resumeToken: string, shape: string) {
  return postJson<{ success: boolean }>('/api/whot/choose', { gameId, resumeToken, shape })
}

export function postWhotChooseNumber(gameId: string, resumeToken: string, number: number) {
  return postJson<{ success: boolean }>('/api/whot/choose', { gameId, resumeToken, number })
}

export function postTtlStatements(
  gameId: string,
  resumeToken: string,
  statementA: string,
  statementB: string,
  statementC: string,
  lieIndex: number
) {
  return postJson<{ success: boolean }>('/api/two-truths/statements', {
    gameId,
    resumeToken,
    statementA,
    statementB,
    statementC,
    lieIndex,
  })
}

export function postTtlGuess(gameId: string, resumeToken: string, roundId: string, guessedIndex: number) {
  return postJson<{ success: boolean }>('/api/two-truths/guess', {
    gameId,
    resumeToken,
    roundId,
    guessedIndex,
  })
}

export function postDescribeItTeam(gameId: string, resumeToken: string, team: number) {
  return postJson<{ success: boolean }>('/api/describe-it/team', { gameId, resumeToken, team })
}

export function postDescribeItClue(gameId: string, resumeToken: string, clue: string) {
  return postJson<{ success: boolean }>('/api/describe-it/clue', { gameId, resumeToken, clue })
}

export function postDescribeItGuess(gameId: string, resumeToken: string, text: string) {
  return postJson<{ success: boolean; correct?: boolean }>('/api/describe-it/guess', {
    gameId,
    resumeToken,
    text,
  })
}

export function postDescribeItSkip(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/describe-it/skip', { gameId, resumeToken })
}

export function postQuiplashAnswer(gameId: string, resumeToken: string, roundId: string, text: string) {
  return postJson<{ success: boolean }>('/api/quiplash/answer', { gameId, resumeToken, roundId, text })
}

export function postQuiplashVote(gameId: string, resumeToken: string, roundId: string, chosenAnswerId: string) {
  return postJson<{ success: boolean }>('/api/quiplash/vote', { gameId, resumeToken, roundId, chosenAnswerId })
}

export function postWordRushTeam(gameId: string, resumeToken: string, team: number) {
  return postJson<{ success: boolean }>('/api/word-rush/team', { gameId, resumeToken, team })
}

export function postWordRushSubmit(gameId: string, resumeToken: string, text: string) {
  return postJson<{ success: boolean; correct?: boolean; points?: number; message?: string }>(
    '/api/word-rush/submit',
    { gameId, resumeToken, text }
  )
}

export function postWordRushPrompt(
  gameId: string,
  resumeToken: string,
  startLetter: string,
  endLetter: string,
  minWordLength?: number
) {
  return postJson<{ success: boolean }>('/api/word-rush/prompt', {
    gameId,
    resumeToken,
    startLetter,
    endLetter,
    minWordLength,
  })
}

export function postWordHuntSubmit(gameId: string, resumeToken: string, word: string, path: number[]) {
  return postJson<{ success: boolean; pointsAwarded?: number }>('/api/word-hunt/submit', {
    gameId,
    resumeToken,
    word,
    path,
  })
}

export function postNpatLetter(gameId: string, resumeToken: string, roundId: string, letter: string) {
  return postJson<{ success: boolean }>('/api/npat/letter', { gameId, resumeToken, roundId, letter })
}

export function postNpatSubmit(
  gameId: string,
  resumeToken: string,
  roundId: string,
  answers: { name: string; animal: string; place: string; thing: string; food: string }
) {
  return postJson<{ success: boolean }>('/api/npat/submit', { gameId, resumeToken, roundId, ...answers })
}

export function postNpatMark(
  gameId: string,
  resumeToken: string,
  roundId: string,
  flags: {
    validName: boolean
    validAnimal: boolean
    validPlace: boolean
    validThing: boolean
    validFood: boolean
  }
) {
  return postJson<{ success: boolean }>('/api/npat/mark', { gameId, resumeToken, roundId, ...flags })
}

export function postNpatCallerApprove(gameId: string, resumeToken: string, roundId: string) {
  return postJson<{ success: boolean }>('/api/npat/caller-approve', {
    gameId,
    resumeToken,
    roundId,
    overrides: [],
  })
}
