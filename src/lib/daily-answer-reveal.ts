import type { DailyChallengeGameType } from '@/lib/daily-challenge'

/**
 * Yesterday's answers, in a shape any client can render.
 *
 * ── WHY ONLY YESTERDAY'S ──────────────────────────────────────────────────────
 * Every daily puzzle is deliberately answer-blind while it is live: `stripSolution()` removes
 * the solution before the puzzle is sent, Word Scramble / Word Hunt / crossword ship only
 * HASHES so the client can grade a guess without being able to read the answers, and the submit
 * response returns score and rank but never the solution. That is what keeps the leaderboard
 * meaningful, and none of it should be softened to add a reveal.
 *
 * So the reveal is time-gated instead of identity-gated: the route that serves this refuses any
 * date that is not strictly in the past (WAT). By the time a solution is visible, that puzzle
 * can no longer be scored, so the feature adds no cheat surface at all.
 *
 * Worth being straight about what this does NOT fix: a player can still learn the answers by
 * PLAYING on one device and re-entering them on another. That leak is the game telling you your
 * guess was right, which no reveal policy can remove, and gating rank behind a real account
 * doesn't close it either since accounts are free. This feature is closure for the player, and
 * it is built so it cannot make that worse.
 *
 * ── SHAPE ─────────────────────────────────────────────────────────────────────
 * One flat, renderable structure for all thirteen game types, so web and mobile share the
 * contract and a new game only has to be added here. `grid` is for puzzles whose answer IS a
 * grid; everything else is labelled lines.
 */
export type DailyAnswerSection =
  | { kind: 'lines'; label?: string; items: { label?: string; value: string }[] }
  | { kind: 'grid'; label?: string; rows: string[][] }

export type DailyAnswerReveal = {
  gameType: DailyChallengeGameType
  challengeDate: string
  sections: DailyAnswerSection[]
}

type Data = Record<string, unknown>

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const asRecord = (value: unknown): Data => (value && typeof value === 'object' ? (value as Data) : {})

/** Pull the across/down answer for one clue out of the solution grid. */
function crosswordAnswer(solution: string[][], clue: { row: number; col: number; length: number; direction: string }) {
  let word = ''
  for (let i = 0; i < clue.length; i++) {
    const r = clue.direction === 'across' ? clue.row : clue.row + i
    const c = clue.direction === 'across' ? clue.col + i : clue.col
    word += solution[r]?.[c] ?? ''
  }
  return word
}

/**
 * Build the reveal for one past challenge.
 *
 * Returns null when the puzzle data does not carry a solution this function understands —
 * better to show nothing than to render a confident, wrong answer. `daily-answer-reveal.test.ts`
 * asserts every shipped game type produces something, so "null" means genuinely broken data
 * rather than an unhandled game.
 */
export function buildDailyAnswerReveal(
  gameType: DailyChallengeGameType,
  challengeDate: string,
  puzzleData: Data
): DailyAnswerReveal | null {
  const sections = buildSections(gameType, puzzleData)
  if (!sections.length) return null
  return { gameType, challengeDate, sections }
}

function buildSections(gameType: DailyChallengeGameType, data: Data): DailyAnswerSection[] {
  switch (gameType) {
    case 'wordle': {
      // The one game whose answer the live client already holds — Wordle has to grade letters
      // locally. Integrity comes from the submit route re-grading server-side, not from hiding.
      const word = typeof data.word === 'string' ? data.word : ''
      return word ? [{ kind: 'lines', items: [{ value: word.toUpperCase() }] }] : []
    }

    case 'sudoku': {
      const solution = asArray<number[]>(data.solution)
      if (!solution.length) return []
      return [{ kind: 'grid', rows: solution.map((row) => row.map((n) => String(n))) }]
    }

    case 'word_hunt': {
      // The full dictionary of words the board contained — nobody finds them all, which is
      // exactly why seeing the list the next day is the satisfying part.
      const words = asArray<string>(data.valid_words)
      if (!words.length) return []
      const sorted = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b))
      return [{ kind: 'lines', label: `${sorted.length} words`, items: sorted.map((value) => ({ value })) }]
    }

    case 'word_search': {
      const words = asArray<{ word?: string }>(asRecord(data.metadata).words)
        .map((w) => (typeof w === 'string' ? w : w?.word))
        .filter((w): w is string => !!w)
      const placed = asArray<{ word?: string }>(data.solution)
        .map((p) => p?.word)
        .filter((w): w is string => !!w)
      const all = words.length ? words : placed
      return all.length ? [{ kind: 'lines', items: all.map((value) => ({ value })) }] : []
    }

    case 'word_scramble': {
      const answers = asArray<string>(data.solution)
      const scrambles = asArray<{ scrambled?: string; word?: string }>(asRecord(data.metadata).scrambles)
      if (!answers.length) return []
      return [
        {
          kind: 'lines',
          items: answers.map((value, i) => ({ label: scrambles[i]?.scrambled, value })),
        },
      ]
    }

    case 'crossword':
    case 'mini_crossword': {
      const solution = asArray<string[]>(data.solution)
      const clues = asArray<{
        row: number
        col: number
        length: number
        direction: string
        clue?: string
        number?: number
      }>(asRecord(data.metadata).clues)
      if (!solution.length || !clues.length) return []
      const line = (c: (typeof clues)[number]) => ({
        label: `${c.number ?? ''}${c.direction === 'across' ? 'A' : 'D'}. ${c.clue ?? ''}`.trim(),
        value: crosswordAnswer(solution, c),
      })
      const across: DailyAnswerSection = {
        kind: 'lines',
        label: 'Across',
        items: clues.filter((c) => c.direction === 'across').map(line),
      }
      const down: DailyAnswerSection = {
        kind: 'lines',
        label: 'Down',
        items: clues.filter((c) => c.direction !== 'across').map(line),
      }
      return [across, down].filter((s) => s.kind === 'lines' && s.items.length > 0)
    }

    case 'trivia': {
      const questions = asArray<{ question?: string; choices?: string[]; correct_index?: number }>(data.questions)
      // `solution` is the parallel array of correct indices; fall back to the per-question field
      // for rows written before it was split out.
      const indices = asArray<number>(data.solution)
      if (!questions.length) return []
      return [
        {
          kind: 'lines',
          items: questions.map((q, i) => {
            const idx = indices[i] ?? q.correct_index ?? -1
            return { label: q.question, value: q.choices?.[idx] ?? '—' }
          }),
        },
      ]
    }

    case 'word_grouping': {
      const groups = asArray<{ category?: string; words?: string[] }>(asRecord(data.solution).groups)
      if (!groups.length) return []
      return [
        {
          kind: 'lines',
          items: groups.map((g) => ({ label: g.category, value: (g.words ?? []).join(', ') })),
        },
      ]
    }

    case 'codenames_codeword': {
      const words = asArray<string>(asRecord(data.solution).correctWords)
      if (!words.length) return []
      const clue = typeof data.clue === 'string' ? data.clue : ''
      const number = typeof data.clueNumber === 'number' ? data.clueNumber : words.length
      return [
        {
          kind: 'lines',
          label: clue ? `${clue} ${number}` : undefined,
          items: words.map((value) => ({ value })),
        },
      ]
    }

    case 'chess_mate': {
      // Several mating lines can be correct; show each as a move sequence.
      const lines = asArray<string[]>(asRecord(data.solution).lines)
      if (!lines.length) return []
      return [
        {
          kind: 'lines',
          items: lines.map((moves, i) => ({
            label: lines.length > 1 ? `Line ${i + 1}` : undefined,
            value: moves.join(' '),
          })),
        },
      ]
    }

    case 'whot_puzzle': {
      const solution = asRecord(data.solution)
      const moves = asArray<{ type?: string; card?: { shape?: string; number?: number }; chosenShape?: string }>(
        solution.moves
      )
      if (!moves.length) return []
      return [
        {
          kind: 'lines',
          label: typeof solution.optimalMoves === 'number' ? `Solved in ${solution.optimalMoves} moves` : undefined,
          items: moves.map((m, i) => ({
            label: `${i + 1}`,
            value:
              m.type === 'draw'
                ? 'Draw from market'
                : `Play ${m.card?.number ?? '?'} ${m.card?.shape ?? ''}`.trim() +
                  (m.chosenShape ? ` → call ${m.chosenShape}` : ''),
          })),
        },
      ]
    }

    case 'ludo_puzzle': {
      const rolls = asRecord(data.solution).optimalRolls
      // The "answer" here is a target, not a sequence — the puzzle asks you to finish in as few
      // rolls as possible, so the number IS the thing worth knowing.
      return typeof rolls === 'number' ? [{ kind: 'lines', items: [{ value: `${rolls} rolls` }] }] : []
    }
  }
}
