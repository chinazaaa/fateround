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
