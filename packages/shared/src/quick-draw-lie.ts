import type {
  Player,
  QuickDrawAssignment,
  QuickDrawDrawing,
  QuickDrawSession,
  QuickDrawTitle,
  QuickDrawVote,
} from './types'

export const QUICK_DRAW_MIN_PLAYERS = 3
export const QUICK_DRAW_REVEAL_SECONDS = 5
export const QUICK_DRAW_MAX_TITLE_LENGTH = 80

export type QuickDrawPhase = QuickDrawSession['phase']

export function isQuickDrawLieVariant(variant: unknown): boolean {
  return variant !== 'guess'
}

export function phaseDeadlineCountdown(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function playerDisplayName(playerId: string | null | undefined, players: Player[]): string {
  if (!playerId) return 'Someone'
  return players.find((p) => p.id === playerId)?.name ?? 'Someone'
}

export function assignmentForPlayer(
  assignments: QuickDrawAssignment[],
  roundId: string,
  playerId: string
): QuickDrawAssignment | null {
  return assignments.find((a) => a.round_id === roundId && a.player_id === playerId) ?? null
}

export function drawingsForRound(drawings: QuickDrawDrawing[], roundId: string): QuickDrawDrawing[] {
  return drawings
    .filter((d) => d.round_id === roundId)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id))
}

export function orderedRoundDrawings(
  drawings: QuickDrawDrawing[],
  roundId: string,
  players: Pick<Player, 'id' | 'name'>[]
): QuickDrawDrawing[] {
  const roundDrawings = drawingsForRound(drawings, roundId)
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  return [...roundDrawings].sort(
    (a, b) =>
      (nameById.get(a.player_id) ?? '').localeCompare(nameById.get(b.player_id) ?? '') || a.id.localeCompare(b.id)
  )
}

export function activeDrawingForSession(
  drawings: QuickDrawDrawing[],
  roundId: string,
  players: Pick<Player, 'id' | 'name'>[],
  drawingIndex: number
): QuickDrawDrawing | null {
  const ordered = orderedRoundDrawings(drawings, roundId, players)
  return ordered[drawingIndex] ?? null
}

export function titlesForDrawing(titles: QuickDrawTitle[], drawingId: string): QuickDrawTitle[] {
  return titles.filter((t) => t.drawing_id === drawingId)
}

export function votesForDrawing(votes: QuickDrawVote[], drawingId: string): QuickDrawVote[] {
  return votes.filter((v) => v.drawing_id === drawingId)
}

export function playerIsDrawingArtist(drawing: QuickDrawDrawing | null, playerId: string): boolean {
  return !!drawing && drawing.player_id === playerId
}

export function canPlayerSubmitFakeTitle(
  drawing: QuickDrawDrawing | null,
  playerId: string,
  opts?: { readOnly?: boolean }
): boolean {
  if (opts?.readOnly || !drawing) return false
  return drawing.player_id !== playerId
}

export function canPlayerVoteOnDrawing(
  drawing: QuickDrawDrawing | null,
  playerId: string,
  opts?: { readOnly?: boolean }
): boolean {
  if (opts?.readOnly || !drawing) return false
  return drawing.player_id !== playerId
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }
  return next
}

export function shuffledTitleOptions(titles: QuickDrawTitle[]): QuickDrawTitle[] {
  return shuffle(titles)
}

export interface QuickDrawPlayerScore {
  id: string
  name: string
  score: number
  foolCount: number
}

export function tallyQuickDrawScores(
  titles: QuickDrawTitle[],
  votes: QuickDrawVote[],
  drawings: QuickDrawDrawing[],
  players: Player[]
): QuickDrawPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { score: number; fools: number }>()
  for (const p of activePlayers) totals.set(p.id, { score: 0, fools: 0 })

  const titleById = new Map(titles.map((t) => [t.id, t]))
  const drawingById = new Map(drawings.map((d) => [d.id, d]))
  const votesByTitle = new Map<string, number>()
  for (const vote of votes) {
    votesByTitle.set(vote.chosen_title_id, (votesByTitle.get(vote.chosen_title_id) ?? 0) + 1)
  }

  for (const [titleId, voteCount] of votesByTitle) {
    const title = titleById.get(titleId)
    if (!title || voteCount <= 0) continue
    if (title.is_real) {
      const drawing = drawingById.get(title.drawing_id)
      if (drawing) {
        const row = totals.get(drawing.player_id)
        if (row) row.score += voteCount * 1000
      }
    } else if (title.player_id) {
      const row = totals.get(title.player_id)
      if (row) {
        row.score += voteCount * 500
        row.fools += voteCount
      }
    }
  }

  return activePlayers
    .map((p) => {
      const row = totals.get(p.id) ?? { score: 0, fools: 0 }
      return { id: p.id, name: p.name, score: row.score, foolCount: row.fools }
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
