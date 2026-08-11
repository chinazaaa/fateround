import { WORD_THEMES } from '@/data/daily-banks/themed-words'
import { TRIVIA_BANK } from '@/data/daily-banks/trivia-bank'
import { WORD_GROUPING_BANK } from '@/data/daily-banks/word-grouping-bank'
import { CHESS_BANK } from '@/data/daily-banks/chess-bank'
import { CODENAMES_BANK } from '@/data/daily-banks/codenames-bank'
import { LUDO_BANK } from '@/data/daily-banks/ludo-bank'

type GameTypeId =
  | 'crossword'
  | 'mini_crossword'
  | 'word_search'
  | 'word_scramble'
  | 'trivia'
  | 'word_grouping'
  | 'chess_mate'
  | 'codenames_codeword'
  | 'ludo_puzzle'

interface ExistingRow {
  game_type: string
  challenge_date: string
  content: unknown
}

export interface GeneratedEntry {
  game_type: GameTypeId
  challenge_date: string
  content: unknown
  theme: string
}

export interface BankCapacity {
  game_type: GameTypeId
  label: string
  totalInBank: number
  alreadyUsed: number
  remaining: number
  generatedThisBatch: number
  remainingAfterBatch: number
  exhausted: boolean
  daysCouldNotFill: number
}

export interface BatchResult {
  generated: GeneratedEntry[]
  capacity: BankCapacity[]
}

// ---------------------------------------------------------------------------
// Seeded PRNG (xorshift32) — deterministic per date
// ---------------------------------------------------------------------------

function createRng(seed: number) {
  let s = seed | 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

function dateSeed(date: string, salt: string): number {
  const str = `batch:${salt}:${date}`
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------------------
// Extraction helpers — pull used content from existing rows
// ---------------------------------------------------------------------------

function extractUsedWords(rows: ExistingRow[]): Set<string> {
  const used = new Set<string>()
  for (const r of rows) {
    const c = r.content
    if (!Array.isArray(c)) continue
    for (const item of c) {
      if (typeof item === 'string') used.add(item.toUpperCase())
      else if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>
        if (typeof obj.answer === 'string') used.add(obj.answer.toUpperCase())
        if (typeof obj.word === 'string') used.add(obj.word.toUpperCase())
      }
    }
  }
  return used
}

function extractUsedQuestions(rows: ExistingRow[]): Set<string> {
  const used = new Set<string>()
  for (const r of rows) {
    if (r.game_type !== 'trivia') continue
    if (!Array.isArray(r.content)) continue
    for (const q of r.content as Array<{ question?: string }>) {
      if (q.question) used.add(q.question.toLowerCase().trim())
    }
  }
  return used
}

function extractUsedPuzzleKeys(rows: ExistingRow[], keyFn: (c: unknown) => string): Set<string> {
  const used = new Set<string>()
  for (const r of rows) {
    try {
      used.add(keyFn(r.content))
    } catch {
      // skip unparseable
    }
  }
  return used
}

// ---------------------------------------------------------------------------
// Per-game generators
// ---------------------------------------------------------------------------

function generateCrosswordContent(
  date: string,
  usedWords: Set<string>,
  mini: boolean
): { content: unknown; theme: string } | null {
  const maxLen = mini ? 7 : 13
  const minEntries = mini ? 6 : 8
  const rng = createRng(dateSeed(date, mini ? 'mini_crossword' : 'crossword'))

  // Pick a theme for this date
  const themeIdx = Math.floor(rng() * WORD_THEMES.length)
  const theme = WORD_THEMES[themeIdx]

  // Filter entries: right length, not already used
  const available = theme.entries.filter(
    (e) => e.word.length <= maxLen && e.word.length >= 3 && !usedWords.has(e.word.toUpperCase())
  )

  if (available.length < minEntries) {
    // Try a different theme
    for (let attempt = 0; attempt < WORD_THEMES.length; attempt++) {
      const alt = WORD_THEMES[(themeIdx + attempt + 1) % WORD_THEMES.length]
      const altAvail = alt.entries.filter(
        (e) => e.word.length <= maxLen && e.word.length >= 3 && !usedWords.has(e.word.toUpperCase())
      )
      if (altAvail.length >= minEntries) {
        const picked = shuffle(altAvail, rng).slice(0, mini ? 8 : 12)
        return {
          content: picked.map((e) => ({ answer: e.word.toUpperCase(), clue: e.clue })),
          theme: alt.name,
        }
      }
    }
    return null
  }

  const picked = shuffle(available, rng).slice(0, mini ? 8 : 12)
  return {
    content: picked.map((e) => ({ answer: e.word.toUpperCase(), clue: e.clue })),
    theme: theme.name,
  }
}

function generateWordSearchContent(date: string, usedWords: Set<string>): { content: unknown; theme: string } | null {
  const rng = createRng(dateSeed(date, 'word_search'))
  const themeIdx = Math.floor(rng() * WORD_THEMES.length)

  for (let attempt = 0; attempt < WORD_THEMES.length; attempt++) {
    const theme = WORD_THEMES[(themeIdx + attempt) % WORD_THEMES.length]
    const available = theme.entries.filter(
      (e) => e.word.length >= 3 && e.word.length <= 12 && !usedWords.has(e.word.toUpperCase())
    )
    if (available.length >= 8) {
      const picked = shuffle(available, rng).slice(0, 10)
      return {
        content: picked.map((e) => e.word.toUpperCase()),
        theme: theme.name,
      }
    }
  }
  return null
}

function generateWordScrambleContent(date: string, usedWords: Set<string>): { content: unknown; theme: string } | null {
  const rng = createRng(dateSeed(date, 'word_scramble'))
  const themeIdx = Math.floor(rng() * WORD_THEMES.length)

  for (let attempt = 0; attempt < WORD_THEMES.length; attempt++) {
    const theme = WORD_THEMES[(themeIdx + attempt) % WORD_THEMES.length]
    const available = theme.entries.filter(
      (e) => e.word.length >= 4 && e.word.length <= 10 && !usedWords.has(e.word.toUpperCase())
    )
    if (available.length >= 6) {
      const picked = shuffle(available, rng).slice(0, 8)
      return {
        content: picked.map((e) => ({ word: e.word.toUpperCase(), clue: e.clue })),
        theme: theme.name,
      }
    }
  }
  return null
}

function generateTriviaContent(date: string, usedQuestions: Set<string>): { content: unknown; theme: string } | null {
  const rng = createRng(dateSeed(date, 'trivia'))

  // Group by category
  const byCategory = new Map<string, typeof TRIVIA_BANK>()
  for (const q of TRIVIA_BANK) {
    if (usedQuestions.has(q.question.toLowerCase().trim())) continue
    const list = byCategory.get(q.category) ?? []
    list.push(q)
    byCategory.set(q.category, list)
  }

  const categories = shuffle([...byCategory.keys()], rng)
  const picked: typeof TRIVIA_BANK = []

  // Pick 1 question from each category until we have 6
  for (const cat of categories) {
    if (picked.length >= 6) break
    const catQuestions = byCategory.get(cat)!
    if (catQuestions.length === 0) continue
    const idx = Math.floor(rng() * catQuestions.length)
    picked.push(catQuestions[idx])
    catQuestions.splice(idx, 1)
  }

  // If we need more, do a second pass
  if (picked.length < 5) {
    for (const cat of categories) {
      if (picked.length >= 6) break
      const catQuestions = byCategory.get(cat)!
      while (catQuestions.length > 0 && picked.length < 6) {
        const idx = Math.floor(rng() * catQuestions.length)
        picked.push(catQuestions[idx])
        catQuestions.splice(idx, 1)
      }
    }
  }

  if (picked.length < 5) return null

  const usedCategories = [...new Set(picked.map((q) => q.category))].join(', ')
  return {
    content: picked.map((q) => ({
      question: q.question,
      choices: q.choices,
      correct_index: q.correct_index,
    })),
    theme: `Trivia: ${usedCategories}`,
  }
}

function generateWordGroupingContent(date: string, usedKeys: Set<string>): { content: unknown; theme: string } | null {
  const rng = createRng(dateSeed(date, 'word_grouping'))
  const available = WORD_GROUPING_BANK.filter((p) => {
    const key = p.groups
      .map((g) => g.category)
      .sort()
      .join('|')
    return !usedKeys.has(key)
  })
  if (available.length === 0) return null

  const idx = Math.floor(rng() * available.length)
  const puzzle = available[idx]
  return {
    content: puzzle,
    theme: puzzle.groups.map((g) => g.category).join(' / '),
  }
}

function generateChessMateContent(date: string, usedKeys: Set<string>): { content: unknown; theme: string } | null {
  const rng = createRng(dateSeed(date, 'chess_mate'))
  const available = CHESS_BANK.filter((p) => !usedKeys.has(p.fen))
  if (available.length === 0) return null

  const idx = Math.floor(rng() * available.length)
  const puzzle = available[idx]
  return {
    content: puzzle,
    theme: `Mate in ${puzzle.mateIn} (${puzzle.toMove})`,
  }
}

function generateCodenamesContent(date: string, usedKeys: Set<string>): { content: unknown; theme: string } | null {
  const rng = createRng(dateSeed(date, 'codenames_codeword'))
  const available = CODENAMES_BANK.filter((p) => !usedKeys.has(p.clue + ':' + p.correctWords.sort().join(',')))
  if (available.length === 0) return null

  const idx = Math.floor(rng() * available.length)
  const puzzle = available[idx]
  return {
    content: puzzle,
    theme: `Clue: "${puzzle.clue}" (${puzzle.clueNumber} words)`,
  }
}

// Algorithmic ludo puzzle generator — unlimited unique puzzles.
// Generates random board positions + dice sequences, then uses BFS to find the
// optimal number of rolls. Falls back to bank if generation fails.
function generateLudoContent(date: string, usedKeys: Set<string>): { content: unknown; theme: string } | null {
  const rng = createRng(dateSeed(date, 'ludo_puzzle'))

  // Try algorithmic generation first
  for (let attempt = 0; attempt < 20; attempt++) {
    const puzzle = generateRandomLudoPuzzle(rng)
    if (!puzzle) continue
    const key = puzzle.startingPieces.map((t: { zone: string; pos: number }) => `${t.zone}:${t.pos}`).join('|')
    if (usedKeys.has(key)) continue
    return {
      content: puzzle,
      theme: `Optimal: ${puzzle.optimalRolls} rolls (generated)`,
    }
  }

  // Fallback to bank
  const available = LUDO_BANK.filter((p) => {
    const key = p.startingPieces.map((t) => `${t.zone}:${t.pos}`).join('|')
    return !usedKeys.has(key)
  })
  if (available.length === 0) return null
  const idx = Math.floor(rng() * available.length)
  const puzzle = available[idx]
  return {
    content: puzzle,
    theme: `Optimal: ${puzzle.optimalRolls} rolls`,
  }
}

// Simplified BFS solver for ludo puzzles
function solveLudoPuzzle(
  startPieces: Array<{ id: number; zone: string; pos: number }>,
  dice: number[],
  obstacles: Array<{ trackPos: number }>
): number | null {
  const TRACK_SIZE = 52
  const HOME_SIZE = 5
  const obstacleSet = new Set(obstacles.map((o) => o.trackPos))

  type PieceState = { zone: string; pos: number }
  type State = { pieces: PieceState[]; diceIdx: number }

  function stateKey(s: State): string {
    return s.pieces.map((p) => `${p.zone}:${p.pos}`).join('|') + '|' + s.diceIdx
  }

  function movePiece(piece: PieceState, roll: number): PieceState | null {
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

  const initial: State = {
    pieces: startPieces.map((p) => ({ zone: p.zone, pos: p.pos })),
    diceIdx: 0,
  }

  const queue: State[] = [initial]
  const visited = new Set<string>()
  visited.add(stateKey(initial))

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.pieces.every((p) => p.zone === 'finished')) {
      return current.diceIdx
    }
    if (current.diceIdx >= dice.length) continue

    const roll = dice[current.diceIdx]
    let anyValidMove = false

    for (let i = 0; i < 4; i++) {
      const newPiece = movePiece(current.pieces[i], roll)
      if (!newPiece) continue
      anyValidMove = true
      const newPieces = current.pieces.map((p, j) => (j === i ? newPiece : { ...p }))
      const next: State = { pieces: newPieces, diceIdx: current.diceIdx + 1 }
      const key = stateKey(next)
      if (!visited.has(key)) {
        visited.add(key)
        queue.push(next)
      }
    }

    // If no valid move, skip this die roll
    if (!anyValidMove) {
      const skip: State = { pieces: current.pieces.map((p) => ({ ...p })), diceIdx: current.diceIdx + 1 }
      const key = stateKey(skip)
      if (!visited.has(key)) {
        visited.add(key)
        queue.push(skip)
      }
    }
  }

  return null
}

function generateRandomLudoPuzzle(rng: () => number): {
  startingPieces: Array<{ id: number; zone: string; pos: number }>
  diceSequence: number[]
  optimalRolls: number
  obstacles: Array<{ trackPos: number }>
} | null {
  const zones = ['base', 'track', 'home', 'finished'] as const
  const zoneWeights = [0.2, 0.5, 0.25, 0.05]

  function pickZone(): string {
    const r = rng()
    let cum = 0
    for (let i = 0; i < zones.length; i++) {
      cum += zoneWeights[i]
      if (r < cum) return zones[i]
    }
    return 'track'
  }

  const pieces: Array<{ id: number; zone: string; pos: number }> = []
  const usedTrackPositions = new Set<number>()

  for (let id = 0; id < 4; id++) {
    const zone = pickZone()
    let pos = 0
    if (zone === 'track') {
      // Pick a random non-colliding track position
      for (let t = 0; t < 20; t++) {
        pos = Math.floor(rng() * 52)
        if (!usedTrackPositions.has(pos)) break
      }
      usedTrackPositions.add(pos)
    } else if (zone === 'home') {
      pos = Math.floor(rng() * 5)
    }
    pieces.push({ id, zone, pos })
  }

  // At least 1 piece must not be finished
  if (pieces.every((p) => p.zone === 'finished')) {
    pieces[0] = { id: 0, zone: 'track', pos: Math.floor(rng() * 52) }
  }

  // Generate dice sequence (8-14 rolls)
  const diceCount = 8 + Math.floor(rng() * 7)
  const diceSequence: number[] = []
  for (let i = 0; i < diceCount; i++) {
    diceSequence.push(1 + Math.floor(rng() * 6))
  }

  // Ensure at least one 6 if any piece is in base
  if (pieces.some((p) => p.zone === 'base') && !diceSequence.includes(6)) {
    diceSequence[Math.floor(rng() * diceSequence.length)] = 6
  }

  // Optional obstacles (0-2)
  const obstacles: Array<{ trackPos: number }> = []
  const obsCount = Math.floor(rng() * 3)
  for (let i = 0; i < obsCount; i++) {
    let pos: number
    do {
      pos = Math.floor(rng() * 52)
    } while (usedTrackPositions.has(pos) || obstacles.some((o) => o.trackPos === pos))
    obstacles.push({ trackPos: pos })
  }

  // Solve with BFS
  const optimal = solveLudoPuzzle(pieces, diceSequence, obstacles)
  if (optimal === null || optimal < 3 || optimal > 12) return null

  return {
    startingPieces: pieces,
    diceSequence,
    optimalRolls: optimal,
    obstacles,
  }
}

// ---------------------------------------------------------------------------
// Theme spacing — ensure consecutive days don't get the same theme tag
// ---------------------------------------------------------------------------

function enforceThemeSpacing(entries: GeneratedEntry[]): GeneratedEntry[] {
  // Sort by date
  const sorted = [...entries].sort((a, b) => a.challenge_date.localeCompare(b.challenge_date))

  // Group by game_type
  const byGame = new Map<string, GeneratedEntry[]>()
  for (const e of sorted) {
    const list = byGame.get(e.game_type) ?? []
    list.push(e)
    byGame.set(e.game_type, list)
  }

  // For word-based games, check theme tag spacing
  for (const [gameType, gameEntries] of byGame) {
    if (!['crossword', 'mini_crossword', 'word_search', 'word_scramble'].includes(gameType)) continue

    // Extract theme tags
    for (let i = 1; i < gameEntries.length; i++) {
      const prev = gameEntries[i - 1]
      const curr = gameEntries[i]
      const prevTheme = WORD_THEMES.find((t) => t.name === prev.theme)
      const currTheme = WORD_THEMES.find((t) => t.name === curr.theme)
      if (prevTheme && currTheme && prevTheme.tag === currTheme.tag) {
        // Same category tag on consecutive days — try to swap with a later entry
        for (let j = i + 1; j < gameEntries.length; j++) {
          const swapTheme = WORD_THEMES.find((t) => t.name === gameEntries[j].theme)
          if (swapTheme && swapTheme.tag !== prevTheme.tag) {
            // Swap dates
            const tmpDate = gameEntries[i].challenge_date
            gameEntries[i].challenge_date = gameEntries[j].challenge_date
            gameEntries[j].challenge_date = tmpDate
            break
          }
        }
      }
    }
  }

  return sorted
}

// ---------------------------------------------------------------------------
// Main batch generator
// ---------------------------------------------------------------------------

const GAME_LABELS: Record<GameTypeId, string> = {
  crossword: 'Crossword',
  mini_crossword: 'Mini Crossword',
  word_search: 'Word Search',
  word_scramble: 'Word Scramble',
  trivia: 'Trivia',
  word_grouping: 'Word Grouping',
  chess_mate: 'Chess Mate',
  codenames_codeword: 'Codeword',
  ludo_puzzle: 'Ludo Puzzle',
}

function bankSize(gameType: GameTypeId): number {
  switch (gameType) {
    case 'crossword':
    case 'mini_crossword':
    case 'word_search':
    case 'word_scramble':
      return WORD_THEMES.reduce((n, t) => n + t.entries.length, 0)
    case 'trivia':
      return TRIVIA_BANK.length
    case 'word_grouping':
      return WORD_GROUPING_BANK.length
    case 'chess_mate':
      return CHESS_BANK.length
    case 'codenames_codeword':
      return CODENAMES_BANK.length
    case 'ludo_puzzle':
      return 9999 // algorithmic generation — effectively unlimited
  }
}

export function generateBatch(dates: string[], gameTypes: GameTypeId[], existingRows: ExistingRow[]): BatchResult {
  // Build exclusion sets per game type
  const existingByGame = new Map<string, ExistingRow[]>()
  for (const r of existingRows) {
    const list = existingByGame.get(r.game_type) ?? []
    list.push(r)
    existingByGame.set(r.game_type, list)
  }

  // Dates that already have content per game type
  const filledDates = new Map<string, Set<string>>()
  for (const r of existingRows) {
    const dateSet = filledDates.get(r.game_type) ?? new Set()
    dateSet.add(r.challenge_date)
    filledDates.set(r.game_type, dateSet)
  }

  const allUsedWords = extractUsedWords(existingRows)
  const allUsedQuestions = extractUsedQuestions(existingRows)
  const usedGroupingKeys = extractUsedPuzzleKeys(
    existingRows.filter((r) => r.game_type === 'word_grouping'),
    (c) => {
      const obj = (Array.isArray(c) ? c[0] : c) as { groups?: Array<{ category: string }> }
      return (obj.groups ?? [])
        .map((g) => g.category)
        .sort()
        .join('|')
    }
  )
  const usedChessKeys = extractUsedPuzzleKeys(
    existingRows.filter((r) => r.game_type === 'chess_mate'),
    (c) => {
      const obj = (Array.isArray(c) ? c[0] : c) as { fen?: string }
      return obj.fen ?? ''
    }
  )
  const usedCodenamesKeys = extractUsedPuzzleKeys(
    existingRows.filter((r) => r.game_type === 'codenames_codeword'),
    (c) => {
      const obj = (Array.isArray(c) ? c[0] : c) as { clue?: string; correctWords?: string[] }
      return (obj.clue ?? '') + ':' + (obj.correctWords ?? []).sort().join(',')
    }
  )
  const usedLudoKeys = extractUsedPuzzleKeys(
    existingRows.filter((r) => r.game_type === 'ludo_puzzle'),
    (c) => {
      const obj = (Array.isArray(c) ? c[0] : c) as {
        startingPieces?: Array<{ zone: string; pos: number }>
      }
      return (obj.startingPieces ?? []).map((t) => `${t.zone}:${t.pos}`).join('|')
    }
  )

  const results: GeneratedEntry[] = []
  const couldNotFill = new Map<GameTypeId, number>()

  // Track words/questions we add during this batch to avoid intra-batch repeats
  const batchUsedWords = new Set(allUsedWords)
  const batchUsedQuestions = new Set(allUsedQuestions)

  for (const date of dates) {
    for (const gameType of gameTypes) {
      // Skip if content already exists for this date+game
      const filled = filledDates.get(gameType)
      if (filled?.has(date)) continue

      let result: { content: unknown; theme: string } | null = null

      switch (gameType) {
        case 'crossword':
          result = generateCrosswordContent(date, batchUsedWords, false)
          break
        case 'mini_crossword':
          result = generateCrosswordContent(date, batchUsedWords, true)
          break
        case 'word_search':
          result = generateWordSearchContent(date, batchUsedWords)
          break
        case 'word_scramble':
          result = generateWordScrambleContent(date, batchUsedWords)
          break
        case 'trivia':
          result = generateTriviaContent(date, batchUsedQuestions)
          break
        case 'word_grouping':
          result = generateWordGroupingContent(date, usedGroupingKeys)
          break
        case 'chess_mate':
          result = generateChessMateContent(date, usedChessKeys)
          break
        case 'codenames_codeword':
          result = generateCodenamesContent(date, usedCodenamesKeys)
          break
        case 'ludo_puzzle':
          result = generateLudoContent(date, usedLudoKeys)
          break
      }

      if (!result) {
        couldNotFill.set(gameType, (couldNotFill.get(gameType) ?? 0) + 1)
        continue
      }

      // Track what we just generated to prevent intra-batch duplicates
      const content = result.content
      if (Array.isArray(content)) {
        for (const item of content) {
          if (typeof item === 'string') batchUsedWords.add(item.toUpperCase())
          else if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>
            if (typeof obj.answer === 'string') batchUsedWords.add(obj.answer.toUpperCase())
            if (typeof obj.word === 'string') batchUsedWords.add(obj.word.toUpperCase())
            if (typeof obj.question === 'string') batchUsedQuestions.add(obj.question.toLowerCase().trim())
          }
        }
      }
      if (gameType === 'word_grouping') {
        const obj = (Array.isArray(content) ? content[0] : content) as {
          groups?: Array<{ category: string }>
        }
        usedGroupingKeys.add(
          (obj.groups ?? [])
            .map((g) => g.category)
            .sort()
            .join('|')
        )
      }
      if (gameType === 'chess_mate') {
        const obj = (Array.isArray(content) ? content[0] : content) as { fen?: string }
        usedChessKeys.add(obj.fen ?? '')
      }
      if (gameType === 'codenames_codeword') {
        const obj = (Array.isArray(content) ? content[0] : content) as {
          clue?: string
          correctWords?: string[]
        }
        usedCodenamesKeys.add((obj.clue ?? '') + ':' + (obj.correctWords ?? []).sort().join(','))
      }
      if (gameType === 'ludo_puzzle') {
        const obj = (Array.isArray(content) ? content[0] : content) as {
          startingPieces?: Array<{ zone: string; pos: number }>
        }
        usedLudoKeys.add((obj.startingPieces ?? []).map((t) => `${t.zone}:${t.pos}`).join('|'))
      }

      results.push({
        game_type: gameType,
        challenge_date: date,
        content: result.content,
        theme: result.theme,
      })
    }
  }

  // Build capacity report
  const generatedCounts = new Map<GameTypeId, number>()
  for (const r of results) {
    generatedCounts.set(r.game_type, (generatedCounts.get(r.game_type) ?? 0) + 1)
  }

  const usedCounts: Record<GameTypeId, number> = {
    crossword: filledDates.get('crossword')?.size ?? 0,
    mini_crossword: filledDates.get('mini_crossword')?.size ?? 0,
    word_search: filledDates.get('word_search')?.size ?? 0,
    word_scramble: filledDates.get('word_scramble')?.size ?? 0,
    trivia: filledDates.get('trivia')?.size ?? 0,
    word_grouping: filledDates.get('word_grouping')?.size ?? 0,
    chess_mate: filledDates.get('chess_mate')?.size ?? 0,
    codenames_codeword: filledDates.get('codenames_codeword')?.size ?? 0,
    ludo_puzzle: filledDates.get('ludo_puzzle')?.size ?? 0,
  }

  const capacity: BankCapacity[] = gameTypes.map((gt) => {
    const total = bankSize(gt)
    const used = usedCounts[gt]
    const remaining = Math.max(0, total - used)
    const gen = generatedCounts.get(gt) ?? 0
    const remainingAfter = Math.max(0, remaining - gen)
    const missed = couldNotFill.get(gt) ?? 0
    return {
      game_type: gt,
      label: GAME_LABELS[gt],
      totalInBank: total,
      alreadyUsed: used,
      remaining,
      generatedThisBatch: gen,
      remainingAfterBatch: remainingAfter,
      exhausted: remainingAfter === 0 && missed > 0,
      daysCouldNotFill: missed,
    }
  })

  return { generated: enforceThemeSpacing(results), capacity }
}

export function getBankStats() {
  const triviaCategories = new Map<string, number>()
  for (const q of TRIVIA_BANK) {
    triviaCategories.set(q.category, (triviaCategories.get(q.category) ?? 0) + 1)
  }

  return {
    wordThemes: WORD_THEMES.length,
    totalWords: WORD_THEMES.reduce((n, t) => n + t.entries.length, 0),
    triviaQuestions: TRIVIA_BANK.length,
    triviaCategories: Object.fromEntries(triviaCategories),
    wordGroupingPuzzles: WORD_GROUPING_BANK.length,
    chessPuzzles: CHESS_BANK.length,
    codenamesPuzzles: CODENAMES_BANK.length,
    ludoPuzzles: LUDO_BANK.length,
  }
}
