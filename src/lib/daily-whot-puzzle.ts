const SHAPES = ['circle', 'triangle', 'square', 'star', 'cross'] as const
type Shape = (typeof SHAPES)[number]
type WhotShape = Shape | 'whot'

export interface WhotCard {
  shape: WhotShape
  number: number
}

export interface WhotPuzzleState {
  hand: WhotCard[]
  topCard: WhotCard
  currentShape: string
  marketDeck: WhotCard[]
}

export interface WhotPuzzleResult {
  puzzleData: {
    hand: WhotCard[]
    topCard: WhotCard
    currentShape: string
    marketDeck: WhotCard[]
    solution: {
      optimalMoves: number
      moves: Array<{ type: 'play'; card: WhotCard; chosenShape?: string } | { type: 'draw' }>
    }
  }
  config: {
    timer: number
    handSize: number
    optimalMoves: number
    drawCap: number
  }
}

// -- Seeded PRNG (LCG) -------------------------------------------------------

function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return (s >>> 0) / 0x100000000
  }
}

// -- Deck construction --------------------------------------------------------

function buildDeck(): WhotCard[] {
  const deck: WhotCard[] = []
  for (const shape of SHAPES) {
    for (let n = 1; n <= 14; n++) {
      deck.push({ shape, number: n })
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ shape: 'whot', number: 20 })
  }
  return deck
}

function shuffle(deck: WhotCard[], rng: () => number): WhotCard[] {
  const a = [...deck]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// -- Solver (BFS) -------------------------------------------------------------

const DRAW_CAP = 5
const MOVE_CAP = 20

type Move = { type: 'play'; card: WhotCard; chosenShape?: string } | { type: 'draw' }

interface SolverState {
  hand: WhotCard[]
  topCard: WhotCard
  currentShape: string
  drawsUsed: number
  movesUsed: number
  marketIndex: number
  moves: Move[]
}

function cardKey(c: WhotCard): string {
  return `${c.shape}:${c.number}`
}

function stateKey(s: SolverState): string {
  const handKeys = s.hand.map(cardKey).sort().join(',')
  return `${handKeys}|${cardKey(s.topCard)}|${s.currentShape}|${s.drawsUsed}|${s.marketIndex}`
}

function canPlay(card: WhotCard, currentShape: string, topNumber: number): boolean {
  if (card.shape === 'whot') return true
  return card.shape === currentShape || card.number === topNumber
}

function solve(hand: WhotCard[], topCard: WhotCard, currentShape: string, marketDeck: WhotCard[]): Move[] | null {
  const initial: SolverState = {
    hand: [...hand],
    topCard,
    currentShape,
    drawsUsed: 0,
    movesUsed: 0,
    marketIndex: 0,
    moves: [],
  }

  const queue: SolverState[] = [initial]
  const visited = new Set<string>()
  visited.add(stateKey(initial))

  while (queue.length > 0) {
    const state = queue.shift()!

    if (state.hand.length === 0) return state.moves

    if (state.movesUsed >= MOVE_CAP) continue

    const playable: Array<{ index: number; card: WhotCard }> = []
    for (let i = 0; i < state.hand.length; i++) {
      if (canPlay(state.hand[i], state.currentShape, state.topCard.number)) {
        playable.push({ index: i, card: state.hand[i] })
      }
    }

    // Deduplicate identical cards (same shape+number) to prune BFS
    const seen = new Set<string>()
    const uniquePlayable = playable.filter((p) => {
      const k = cardKey(p.card)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    for (const { index, card } of uniquePlayable) {
      const newHand = state.hand.filter((_, i) => i !== index)
      const shapesToTry: string[] = card.shape === 'whot' ? [...SHAPES] : [card.shape]

      for (const nextShape of shapesToTry) {
        const move: Move =
          card.shape === 'whot' ? { type: 'play', card, chosenShape: nextShape } : { type: 'play', card }

        // Hold On (number 1): player gets a free follow-up turn.
        // We model this by enqueueing the post-play state with the same movesUsed
        // so the BFS naturally explores the follow-up plays at the same depth.
        const isHoldOn = card.number === 1

        const next: SolverState = {
          hand: newHand,
          topCard: card,
          currentShape: nextShape,
          drawsUsed: state.drawsUsed,
          movesUsed: state.movesUsed + 1,
          marketIndex: state.marketIndex,
          moves: [...state.moves, move],
        }

        if (next.hand.length === 0) return next.moves

        const key = stateKey(next)
        if (!visited.has(key)) {
          visited.add(key)
          if (isHoldOn) {
            // Prioritize Hold On follow-ups by pushing to front
            queue.unshift(next)
          } else {
            queue.push(next)
          }
        }
      }
    }

    // Draw from market
    if (uniquePlayable.length === 0 && state.drawsUsed < DRAW_CAP && state.marketIndex < marketDeck.length) {
      const drawnCard = marketDeck[state.marketIndex]
      const next: SolverState = {
        hand: [...state.hand, drawnCard],
        topCard: state.topCard,
        currentShape: state.currentShape,
        drawsUsed: state.drawsUsed + 1,
        movesUsed: state.movesUsed + 1,
        marketIndex: state.marketIndex + 1,
        moves: [...state.moves, { type: 'draw' }],
      }
      const key = stateKey(next)
      if (!visited.has(key)) {
        visited.add(key)
        queue.push(next)
      }
    }
  }

  return null
}

// -- Public API ---------------------------------------------------------------

export function generateWhotPuzzle(seed: number, timer: number): WhotPuzzleResult {
  const MAX_ATTEMPTS = 50

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = createRng(seed + attempt)
    const deck = shuffle(buildDeck(), rng)

    const handSize = 6 + Math.floor(rng() * 3) // 6, 7, or 8

    const hand = deck.slice(0, handSize)
    const topCard = deck[handSize]

    // Top card must not be a Whot wildcard (no initial shape ambiguity)
    if (topCard.shape === 'whot') continue

    const remaining = deck.slice(handSize + 1)
    const marketDeck = shuffle(remaining, rng)
    const currentShape = topCard.shape

    const solution = solve(hand, topCard, currentShape, marketDeck)

    if (solution) {
      return {
        puzzleData: {
          hand: [...hand],
          topCard,
          currentShape,
          marketDeck,
          solution: {
            optimalMoves: solution.length,
            moves: solution,
          },
        },
        config: {
          timer,
          handSize,
          optimalMoves: solution.length,
          drawCap: DRAW_CAP,
        },
      }
    }
  }

  // Fallback: deterministic minimal puzzle guaranteed solvable
  const fallbackHand: WhotCard[] = [
    { shape: 'circle', number: 3 },
    { shape: 'circle', number: 7 },
    { shape: 'star', number: 7 },
    { shape: 'star', number: 2 },
    { shape: 'triangle', number: 2 },
    { shape: 'triangle', number: 10 },
  ]
  const fallbackTop: WhotCard = { shape: 'circle', number: 5 }
  const fallbackMarket = shuffle(buildDeck(), createRng(seed))

  return {
    puzzleData: {
      hand: fallbackHand,
      topCard: fallbackTop,
      currentShape: 'circle',
      marketDeck: fallbackMarket,
      solution: {
        optimalMoves: 6,
        moves: fallbackHand.map((card) => ({ type: 'play' as const, card })),
      },
    },
    config: {
      timer,
      handSize: 6,
      optimalMoves: 6,
      drawCap: DRAW_CAP,
    },
  }
}
