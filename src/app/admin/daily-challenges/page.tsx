'use client'

import { useCallback, useEffect, useState } from 'react'
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
]

type ContentRow = {
  id: string
  game_type: GameTypeId
  challenge_date: string
  content: unknown
  created_at: string
  updated_at: string
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

const JSON_GAME_TYPES: GameTypeId[] = ['word_grouping', 'chess_mate', 'codenames_codeword']

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
    default:
      return null
  }
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminDailyPage() {
  const { confirm } = useConfirm()
  const { success, error: toastError } = useToast()
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

  // Create form
  const [createDate, setCreateDate] = useState(today)
  const [createText, setCreateText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editSaving, setEditSaving] = useState(false)

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
  }, [gameType, filterFrom, filterTo])

  useEffect(() => {
    void load()
  }, [load])

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

    const res = await fetch('/api/admin/daily-challenges-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_type: gameType, challenge_date: createDate, content }),
    })

    setSaving(false)

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

  const meta = GAME_TYPES.find((g) => g.id === gameType)!

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

      {/* Existing content list */}
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No content for {meta.label} in this date range.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
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
                      <button type="button" onClick={() => setEditId(null)} className="btn-secondary px-3 py-1 text-xs">
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
      )}
    </div>
  )
}
