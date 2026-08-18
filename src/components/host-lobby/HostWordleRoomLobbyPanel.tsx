'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  WORDLE_ROOM_TIMER_OPTIONS,
  WORDLE_ROOM_WORD_COUNT_OPTIONS,
  WORDLE_ROOM_DEFAULT_TIMER,
  WORDLE_ROOM_DEFAULT_WORD_COUNT,
  clampWordleRoomCategory,
} from '@/lib/wordle-room'
import type { WordleCategoryId } from '@/lib/daily-wordle'
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { LibraryPackPicker, type LibraryPackLite } from '@/components/LibraryPackPicker'
import { parsePuzzleThemeCsv } from '@/lib/puzzle-themes'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

type WordleWordEntry = { word: string; hint?: string }
type WordleSource = 'platform' | 'library' | 'custom'

const SOURCE_OPTIONS: { value: WordleSource; label: string }[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'library', label: 'Library' },
  { value: 'custom', label: 'Your own' },
]

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  playerCount: number
  onGameUpdate: (game: Game) => void
}

type SaveState = 'idle' | 'saving' | 'saved'

const CATEGORY_OPTIONS = [
  { value: 'general_english', label: 'General English' },
  { value: 'naija_slang', label: 'Naija Slang' },
  { value: 'sports', label: 'Sports' },
  { value: 'food', label: 'Food & Drink' },
  { value: 'animals', label: 'Animals' },
  { value: 'technology', label: 'Technology' },
  { value: 'nature', label: 'Nature' },
  { value: 'music', label: 'Music' },
  { value: 'science', label: 'Science' },
  { value: 'clothing', label: 'Clothing & Fashion' },
  { value: 'travel', label: 'Travel & Places' },
]

function timerLabel(seconds: number): string {
  if (seconds === 0) return 'Untimed'
  if (seconds === 120) return '2 min'
  if (seconds === 300) return '5 min'
  if (seconds === 600) return '10 min'
  if (seconds === 900) return '15 min'
  return `${seconds}s`
}

export function HostWordleRoomLobbyPanel({ gameCode, hostToken, game, playerCount, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(20)
  const [category, setCategory] = useState<WordleCategoryId>('general_english')
  const [wordCount, setWordCount] = useState(5)
  const [timer, setTimer] = useState(WORDLE_ROOM_DEFAULT_TIMER)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Word source picker — mirrors the create page. Whether the game currently has a custom
  // pool is derived from `wordle_room_custom_words` on the game row; we can't tell library
  // vs custom apart after the fact, so on load we treat any pool as "library" (the more
  // common case), and the host can flip to Custom to upload a fresh CSV.
  const initialSource: WordleSource = Array.isArray(
    (game as unknown as { wordle_room_custom_words?: unknown }).wordle_room_custom_words
  )
    ? 'library'
    : 'platform'
  const [source, setSource] = useState<WordleSource>(initialSource)
  const [libraryPacks, setLibraryPacks] = useState<LibraryPackLite[]>([])
  const [libraryPacksLoading, setLibraryPacksLoading] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [customWords, setCustomWords] = useState<WordleWordEntry[]>(() => {
    const raw = (game as unknown as { wordle_room_custom_words?: unknown }).wordle_room_custom_words
    if (!Array.isArray(raw)) return []
    return (raw as { word?: string; hint?: string }[])
      .map((e) => {
        const word = (e.word ?? '').toLowerCase().replace(/[^a-z]/g, '')
        return e.hint ? { word, hint: e.hint } : { word }
      })
      .filter((e) => e.word.length >= 3 && e.word.length <= 8)
  })
  const [categoryLabel, setCategoryLabel] = useState<string>(game.content_label ?? '')

  useEffect(() => {
    void fetch('/api/game-limits')
      .then((res) => res.json())
      .then((data: { limits?: GamePlayerLimitsMap }) => {
        if (data.limits) setLimits(data.limits)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!limits) return
    setMaxPlayers(lobbyMaxPlayersFromGame('wordle_room', game, limits) ?? game.max_players ?? 20)
    setCategory(clampWordleRoomCategory(game.wordle_room_category))
    setWordCount(game.wordle_room_word_count ?? WORDLE_ROOM_DEFAULT_WORD_COUNT)
    setTimer(game.timer_seconds ?? WORDLE_ROOM_DEFAULT_TIMER)
    setCategoryLabel(game.content_label ?? '')
  }, [game, limits])

  // Load Wordle library packs whenever the host flips to Library (mirrors create page).
  useEffect(() => {
    if (source !== 'library') return
    setLibraryPacksLoading(true)
    fetch('/api/library?game_type=wordle_room&page_size=100')
      .then((r) => r.json())
      .then((data: { packs?: LibraryPackLite[] }) => {
        setLibraryPacks(data.packs ?? [])
      })
      .finally(() => setLibraryPacksLoading(false))
  }, [source])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const limitCfg = limits?.wordle_room
  const minPlayers = limitCfg?.min ?? 2
  const maxCap = limitCfg?.max ?? 20

  const markSaved = useCallback(() => {
    setSaveState('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  const patchSettings = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaveState('saving')
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, hostToken, ...patch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
        if (data.game) onGameUpdate(data.game)
        markSaved()
      } catch (err) {
        setSaveState('idle')
        toastError(err instanceof Error ? err.message : 'Failed to save settings')
      }
    },
    [gameCode, hostToken, markSaved, onGameUpdate, toastError]
  )

  const onMaxPlayersChange = (next: number) => {
    if (next < playerCount) {
      toastError(`Already have ${playerCount} players — remove someone first`)
      return
    }
    setMaxPlayers(next)
    void patchSettings({ max_players: next })
  }

  const onCategoryChange = (next: string) => {
    const value = clampWordleRoomCategory(next)
    setCategory(value)
    void patchSettings({ wordle_room_category: value })
  }

  const onWordCountChange = (next: number) => {
    setWordCount(next)
    void patchSettings({ wordle_room_word_count: next })
  }

  const onTimerChange = (next: number) => {
    setTimer(next)
    void patchSettings({ timer_seconds: next })
  }

  const onSourceChange = (next: string) => {
    const v = (next === 'library' || next === 'custom' ? next : 'platform') as WordleSource
    setSource(v)
    // Flipping BACK to Platform clears any previously-picked custom pool server-side so the
    // start route falls through to the built-in category. Library/Custom don't patch until the
    // host actually picks a pack / uploads a file, so switching between them mid-lobby doesn't
    // silently keep the old pool.
    if (v === 'platform') {
      setSelectedPackId(null)
      setCustomWords([])
      void patchSettings({ wordle_room_words: [] })
    }
  }

  const onSelectPack = async (id: string) => {
    setSelectedPackId(id)
    const res = await fetch(`/api/library/${id}`)
    const data = (await res.json()) as {
      pack?: { title?: string; questions?: { word?: string; hint?: string }[] }
    }
    const entries = (data.pack?.questions ?? [])
      .map((e) => {
        const word = (e.word ?? '').toLowerCase().replace(/[^a-z]/g, '')
        return e.hint ? { word, hint: e.hint } : { word }
      })
      .filter((e) => e.word.length >= 3 && e.word.length <= 8)
    setCustomWords(entries)
    // Auto-fill the badge label with the pack name unless the host has already set one.
    const patch: Record<string, unknown> = { wordle_room_words: entries }
    if (data.pack?.title && !categoryLabel.trim()) {
      setCategoryLabel(data.pack.title)
      patch.content_label = data.pack.title
    }
    void patchSettings(patch)
  }

  const onCustomFileUpload = async (file: File | undefined) => {
    if (!file) return
    try {
      const csv = await file.text()
      const parsed = parsePuzzleThemeCsv('wordle_room', csv)
      const entries = parsed.entries.map((r) => {
        const word = (r.word ?? '').toLowerCase().replace(/[^a-z]/g, '')
        return r.hint ? { word, hint: r.hint } : { word }
      })
      setCustomWords(entries)
      void patchSettings({ wordle_room_words: entries })
    } catch {
      toastError('Could not read that file. Expect CSV with word,hint columns.')
    }
  }

  const onCategoryLabelBlur = () => {
    // Persist only on blur so every keystroke doesn't hit the server. Empty label falls back
    // to "Custom" on the badge (start route handles that).
    void patchSettings({ content_label: categoryLabel.trim() })
  }

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const wordCountOptions = useMemo(
    () =>
      WORDLE_ROOM_WORD_COUNT_OPTIONS.map((n) => ({
        value: n,
        label: String(n),
      })),
    []
  )

  const timerOptions = useMemo(
    () =>
      WORDLE_ROOM_TIMER_OPTIONS.map((s) => ({
        value: s,
        label: timerLabel(s),
      })),
    []
  )

  const statusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null

  return (
    <HostLobbySettingsSection status={statusLabel}>
      <HostLobbySettingBlock title={`Max players · ${playerCount} joined`}>
        <HostLobbyOptionChips value={maxPlayers} options={maxPlayerOptions} onChange={onMaxPlayersChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Word source">
        <HostLobbyOptionChips value={source} options={SOURCE_OPTIONS} onChange={onSourceChange} />
      </HostLobbySettingBlock>

      {source === 'platform' && (
        <HostLobbySettingBlock title="Category">
          <HostLobbyOptionChips value={category} options={CATEGORY_OPTIONS} onChange={onCategoryChange} />
        </HostLobbySettingBlock>
      )}

      {source === 'library' && (
        <HostLobbySettingBlock title="Library pack">
          <div className="space-y-2">
            <LibraryPackPicker
              loading={libraryPacksLoading}
              packs={libraryPacks}
              search={librarySearch}
              onSearchChange={setLibrarySearch}
              selectedPackId={selectedPackId}
              onSelect={onSelectPack}
              noun="words"
            />
            {customWords.length > 0 && (
              <p className="text-faint text-xs text-center">
                Loaded {customWords.length} valid word{customWords.length === 1 ? '' : 's'}
                {customWords.length < wordCount ? ` — need at least ${wordCount} for a ${wordCount}-word race` : ''}
              </p>
            )}
          </div>
        </HostLobbySettingBlock>
      )}

      {source === 'custom' && (
        <HostLobbySettingBlock title="Upload word list">
          <div className="space-y-2">
            <input
              type="file"
              accept=".csv,text/csv"
              className="input-field"
              onChange={(e) => void onCustomFileUpload(e.target.files?.[0])}
            />
            <p className="text-faint text-xs">
              {customWords.length > 0
                ? `Loaded ${customWords.length} valid 3–8 letter word${customWords.length === 1 ? '' : 's'}${customWords.length < wordCount ? ` — need at least ${wordCount}` : ''}.`
                : `CSV with word,hint per line (hint optional). Words must be 3–8 letters.`}
            </p>
          </div>
        </HostLobbySettingBlock>
      )}

      {(source === 'library' || source === 'custom') && (
        <HostLobbySettingBlock title="Category name (badge)">
          <input
            value={categoryLabel}
            onChange={(e) => setCategoryLabel(e.target.value)}
            onBlur={onCategoryLabelBlur}
            placeholder="e.g. Fruits, Slang"
            className="input-field"
          />
        </HostLobbySettingBlock>
      )}

      <HostLobbySettingBlock title="Words in the race">
        <HostLobbyOptionChips value={wordCount} options={wordCountOptions} onChange={onWordCountChange} />
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title={`Whole-game timer · ${timerLabel(timer)}`}>
        <HostLobbyOptionChips value={timer} options={timerOptions} onChange={onTimerChange} />
      </HostLobbySettingBlock>
    </HostLobbySettingsSection>
  )
}
