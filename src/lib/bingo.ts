import type { SupabaseClient } from '@supabase/supabase-js'

export const BINGO_COLUMNS = ['B', 'I', 'N', 'G', 'O'] as const
export type BingoColumn = (typeof BINGO_COLUMNS)[number]
export type BingoWinPattern = 'line' | 'full_house'

export const BINGO_MIN_PLAYERS = 2
export const BINGO_MAX_PLAYERS = 30
export const BINGO_DEFAULT_MAX_PLAYERS = 20
export const BINGO_FREE_INDEX = 12

const COLUMN_RANGES: Record<BingoColumn, [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
}

const WINNING_LINES: number[][] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function pickUnique(min: number, max: number, count: number): number[] {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return shuffle(pool).slice(0, count)
}

export function columnForNumber(number: number): BingoColumn | null {
  if (number >= 1 && number <= 15) return 'B'
  if (number >= 16 && number <= 30) return 'I'
  if (number >= 31 && number <= 45) return 'N'
  if (number >= 46 && number <= 60) return 'G'
  if (number >= 61 && number <= 75) return 'O'
  return null
}

export function formatBingoNumber(number: number): string {
  const column = columnForNumber(number)
  return column ? `${column}-${number}` : String(number)
}

export function generateBingoCard(): number[] {
  const cells: number[] = []
  for (const column of BINGO_COLUMNS) {
    const [min, max] = COLUMN_RANGES[column]
    const count = column === 'N' ? 4 : 5
    const picks = pickUnique(min, max, count)
    if (column === 'N') {
      cells.push(picks[0], picks[1], 0, picks[2], picks[3])
    } else {
      cells.push(...picks)
    }
  }
  return cells
}

export function defaultMarkedIndices(): number[] {
  return [BINGO_FREE_INDEX]
}

export function isValidBingoNumber(number: number): boolean {
  return Number.isInteger(number) && number >= 1 && number <= 75
}

export function pickRandomUncalledNumber(called: number[]): number | null {
  const calledSet = new Set(called)
  const remaining = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !calledSet.has(n))
  if (remaining.length === 0) return null
  return remaining[Math.floor(Math.random() * remaining.length)]
}

export function hasBingoWin(
  cells: number[],
  markedIndices: number[],
  pattern: BingoWinPattern = 'line'
): boolean {
  const marked = new Set(markedIndices)
  if (pattern === 'full_house') {
    return cells.every((cell, index) => cell === 0 || marked.has(index))
  }
  return WINNING_LINES.some((line) => line.every((index) => cells[index] === 0 || marked.has(index)))
}

export function canMarkCell(cells: number[], index: number, number: number, called: number[]): boolean {
  if (index < 0 || index >= cells.length) return false
  if (cells[index] === 0) return false
  if (cells[index] !== number) return false
  return called.includes(number)
}

export function clampBingoMaxPlayers(value: number): number {
  return Math.min(BINGO_MAX_PLAYERS, Math.max(BINGO_MIN_PLAYERS, value))
}

export function bingoMaxPlayers(game: { max_players?: number | null }): number {
  if (game.max_players == null) return BINGO_DEFAULT_MAX_PLAYERS
  return clampBingoMaxPlayers(game.max_players)
}

export async function createBingoCardForPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('bingo_cards')
    .select('id')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) return { error: null }

  const { error } = await supabase.from('bingo_cards').insert({
    game_id: gameId,
    player_id: playerId,
    cells: generateBingoCard(),
    marked_indices: defaultMarkedIndices(),
  })

  return { error: error?.message ?? null }
}

export async function createBingoCardsForPlayers(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error: string | null }> {
  for (const playerId of playerIds) {
    const result = await createBingoCardForPlayer(supabase, gameId, playerId)
    if (result.error) return result
  }
  return { error: null }
}

export async function clearBingoSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const tables = ['bingo_claims', 'bingo_called_numbers', 'bingo_cards'] as const
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
    if (error) return { error: error.message }
  }
  return { error: null }
}
