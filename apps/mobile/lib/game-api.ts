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
