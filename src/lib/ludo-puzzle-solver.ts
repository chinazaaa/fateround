/**
 * Ludo puzzle solver — BFS over piece-state × dice-index that returns the actual
 * winning MOVE SEQUENCE, not just the roll count.
 *
 * The daily answer reveal wants to show HOW to solve a puzzle — which piece
 * moves on each roll — so this walks piece-state × dice-index and reconstructs the path by
 * following parent pointers back from the winning state. The batch generator now
 * scores its puzzles with this same function, so a puzzle the generator accepts is
 * one this reveal can explain and a player can actually win.
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

// Board geometry, identical to the daily play component (src/components/daily/DailyLudoPuzzlePlay.tsx),
// which is what players actually play: track squares 0-50, the home lane is entered at step 51, and a
// piece finishes on exactly step 56. Landing on an obstacle CAPTURES it (bonus points) rather than
// blocking the move, so obstacles never change which moves are legal.
//
// This used to model a 52-square track finishing at step 57 with blocking obstacles, which made both
// the answer reveal and the batch generator (which now calls this solver) disagree with real play:
// a puzzle could be scored solvable here and be unwinnable in the game (CodeRabbit on #1237).
const HOME_ENTRY_STEPS = 51
const HOME_LANE_LENGTH = 5
const FINISH_STEPS = HOME_ENTRY_STEPS + HOME_LANE_LENGTH

function toSteps(piece: LudoPuzzlePieceState): number {
  if (piece.zone === 'base') return -1
  if (piece.zone === 'track') return piece.pos
  if (piece.zone === 'home') return HOME_ENTRY_STEPS + piece.pos
  return FINISH_STEPS
}

function fromSteps(steps: number): LudoPuzzlePieceState {
  if (steps < HOME_ENTRY_STEPS) return { zone: 'track', pos: steps }
  if (steps < FINISH_STEPS) return { zone: 'home', pos: steps - HOME_ENTRY_STEPS }
  return { zone: 'finished', pos: 0 }
}

function movePiece(piece: LudoPuzzlePieceState, roll: number): LudoPuzzlePieceState | null {
  if (piece.zone === 'finished') return null
  if (piece.zone === 'base') return roll === 6 ? { zone: 'track', pos: 0 } : null
  const candidate = toSteps(piece) + roll
  // A piece must land exactly on the finish; overshooting is not a legal move.
  if (candidate > FINISH_STEPS) return null
  return fromSteps(candidate)
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
  // Obstacles are captured, never blocking (see the geometry note above), so they cannot change
  // the shortest winning line. The parameter stays so callers keep passing the full puzzle.
  void obstacles

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
      const next = movePiece(current.pieces[i], roll)
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
