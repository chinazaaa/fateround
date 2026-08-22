/**
 * Ludo puzzle solver — BFS over piece-state × dice-index that returns the actual
 * winning MOVE SEQUENCE, not just the roll count.
 *
 * The batch generator has its own solver (`solveLudoPuzzle` in
 * daily-batch-generator.ts) but returns only the number of rolls it took. The
 * daily answer reveal wants to show HOW to solve it — which piece moves on
 * each roll — so this walks the same state space and reconstructs the path by
 * following parent pointers back from the winning state. The transition
 * function (movePiece) is intentionally identical to the generator's so a puzzle
 * scored optimal by the generator is also solvable by this and vice versa.
 */

export type LudoPuzzlePieceZone = 'base' | 'track' | 'home' | 'finished'

export interface LudoPuzzlePieceState {
  zone: LudoPuzzlePieceZone
  pos: number
}

export interface LudoPuzzleStep {
  /** 1-indexed dice roll number in the puzzle's sequence. */
  rollNumber: number
  /** Face value shown on the roll (1–6). */
  roll: number
  /** 0-based index of the piece that moved, or null when nothing could move (skip). */
  pieceIndex: number | null
  /** Piece state BEFORE the roll — useful for "moved from track:14 → track:20"-style copy. */
  before: LudoPuzzlePieceState | null
  /** Piece state AFTER the roll — null when this roll was a skip. */
  after: LudoPuzzlePieceState | null
}

const TRACK_SIZE = 52
const HOME_SIZE = 5

function movePiece(piece: LudoPuzzlePieceState, roll: number, obstacleSet: Set<number>): LudoPuzzlePieceState | null {
  if (piece.zone === 'finished') return null
  if (piece.zone === 'base') {
    if (roll !== 6) return null
    return { zone: 'track', pos: 0 }
  }
  if (piece.zone === 'track') {
    const newPos = piece.pos + roll
    if (newPos >= TRACK_SIZE) {
      const homePos = newPos - TRACK_SIZE
      if (homePos >= HOME_SIZE) {
        if (homePos === HOME_SIZE) return { zone: 'finished', pos: 0 }
        return null
      }
      return { zone: 'home', pos: homePos }
    }
    if (obstacleSet.has(newPos)) return null
    return { zone: 'track', pos: newPos }
  }
  if (piece.zone === 'home') {
    const newPos = piece.pos + roll
    if (newPos === HOME_SIZE) return { zone: 'finished', pos: 0 }
    if (newPos > HOME_SIZE) return null
    return { zone: 'home', pos: newPos }
  }
  return null
}

function stateKey(pieces: LudoPuzzlePieceState[], diceIdx: number): string {
  return pieces.map((p) => `${p.zone}:${p.pos}`).join('|') + '|' + diceIdx
}

/**
 * Solve the puzzle and return the step-by-step optimal sequence, or null if no
 * solution reaches "all finished" within the given dice roll budget.
 *
 * Ties are broken by BFS visit order — for a puzzle with multiple equally-short
 * solutions the caller gets the first one the BFS reached, which is stable given
 * a stable piece order. That's fine for a "here's how to solve it" reveal.
 */
export function solveLudoPuzzleSteps(
  startPieces: LudoPuzzlePieceState[],
  dice: number[],
  obstacles: Array<{ trackPos: number }>
): LudoPuzzleStep[] | null {
  const obstacleSet = new Set(obstacles.map((o) => o.trackPos))

  type Node = {
    pieces: LudoPuzzlePieceState[]
    diceIdx: number
    // Parent link + the transition that got here, so we can walk back to build
    // the ordered step list once we find the finished state.
    parent: number
    movedPiece: number | null
    beforeState: LudoPuzzlePieceState | null
    afterState: LudoPuzzlePieceState | null
    rollValue: number
  }

  const initial: Node = {
    pieces: startPieces.map((p) => ({ zone: p.zone, pos: p.pos })),
    diceIdx: 0,
    parent: -1,
    movedPiece: null,
    beforeState: null,
    afterState: null,
    rollValue: 0,
  }

  const nodes: Node[] = [initial]
  const visited = new Set<string>()
  visited.add(stateKey(initial.pieces, initial.diceIdx))

  let head = 0
  let winner = -1
  while (head < nodes.length) {
    const current = nodes[head]
    if (current.pieces.every((p) => p.zone === 'finished')) {
      winner = head
      break
    }
    if (current.diceIdx >= dice.length) {
      head++
      continue
    }
    const roll = dice[current.diceIdx]
    let any = false
    for (let i = 0; i < current.pieces.length; i++) {
      const next = movePiece(current.pieces[i], roll, obstacleSet)
      if (!next) continue
      any = true
      const before = current.pieces[i]
      const newPieces = current.pieces.map((p, j) => (j === i ? next : { ...p }))
      const key = stateKey(newPieces, current.diceIdx + 1)
      if (visited.has(key)) continue
      visited.add(key)
      nodes.push({
        pieces: newPieces,
        diceIdx: current.diceIdx + 1,
        parent: head,
        movedPiece: i,
        beforeState: { ...before },
        afterState: { ...next },
        rollValue: roll,
      })
    }
    if (!any) {
      // No legal move for this die: skip it and continue.
      const key = stateKey(current.pieces, current.diceIdx + 1)
      if (!visited.has(key)) {
        visited.add(key)
        nodes.push({
          pieces: current.pieces.map((p) => ({ ...p })),
          diceIdx: current.diceIdx + 1,
          parent: head,
          movedPiece: null,
          beforeState: null,
          afterState: null,
          rollValue: roll,
        })
      }
    }
    head++
  }

  if (winner < 0) return null

  const path: LudoPuzzleStep[] = []
  let cursor = winner
  while (cursor > 0) {
    const node = nodes[cursor]
    path.push({
      rollNumber: node.diceIdx,
      roll: node.rollValue,
      pieceIndex: node.movedPiece,
      before: node.beforeState,
      after: node.afterState,
    })
    cursor = node.parent
  }
  path.reverse()
  return path
}
