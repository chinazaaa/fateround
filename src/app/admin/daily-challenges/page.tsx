'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

const GAME_TYPES: { id: GameTypeId; label: string; hint: string }[] = [
  { id: 'crossword', label: 'Crossword', hint: 'ANSWER,clue — one per line. Min 4 entries, max 13 letters per word.' },
  {
    id: 'mini_crossword',
    label: 'Mini Crossword',
    hint: 'ANSWER,clue — one per line. Min 4 entries, max 7 letters per word.',
  },
  { id: 'word_search', label: 'Word Search', hint: 'One word per line. Min 4 words, 3+ letters each.' },
  { id: 'word_scramble', label: 'Word Scramble', hint: 'word,clue — one per line. Min 3 entries, 3+ letters each.' },
  {
    id: 'trivia',
    label: 'Trivia',
    hint: 'question | optA | optB | optC | optD | correct index (0-3). Min 5 questions, 2-4 choices.',
  },
  {
    id: 'word_grouping',
    label: 'Word Grouping',
    hint: 'JSON. Exactly 4 groups, exactly 4 words each, difficulty 1-4 per group.',
  },
  {
    id: 'chess_mate',
    label: 'Chess Mate',
    hint: 'JSON. Required: fen, mateIn (2 or 3), toMove (white/black), lines (array of move arrays).',
  },
  {
    id: 'codenames_codeword',
    label: 'Codeword',
    hint: 'JSON. Required: grid (exactly 25 words), clue, clueNumber, correctWords (must be in grid, count = clueNumber).',
  },
  {
    id: 'ludo_puzzle',
    label: 'Ludo Puzzle',
    hint: 'JSON. Required: startingPieces (4 tokens with id/zone/pos), diceSequence (1-6[]), optimalRolls. Optional: obstacles [{trackPos}].',
  },
]

const ALL_GAME_IDS = GAME_TYPES.map((g) => g.id)

type ContentRow = {
  id: string
  game_type: GameTypeId
  challenge_date: string
  content: unknown
  created_at: string
  updated_at: string
}

type GeneratedEntry = {
  game_type: GameTypeId
  challenge_date: string
  content: unknown
  theme: string
}

type BankCapacity = {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

const JSON_GAME_TYPES: GameTypeId[] = ['word_grouping', 'chess_mate', 'codenames_codeword', 'ludo_puzzle']

function contentToText(gameType: GameTypeId, content: unknown): string {
  if (JSON_GAME_TYPES.includes(gameType)) {
    return JSON.stringify(content, null, 2)
  }
  if (!Array.isArray(content)) return ''
  if (gameType === 'word_search') {
    return (content as string[]).join('\n')
  }
  if (gameType === 'trivia') {
    return (content as { question: string; choices: string[]; correct_index: number }[])
      .map((e) => `${e.question} | ${e.choices.join(' | ')} | ${e.correct_index}`)
      .join('\n')
  }
  return (content as { answer?: string; word?: string; clue?: string }[])
    .map((e) => {
      const w = e.answer ?? e.word ?? ''
      return e.clue ? `${w},${e.clue}` : w
    })
    .join('\n')
}

function textToContent(gameType: GameTypeId, text: string): unknown {
  if (JSON_GAME_TYPES.includes(gameType)) {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (gameType === 'word_search') {
    return lines.map((l) => l.toUpperCase().replace(/[^A-Z]/g, '')).filter((w) => w.length >= 3)
  }
  if (gameType === 'trivia') {
    return lines
      .map((l) => {
        const parts = l.split('|').map((p) => p.trim())
        if (parts.length < 4) return null
        const question = parts[0]
        const lastPart = parts[parts.length - 1]
        const correctIndex = parseInt(lastPart, 10)
        const hasIndex = !isNaN(correctIndex) && correctIndex >= 0 && correctIndex <= 3
        const choices = hasIndex ? parts.slice(1, -1) : parts.slice(1)
        if (choices.length < 2 || choices.length > 4) return null
        return { question, choices, correct_index: hasIndex ? correctIndex : 0 }
      })
      .filter(Boolean)
  }
  if (gameType === 'crossword' || gameType === 'mini_crossword') {
    return lines
      .map((l) => {
        const idx = l.indexOf(',')
        const answer = (idx >= 0 ? l.slice(0, idx) : l).toUpperCase().replace(/[^A-Z]/g, '')
        const clue = idx >= 0 ? l.slice(idx + 1).trim() : ''
        return { answer, clue }
      })
      .filter((e) => e.answer.length >= 3)
  }
  return lines
    .map((l) => {
      const idx = l.indexOf(',')
      const word = (idx >= 0 ? l.slice(0, idx) : l).toUpperCase().replace(/[^A-Z]/g, '')
      const clue = idx >= 0 ? l.slice(idx + 1).trim() : ''
      return { word, clue }
    })
    .filter((e) => e.word.length >= 3)
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function entryCount(gameType: GameTypeId, content: unknown): number {
  if (JSON_GAME_TYPES.includes(gameType)) {
    if (Array.isArray(content)) return content.length
    if (content != null && typeof content === 'object') return 1
    return 0
  }
  if (Array.isArray(content)) return content.length
  return 0
}

/** Validate parsed content and return an error string or null if valid. */
function validateContent(gameType: GameTypeId, content: unknown): string | null {
  if (content == null) return 'Could not parse content'

  switch (gameType) {
    case 'crossword': {
      if (!Array.isArray(content)) return 'Expected a list of entries'
      if (content.length < 4) return `Need at least 4 entries (got ${content.length})`
      const tooLong = (content as { answer: string }[]).filter((e) => e.answer.length > 13)
      if (tooLong.length > 0)
        return `${tooLong.length} word(s) exceed 13 letters: ${tooLong.map((e) => e.answer).join(', ')}`
      return null
    }
    case 'mini_crossword': {
      if (!Array.isArray(content)) return 'Expected a list of entries'
      if (content.length < 4) return `Need at least 4 entries (got ${content.length})`
      const tooLong = (content as { answer: string }[]).filter((e) => e.answer.length > 7)
      if (tooLong.length > 0)
        return `${tooLong.length} word(s) exceed 7 letters: ${tooLong.map((e) => e.answer).join(', ')}`
      return null
    }
    case 'word_search': {
      if (!Array.isArray(content)) return 'Expected a list of words'
      if (content.length < 4) return `Need at least 4 words (got ${content.length})`
      return null
    }
    case 'word_scramble': {
      if (!Array.isArray(content)) return 'Expected a list of entries'
      if (content.length < 3) return `Need at least 3 entries (got ${content.length})`
      return null
    }
    case 'trivia': {
      if (!Array.isArray(content)) return 'Expected a list of questions'
      if (content.length < 5) return `Need at least 5 questions (got ${content.length})`
      for (let i = 0; i < content.length; i++) {
        const q = content[i] as { question?: string; choices?: string[]; correct_index?: number }
        if (!q.question) return `Question ${i + 1} is missing the question text`
        if (!q.choices || q.choices.length < 2) return `Question ${i + 1} needs at least 2 choices`
      }
      return null
    }
    case 'word_grouping': {
      const items = Array.isArray(content) ? content : [content]
      if (items.length === 0) return 'Add at least one puzzle'
      for (let p = 0; p < items.length; p++) {
        const prefix = items.length > 1 ? `Puzzle ${p + 1}: ` : ''
        const item = items[p]
        if (typeof item !== 'object' || item === null) return `${prefix}Invalid JSON`
        const obj = item as { groups?: unknown[] }
        if (!Array.isArray(obj.groups)) return `${prefix}Missing "groups" array`
        if (obj.groups.length !== 4) return `${prefix}Need exactly 4 groups (got ${obj.groups.length})`
        for (let i = 0; i < obj.groups.length; i++) {
          const g = obj.groups[i] as { category?: string; words?: string[]; difficulty?: number }
          if (!g.category) return `${prefix}Group ${i + 1} is missing "category"`
          if (!Array.isArray(g.words) || g.words.length !== 4)
            return `${prefix}Group ${i + 1} needs exactly 4 words (got ${g.words?.length ?? 0})`
          if (typeof g.difficulty !== 'number' || g.difficulty < 1 || g.difficulty > 4)
            return `${prefix}Group ${i + 1} "difficulty" must be 1-4`
        }
        const allWords = (obj.groups as { words: string[] }[]).flatMap((g) => g.words)
        if (new Set(allWords).size !== 16) return `${prefix}All 16 words must be unique`
      }
      return null
    }
    case 'chess_mate': {
      const items = Array.isArray(content) ? content : [content]
      if (items.length === 0) return 'Add at least one puzzle'
      for (let p = 0; p < items.length; p++) {
        const prefix = items.length > 1 ? `Puzzle ${p + 1}: ` : ''
        const item = items[p]
        if (typeof item !== 'object' || item === null) return `${prefix}Invalid JSON`
        const obj = item as { fen?: string; mateIn?: number; toMove?: string; lines?: string[][] }
        if (!obj.fen) return `${prefix}Missing "fen"`
        if (![2, 3].includes(obj.mateIn ?? 0)) return `${prefix}"mateIn" must be 2 or 3`
        if (!['white', 'black'].includes(obj.toMove ?? '')) return `${prefix}"toMove" must be "white" or "black"`
        if (!Array.isArray(obj.lines) || obj.lines.length === 0)
          return `${prefix}Missing "lines" (solution move arrays)`
        const expectedMoves = (obj.mateIn ?? 2) * 2 - 1
        for (let i = 0; i < obj.lines.length; i++) {
          if (!Array.isArray(obj.lines[i]) || obj.lines[i].length === 0)
            return `${prefix}Line ${i + 1} must be a non-empty array of moves`
          if (obj.lines[i].length !== expectedMoves)
            return `${prefix}Line ${i + 1} has ${obj.lines[i].length} moves but mate-in-${obj.mateIn} needs ${expectedMoves}`
        }
      }
      return null
    }
    case 'codenames_codeword': {
      const items = Array.isArray(content) ? content : [content]
      if (items.length === 0) return 'Add at least one puzzle'
      for (let p = 0; p < items.length; p++) {
        const prefix = items.length > 1 ? `Puzzle ${p + 1}: ` : ''
        const item = items[p]
        if (typeof item !== 'object' || item === null) return `${prefix}Invalid JSON`
        const obj = item as { grid?: string[]; clue?: string; clueNumber?: number; correctWords?: string[] }
        if (!Array.isArray(obj.grid) || obj.grid.length !== 25)
          return `${prefix}"grid" must have exactly 25 words (got ${obj.grid?.length ?? 0})`
        if (!obj.clue) return `${prefix}Missing "clue"`
        if (typeof obj.clueNumber !== 'number' || obj.clueNumber < 1)
          return `${prefix}"clueNumber" must be a positive number`
        if (!Array.isArray(obj.correctWords) || obj.correctWords.length === 0) return `${prefix}Missing "correctWords"`
        if (obj.correctWords.length !== obj.clueNumber)
          return `${prefix}"correctWords" count (${obj.correctWords.length}) must match "clueNumber" (${obj.clueNumber})`
        const gridSet = new Set(obj.grid.map((w) => w.toUpperCase()))
        const missing = obj.correctWords.filter((w) => !gridSet.has(w.toUpperCase()))
        if (missing.length > 0) return `${prefix}correctWords not in grid: ${missing.join(', ')}`
      }
      return null
    }
    case 'ludo_puzzle': {
      const items = Array.isArray(content) ? content : [content]
      if (items.length === 0) return 'Add at least one puzzle'
      for (let p = 0; p < items.length; p++) {
        const prefix = items.length > 1 ? `Puzzle ${p + 1}: ` : ''
        const item = items[p]
        if (typeof item !== 'object' || item === null) return `${prefix}Invalid JSON`
        const obj = item as {
          startingPieces?: Array<{ id?: number; zone?: string; pos?: number }>
          diceSequence?: number[]
          optimalRolls?: number
          obstacles?: Array<{ trackPos?: number }>
        }
        if (!Array.isArray(obj.startingPieces) || obj.startingPieces.length !== 4)
          return `${prefix}"startingPieces" must have exactly 4 tokens (got ${obj.startingPieces?.length ?? 0})`
        for (let i = 0; i < obj.startingPieces.length; i++) {
          const t = obj.startingPieces[i]
          if (typeof t.id !== 'number') return `${prefix}Token ${i + 1} missing "id"`
          if (!['base', 'track', 'home', 'finished'].includes(t.zone ?? ''))
            return `${prefix}Token ${i + 1} "zone" must be base/track/home/finished`
          if (typeof t.pos !== 'number') return `${prefix}Token ${i + 1} missing "pos"`
          if (t.zone === 'track' && (t.pos < 0 || t.pos >= 52))
            return `${prefix}Token ${i + 1} track pos must be 0-51 (got ${t.pos})`
          if (t.zone === 'home' && (t.pos < 0 || t.pos >= 5))
            return `${prefix}Token ${i + 1} home pos must be 0-4 (got ${t.pos})`
        }
        const ids = obj.startingPieces.map((t) => t.id).sort()
        if (ids.join(',') !== '0,1,2,3') return `${prefix}Piece IDs must be exactly 0, 1, 2, 3`
        if (!Array.isArray(obj.diceSequence) || obj.diceSequence.length === 0)
          return `${prefix}Missing "diceSequence" (non-empty number array)`
        if (obj.diceSequence.some((d) => typeof d !== 'number' || d < 1 || d > 6))
          return `${prefix}"diceSequence" values must be 1-6`
        if (typeof obj.optimalRolls !== 'number' || obj.optimalRolls < 1)
          return `${prefix}"optimalRolls" must be a positive number`
        if (obj.obstacles !== undefined) {
          if (!Array.isArray(obj.obstacles)) return `${prefix}"obstacles" must be an array`
          for (let i = 0; i < obj.obstacles.length; i++) {
            if (typeof obj.obstacles[i].trackPos !== 'number') return `${prefix}Obstacle ${i + 1} missing "trackPos"`
          }
        }
      }
      return null
    }
    default:
      return null
  }
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function getMonthRange(yearMonth: string): { from: string; to: string } {
  const d = new Date(`${yearMonth}-01T00:00:00`)
  const from = toIso(d)
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return { from, to: toIso(d) }
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(toIso(d))
  }
  return dates
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Tab = 'manual' | 'batch'

export default function AdminDailyPage() {
  const { confirm } = useConfirm()
  const { success, error: toastError } = useToast()
  const [tab, setTab] = useState<Tab>('batch')
  const [gameType, setGameType] = useState<GameTypeId>('crossword')
  const [items, setItems] = useState<ContentRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = toIso(new Date())
  const monthStart = today.slice(0, 8) + '01'
  const monthEnd = (() => {
    const d = new Date(`${monthStart}T00:00:00`)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    return toIso(d)
  })()
  const [filterFrom, setFilterFrom] = useState(monthStart)
  const [filterTo, setFilterTo] = useState(monthEnd)
  const [manualPage, setManualPage] = useState(0)
  const MANUAL_PAGE_SIZE = 20

  // Create form
  const [createDate, setCreateDate] = useState(today)
  const [createText, setCreateText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // ---------- Batch state ----------
  const nextMonth = (() => {
    const d = new Date(`${today}T00:00:00`)
    d.setMonth(d.getMonth() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const thisMonth = today.slice(0, 7)
  const [batchMonth, setBatchMonth] = useState(nextMonth)
  const batchRange = useMemo(() => getMonthRange(batchMonth), [batchMonth])
  const batchDates = useMemo(() => getDatesInRange(batchRange.from, batchRange.to), [batchRange])
  const [batchExisting, setBatchExisting] = useState<ContentRow[]>([])
  const [batchGenerated, setBatchGenerated] = useState<GeneratedEntry[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchStats, setBatchStats] = useState<Record<string, unknown> | null>(null)
  const [batchCapacity, setBatchCapacity] = useState<BankCapacity[]>([])
  const [batchRemoved, setBatchRemoved] = useState<Set<string>>(new Set())
  const [batchExpandedGame, setBatchExpandedGame] = useState<GameTypeId | null>(null)
  const [batchPreviewKey, setBatchPreviewKey] = useState<string | null>(null)

  // ---------- Manual tab data load ----------
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ game_type: gameType })
      if (filterFrom) qs.set('from', filterFrom)
      if (filterTo) qs.set('to', filterTo)
      const res = await fetch(`/api/admin/daily-challenges-content?${qs}`)
      const json = await res.json()
      setItems(res.ok ? (json.items ?? []) : [])
    } finally {
      setLoading(false)
    }
    setManualPage(0)
  }, [gameType, filterFrom, filterTo])

  useEffect(() => {
    if (tab === 'manual') void load()
  }, [load, tab])

  // ---------- Batch tab data load ----------
  const loadBatchExisting = useCallback(async () => {
    setBatchLoading(true)
    try {
      const qs = new URLSearchParams({ from: batchRange.from, to: batchRange.to })
      const res = await fetch(`/api/admin/daily-challenges-content?${qs}`)
      const json = await res.json()
      setBatchExisting(res.ok ? (json.items ?? []) : [])
    } finally {
      setBatchLoading(false)
    }
  }, [batchRange])

  useEffect(() => {
    if (tab === 'batch') void loadBatchExisting()
  }, [loadBatchExisting, tab])

  // Check if selected create date already has content
  const dateHasContent = items.some((i) => i.challenge_date === createDate)

  // ---- Create ----
  const handleCreate = async () => {
    const content = textToContent(gameType, createText)
    if (content == null || (Array.isArray(content) && content.length === 0)) {
      setSaveMsg({ ok: false, text: 'Add at least one entry' })
      return
    }
    const validationError = validateContent(gameType, content)
    if (validationError) {
      setSaveMsg({ ok: false, text: validationError })
      return
    }

    setSaving(true)
    setSaveMsg(null)

    try {
      const res = await fetch('/api/admin/daily-challenges-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: gameType, challenge_date: createDate, content }),
      })

      if (res.ok) {
        setSaveMsg({ ok: true, text: `Saved for ${dayLabel(createDate)}` })
        setCreateText('')
        setCreateDate(addDays(createDate, 1))
        void load()
      } else if (res.status === 409) {
        setSaveMsg({ ok: false, text: 'Content already exists for that date — edit it below or pick another date' })
      } else {
        const json = await res.json().catch(() => ({}))
        setSaveMsg({ ok: false, text: (json as { error?: string }).error ?? 'Failed to save' })
      }
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  // ---- Update ----
  const [editError, setEditError] = useState<string | null>(null)
  const handleUpdate = async (item: ContentRow) => {
    const content = textToContent(item.game_type, editText)
    if (content == null || (Array.isArray(content) && content.length === 0)) {
      setEditError('Add at least one entry')
      return
    }
    const validationError = validateContent(item.game_type, content)
    if (validationError) {
      setEditError(validationError)
      return
    }

    setEditError(null)
    setEditSaving(true)
    const res = await fetch(`/api/admin/daily-challenges-content/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    setEditSaving(false)
    if (res.ok) {
      setEditId(null)
      void load()
    }
  }

  // ---- Delete ----
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this daily content?',
      message: 'The puzzle will fall back to the built-in bank for this date.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`/api/admin/daily-challenges-content/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toastError(`Delete failed: ${(json as { error?: string }).error ?? res.statusText}`)
      return
    }
    success('Content deleted')
    void load()
  }

  // ---- Batch generate ----
  const handleBatchGenerate = async () => {
    setBatchGenerating(true)
    setBatchGenerated([])
    setBatchCapacity([])
    setBatchRemoved(new Set())
    try {
      const res = await fetch('/api/admin/daily-challenges-content/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: batchRange.from,
          to: batchRange.to,
          game_types: ALL_GAME_IDS,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setBatchGenerated(json.generated ?? [])
        setBatchCapacity(json.capacity ?? [])
        setBatchStats(json.stats ?? null)
        // Auto-expand first game type that has generated content
        if ((json.generated ?? []).length > 0) {
          const firstGame = (json.generated as GeneratedEntry[])[0]?.game_type
          if (firstGame) setBatchExpandedGame(firstGame)
        }
        if ((json.generated ?? []).length === 0) {
          toastError('All dates already have content — nothing to generate')
        } else {
          const exhaustedGames = (json.capacity ?? []).filter((c: BankCapacity) => c.daysCouldNotFill > 0)
          const msg =
            exhaustedGames.length > 0
              ? `Generated ${json.generated.length} entries. ${exhaustedGames.length} game(s) ran out of content — see warnings below.`
              : `Generated ${json.generated.length} entries (${json.skippedDates} already filled)`
          if (exhaustedGames.length > 0) toastError(msg)
          else success(msg)
        }
      } else {
        toastError((json as { error?: string }).error ?? 'Generation failed')
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBatchGenerating(false)
    }
  }

  // ---- Batch save ----
  const handleBatchSave = async () => {
    const toSave = batchGenerated.filter((e) => {
      const key = `${e.game_type}:${e.challenge_date}`
      return !batchRemoved.has(key)
    })
    if (toSave.length === 0) {
      toastError('No entries to save — generate first or un-remove entries')
      return
    }

    const ok = await confirm({
      title: `Save ${toSave.length} entries?`,
      message: `This will save generated content for ${monthLabel(batchRange.from)} across all game types. Existing content for those dates will NOT be overwritten.`,
      confirmLabel: `Save ${toSave.length} entries`,
    })
    if (!ok) return

    setBatchSaving(true)
    try {
      const res = await fetch('/api/admin/daily-challenges-content/batch-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: toSave.map((e) => ({
            game_type: e.game_type,
            challenge_date: e.challenge_date,
            content: e.content,
          })),
        }),
      })
      const json = await res.json()
      if (res.ok) {
        success(`Saved ${json.saved} entries`)
        setBatchGenerated([])
        setBatchRemoved(new Set())
        void loadBatchExisting()
      } else {
        toastError((json as { error?: string }).error ?? 'Save failed')
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBatchSaving(false)
    }
  }

  const toggleBatchRemove = (gameType: GameTypeId, date: string) => {
    const key = `${gameType}:${date}`
    setBatchRemoved((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ---- Batch calendar helpers ----
  const existingByGameDate = useMemo(() => {
    const map = new Map<string, ContentRow>()
    for (const row of batchExisting) {
      map.set(`${row.game_type}:${row.challenge_date}`, row)
    }
    return map
  }, [batchExisting])

  const generatedByGameDate = useMemo(() => {
    const map = new Map<string, GeneratedEntry>()
    for (const entry of batchGenerated) {
      map.set(`${entry.game_type}:${entry.challenge_date}`, entry)
    }
    return map
  }, [batchGenerated])

  // Summary: per game type, how many dates are filled / generated / empty
  const batchSummary = useMemo(() => {
    return ALL_GAME_IDS.map((gt) => {
      let filled = 0
      let generated = 0
      let empty = 0
      for (const date of batchDates) {
        const key = `${gt}:${date}`
        if (existingByGameDate.has(key)) filled++
        else if (generatedByGameDate.has(key) && !batchRemoved.has(key)) generated++
        else empty++
      }
      return { gameType: gt, label: GAME_TYPES.find((g) => g.id === gt)!.label, filled, generated, empty }
    })
  }, [batchDates, existingByGameDate, generatedByGameDate, batchRemoved])

  const totalGenerated = batchGenerated.filter((e) => !batchRemoved.has(`${e.game_type}:${e.challenge_date}`)).length

  const meta = GAME_TYPES.find((g) => g.id === gameType)!

  // Available months for batch picker
  const monthOptions = useMemo(() => {
    const options: string[] = []
    const d = new Date(`${today}T00:00:00`)
    // Current month and next 3 months
    for (let i = 0; i < 4; i++) {
      const m = new Date(d)
      m.setMonth(m.getMonth() + i)
      options.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
    }
    return options
  }, [today])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight">Daily challenge content</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Pre-populate word banks for daily puzzles. If no content exists for a date the system falls back to the
          built-in banks. Sudoku and Word Hunt are fully algorithmic — no content needed.
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => setTab('batch')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'batch'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          Batch generate
        </button>
        <button
          type="button"
          onClick={() => setTab('manual')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'manual'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          Manual entry
        </button>
      </div>

      {/* ================================================================= */}
      {/* BATCH TAB                                                         */}
      {/* ================================================================= */}
      {tab === 'batch' && (
        <div className="space-y-6">
          {/* Month picker + generate button */}
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-base font-bold">Generate a month of content</h2>
            <p className="text-sm text-[var(--muted)]">
              Pick a month, click Generate, review the results, then Save All. Already-filled dates are skipped
              automatically — your existing content is never overwritten.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="block">
                <span className="label-caps">Month</span>
                <select
                  value={batchMonth}
                  onChange={(e) => {
                    setBatchMonth(e.target.value)
                    setBatchGenerated([])
                    setBatchRemoved(new Set())
                  }}
                  className="input-field mt-1 block"
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                      {m === thisMonth ? ' (current)' : m === nextMonth ? ' (next)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleBatchGenerate}
                disabled={batchGenerating || batchLoading}
                className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
              >
                {batchGenerating ? 'Generating…' : `Generate ${monthLabel(batchMonth)}`}
              </button>
              {batchGenerated.length > 0 && (
                <button
                  type="button"
                  onClick={handleBatchSave}
                  disabled={batchSaving || totalGenerated === 0}
                  className="btn-primary px-5 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  {batchSaving ? 'Saving…' : `Save ${totalGenerated} entries`}
                </button>
              )}
            </div>

            {/* Capacity warnings */}
            {batchCapacity.length > 0 && (
              <div className="space-y-2">
                {batchCapacity
                  .filter((c) => c.daysCouldNotFill > 0 || (c.remainingAfterBatch <= 30 && c.totalInBank < 9999))
                  .map((c) => (
                    <div
                      key={c.game_type}
                      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                        c.daysCouldNotFill > 0
                          ? 'bg-red-500/10 text-red-400'
                          : c.remainingAfterBatch <= 10
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-amber-500/5 text-amber-300'
                      }`}
                    >
                      <span className="shrink-0 mt-0.5">{c.daysCouldNotFill > 0 ? '!!' : '!'}</span>
                      <div>
                        <span className="font-semibold">{c.label}</span>
                        {c.daysCouldNotFill > 0 ? (
                          <span>
                            {' '}
                            — bank exhausted! Could not fill {c.daysCouldNotFill} day(s). {c.totalInBank} total in bank,{' '}
                            {c.alreadyUsed} already used.
                          </span>
                        ) : (
                          <span>
                            {' '}
                            — running low: {c.remainingAfterBatch} puzzles left after this batch ({c.totalInBank} total,{' '}
                            {c.alreadyUsed} used, {c.generatedThisBatch} in this batch)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                {batchCapacity.every((c) => c.daysCouldNotFill === 0 && c.remainingAfterBatch > 30) && (
                  <p className="text-xs text-green-500">
                    All banks have 30+ days of content remaining after this batch.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Summary grid */}
          {batchLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading existing content…</p>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
                {monthLabel(batchMonth)} — {batchDates.length} days
              </h3>
              {batchGenerated.length > 0 && (
                <p className="text-xs text-blue-400">
                  Click a game type below to expand and review generated content. Remove any entries you don&apos;t want
                  before saving.
                </p>
              )}
              <div className="grid gap-2">
                {batchSummary.map((s) => {
                  const total = batchDates.length
                  const pctFilled = Math.round((s.filled / total) * 100)
                  const pctGen = Math.round((s.generated / total) * 100)
                  const isExpanded = batchExpandedGame === s.gameType
                  return (
                    <div key={s.gameType} className="glass-card p-3">
                      <button
                        type="button"
                        onClick={() => setBatchExpandedGame(isExpanded ? null : s.gameType)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{s.label}</span>
                          <div className="flex items-center gap-3 text-xs">
                            {s.filled > 0 && <span className="text-green-500">{s.filled} filled</span>}
                            {s.generated > 0 && <span className="text-blue-400">{s.generated} generated</span>}
                            {s.empty > 0 && <span className="text-[var(--muted)]">{s.empty} empty</span>}
                            <span className="text-[var(--muted)]">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                          <div className="h-full flex">
                            {pctFilled > 0 && (
                              <div className="h-full bg-green-500" style={{ width: `${pctFilled}%` }} />
                            )}
                            {pctGen > 0 && <div className="h-full bg-blue-400" style={{ width: `${pctGen}%` }} />}
                          </div>
                        </div>
                      </button>

                      {/* Expanded: show per-date detail */}
                      {isExpanded && (
                        <div className="mt-3 space-y-1 max-h-96 overflow-y-auto">
                          {batchDates.map((date) => {
                            const key = `${s.gameType}:${date}`
                            const existing = existingByGameDate.get(key)
                            const generated = generatedByGameDate.get(key)
                            const removed = batchRemoved.has(key)
                            const dayD = new Date(`${date}T00:00:00`)
                            const dayStr = dayD.toLocaleDateString('en-GB', {
                              weekday: 'short',
                              day: 'numeric',
                            })
                            const isPreviewing = batchPreviewKey === key
                            const previewContent = isPreviewing ? (existing ?? generated) : null
                            return (
                              <div key={date}>
                                <div
                                  className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 ${
                                    existing ? 'bg-green-500/10' : generated && !removed ? 'bg-blue-400/10' : ''
                                  }`}
                                  onClick={() => setBatchPreviewKey(isPreviewing ? null : key)}
                                >
                                  <span className="font-mono w-16 shrink-0">{dayStr}</span>
                                  {existing ? (
                                    <span className="text-green-500 flex-1">
                                      Filled — {entryCount(s.gameType, existing.content)} entries
                                    </span>
                                  ) : generated ? (
                                    <>
                                      <span
                                        className={`flex-1 ${removed ? 'line-through text-[var(--muted)]' : 'text-blue-400'}`}
                                      >
                                        {generated.theme} — {entryCount(s.gameType, generated.content)} entries
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          toggleBatchRemove(s.gameType, date)
                                        }}
                                        className={`text-xs px-2 py-0.5 rounded ${
                                          removed
                                            ? 'text-blue-400 hover:bg-blue-400/10'
                                            : 'text-red-400 hover:bg-red-400/10'
                                        }`}
                                      >
                                        {removed ? 'Restore' : 'Remove'}
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[var(--muted)] flex-1">Empty</span>
                                  )}
                                </div>
                                {previewContent && (
                                  <pre className="mx-2 mt-1 mb-2 max-h-48 overflow-auto rounded bg-[var(--card)] p-2 text-xs font-mono">
                                    {contentToText(s.gameType, previewContent.content)}
                                  </pre>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-4 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-green-500" /> Existing (won&apos;t be touched)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-blue-400" /> Generated (review before saving)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-[var(--border)]" /> Empty
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MANUAL TAB                                                        */}
      {/* ================================================================= */}
      {tab === 'manual' && (
        <>
          {/* Game type tabs */}
          <div className="flex flex-wrap gap-2">
            {GAME_TYPES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGameType(g.id)
                  setEditId(null)
                }}
                className={`chip ${gameType === g.id ? 'chip-active' : ''}`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Create form */}
          <div className="glass-card space-y-4 p-5">
            <h2 className="text-base font-bold">Add content</h2>

            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="label-caps">Date</span>
                <input
                  type="date"
                  value={createDate}
                  min={today}
                  onChange={(e) => {
                    setCreateDate(e.target.value)
                    setSaveMsg(null)
                  }}
                  className="input-field mt-1 block"
                />
              </label>
              <span className="pb-2 text-sm font-medium">{dayLabel(createDate)}</span>
              {dateHasContent && (
                <span className="pb-2 text-xs text-amber-400">Content already exists — edit it below</span>
              )}
            </div>

            <div>
              <label className="label-caps" htmlFor="create-text">
                {meta.label} entries
              </label>
              <p className="mb-1 text-xs text-[var(--muted)]">{meta.hint}</p>
              <textarea
                id="create-text"
                value={createText}
                onChange={(e) => setCreateText(e.target.value)}
                rows={10}
                className="input-field mt-1 block w-full font-mono text-sm"
                placeholder={
                  gameType === 'crossword' || gameType === 'mini_crossword'
                    ? 'PLANET,Earth is one\nRIVER,Flowing body of water\nCASTLE,Fortified royal home'
                    : gameType === 'word_search'
                      ? 'PLANET\nRIVER\nISLAND\nDESERT\nCASTLE'
                      : gameType === 'trivia'
                        ? 'What is the capital of France? | London | Paris | Berlin | Madrid | 1\nWhat colour is the sky? | Green | Blue | Red | Yellow | 1'
                        : gameType === 'word_grouping'
                          ? '{\n  "groups": [\n    {"category": "Fruits", "words": ["APPLE", "MANGO", "GRAPE", "PEACH"], "difficulty": 1},\n    {"category": "Colours", "words": ["RED", "BLUE", "GREEN", "GOLD"], "difficulty": 2}\n  ]\n}'
                          : gameType === 'chess_mate'
                            ? '{\n  "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",\n  "mateIn": 2,\n  "toMove": "white",\n  "lines": [["Qxf7#"]]\n}'
                            : gameType === 'codenames_codeword'
                              ? '{\n  "grid": ["WORD1", "WORD2", "...25 words"],\n  "clue": "OCEAN",\n  "clueNumber": 3,\n  "correctWords": ["WAVE", "TIDE", "SURF"]\n}'
                              : gameType === 'ludo_puzzle'
                                ? '{\n  "startingPieces": [\n    {"id": 0, "zone": "track", "pos": 45},\n    {"id": 1, "zone": "track", "pos": 47},\n    {"id": 2, "zone": "home", "pos": 1},\n    {"id": 3, "zone": "base", "pos": 0}\n  ],\n  "diceSequence": [6, 5, 4, 3, 2, 6, 5, 4],\n  "obstacles": [],\n  "optimalRolls": 6\n}'
                                : 'PLANET,A world orbiting a star\nRIVER,A large natural stream\nCASTLE,A fortified royal home'
                }
              />
              {createText &&
                (() => {
                  const parsed = textToContent(gameType, createText)
                  const count = JSON_GAME_TYPES.includes(gameType)
                    ? parsed != null
                      ? 'Valid JSON'
                      : 'Invalid JSON'
                    : `${(parsed as unknown[] | null)?.length ?? 0} valid entries`
                  const vError = parsed != null ? validateContent(gameType, parsed) : null
                  return (
                    <div className="mt-1 text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>{count}</span>
                      {vError && <span className="text-red-400 ml-2">{vError}</span>}
                      {!vError && parsed != null && <span className="text-green-500 ml-2">Ready to save</span>}
                    </div>
                  )
                })()}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving || !createText.trim() || dateHasContent}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : `Save for ${dayLabel(createDate)}`}
              </button>
              {saveMsg && (
                <span className={`text-sm ${saveMsg.ok ? 'text-green-500' : 'text-red-400'}`}>{saveMsg.text}</span>
              )}
            </div>

            {saveMsg?.ok && (
              <p className="text-xs text-[var(--muted)]">
                Date advanced to {dayLabel(createDate)} — fill in the next day&apos;s content and save again.
              </p>
            )}
          </div>

          {/* Date filter */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="label-caps">From</span>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="input-field mt-1 block"
              />
            </label>
            <label className="block">
              <span className="label-caps">To</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="input-field mt-1 block"
              />
            </label>
            <button type="button" onClick={() => void load()} className="btn-secondary px-3 py-2 text-sm">
              Refresh
            </button>
          </div>

          {/* Existing content list (paginated) */}
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No content for {meta.label} in this date range.</p>
          ) : (
            <>
              <p className="text-xs text-[var(--muted)]">
                Showing {Math.min(manualPage * MANUAL_PAGE_SIZE + 1, items.length)}–
                {Math.min((manualPage + 1) * MANUAL_PAGE_SIZE, items.length)} of {items.length} entries
              </p>
              <div className="space-y-2">
                {items.slice(manualPage * MANUAL_PAGE_SIZE, (manualPage + 1) * MANUAL_PAGE_SIZE).map((item) => (
                  <div key={item.id} className="glass-card flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">{formatDate(item.challenge_date)}</span>
                        <span className="ml-2 text-xs text-[var(--muted)]">
                          {entryCount(item.game_type, item.content)} entries
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {editId === item.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdate(item)}
                              disabled={editSaving}
                              className="btn-primary px-3 py-1 text-xs disabled:opacity-50"
                            >
                              {editSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditId(null)}
                              className="btn-secondary px-3 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(item.id)
                                setEditText(contentToText(item.game_type, item.content))
                              }}
                              className="btn-secondary px-3 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="btn-ghost px-3 py-1 text-xs text-red-400"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {editId === item.id ? (
                      <>
                        <textarea
                          value={editText}
                          onChange={(e) => {
                            setEditText(e.target.value)
                            setEditError(null)
                          }}
                          rows={8}
                          className="input-field w-full font-mono text-sm"
                        />
                        {editError && <p className="text-xs text-red-400 mt-1">{editError}</p>}
                      </>
                    ) : (
                      <pre className="max-h-32 overflow-auto rounded bg-[var(--card)] p-2 text-xs">
                        {contentToText(item.game_type, item.content)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
              {items.length > MANUAL_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={manualPage === 0}
                    onClick={() => setManualPage((p) => p - 1)}
                    className="btn-secondary px-3 py-1 text-sm disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-[var(--muted)]">
                    Page {manualPage + 1} of {Math.ceil(items.length / MANUAL_PAGE_SIZE)}
                  </span>
                  <button
                    type="button"
                    disabled={(manualPage + 1) * MANUAL_PAGE_SIZE >= items.length}
                    onClick={() => setManualPage((p) => p + 1)}
                    className="btn-secondary px-3 py-1 text-sm disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
