'use client'

import { useEffect, useRef, useState } from 'react'
import type { Game, QuestionSource } from '@/types'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import { LibraryPackBrowser } from '@/components/LibraryPackPicker'
import { PuzzleUpload } from '@/components/create/PuzzleUpload'
import { crosswordThemeOptions } from '@/lib/crossword-puzzles'
import { wordSearchThemeOptions } from '@/lib/word-search-puzzles'
import { wordScrambleThemeOptions } from '@/lib/word-scramble-puzzles'
import { usePuzzleThemes } from '@/hooks/usePuzzleThemes'
import {
  questionSourceOptions,
  questionSampleFile,
  questionUploadHint,
  parseQuestionSource,
  parseCrosswordEntryImport,
  parseWordSearchEntryImport,
  parseWordScrambleEntryImport,
  parseStoredCrosswordEntries,
  parseStoredWordSearchEntries,
  parseStoredWordScrambleEntries,
  formatEntryImportSummary,
} from '@/lib/custom-questions'
import { useToast } from '@/components/ui/Toast'

const DIFFICULTIES: { value: string; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

type Kind = 'crossword' | 'word_search' | 'word_scramble'

/** Per-kind wiring so the one component serves all three word games. */
function kindConfig(kind: Kind) {
  if (kind === 'crossword') {
    return {
      noun: 'answers',
      themeOptions: crosswordThemeOptions,
      parseImport: (text: string) => parseCrosswordEntryImport(text),
      parseStored: (raw: unknown) => parseStoredCrosswordEntries(raw),
    }
  }
  if (kind === 'word_search') {
    return {
      noun: 'words',
      themeOptions: wordSearchThemeOptions,
      parseImport: (text: string) => parseWordSearchEntryImport(text),
      parseStored: (raw: unknown) => parseStoredWordSearchEntries(raw),
    }
  }
  return {
    noun: 'words',
    themeOptions: wordScrambleThemeOptions,
    parseImport: (text: string) => parseWordScrambleEntryImport(text),
    parseStored: (raw: unknown) => parseStoredWordScrambleEntries(raw),
  }
}

/**
 * Lobby editor for a Crossword / Word Search / Word Scramble puzzle. Hosts pick where the words come
 * from — Platform (a built-in or admin theme), Library (a community pack) or Your own (a CSV upload) —
 * plus the difficulty (grid size). All of this lives on the game and is only read when the round is
 * generated at start, so it's editable while waiting. Saves via the shared lobby-settings route,
 * which re-validates + normalises every pool server-side and enforces the waiting state.
 */
export function HostPuzzleSettings({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
  kind,
}: {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
  kind: Kind
}) {
  const { error: toastError } = useToast()
  const cfg = kindConfig(kind)
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSummary, setUploadSummary] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Admin themes for this game type, shown alongside the built-ins (called before the early
  // return to respect the rules of hooks).
  const puzzleThemes = usePuzzleThemes(kind)

  // A saved custom pool ('custom' source) means the host is on Library/Your-own; otherwise Platform.
  // Library folds to a custom pool at rest, so it re-opens under "Your own" — same as the create page.
  const savedSource: QuestionSource =
    parseQuestionSource(game.question_source, kind) === 'custom' ? 'custom' : 'platform'
  const [source, setSource] = useState<QuestionSource>(savedSource)
  useEffect(() => {
    setSource(savedSource)
  }, [savedSource])

  if (game.status !== 'waiting') return null

  const themeField = `${kind}_theme`
  const diffField = `${kind}_difficulty`
  // An admin theme is stored on the game by its NAME, so its chip value is its name too (keeps the
  // active chip highlighted). Selecting one sends puzzle_theme_id; the server folds its pool.
  const adminOptions = puzzleThemes.map((t) => ({
    value: t.name,
    label: t.difficulty ? `${t.name} (${t.difficulty})` : t.name,
  }))
  const themeOptions = [...cfg.themeOptions().map((t) => ({ value: t.id, label: t.label })), ...adminOptions]
  const g = game as unknown as Record<string, string | null | undefined>
  const currentTheme = g[themeField] ?? themeOptions[0]?.value ?? ''
  const currentDifficulty = g[diffField] ?? 'medium'
  const currentAdminTheme = puzzleThemes.find((t) => t.name === currentTheme)
  const lockedDifficulty = currentAdminTheme?.difficulty ?? null
  const loadedCount = savedSource === 'custom' ? cfg.parseStored(game.custom_questions).length : 0
  const firstBuiltinTheme = cfg.themeOptions()[0]?.id ?? ''

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    if (saving) return false
    setSaving(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/lobby-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      if (data.game) onGameUpdate(data.game)
      return true
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save settings')
      return false
    } finally {
      setSaving(false)
    }
  }

  const onSourceChange = (next: QuestionSource) => {
    if (saving || next === source) return
    setSource(next)
    setUploadError(null)
    setUploadSummary(null)
    // Switching back to Platform reverts to a built-in theme (the route clears the custom pool).
    // Library/Your-own only save once a pack or file is actually picked, so nothing happens yet.
    if (next === 'platform' && savedSource === 'custom') {
      const builtin = cfg.themeOptions().some((t) => t.id === currentTheme) ? currentTheme : firstBuiltinTheme
      void patch({ [themeField]: builtin })
    }
  }

  const applyCustomPool = async (entries: unknown[], label: string) => {
    if (entries.length < 4) {
      setUploadError(`Add at least 4 ${cfg.noun}.`)
      return
    }
    setUploadError(null)
    const ok = await patch({ puzzle_custom_questions: entries })
    if (ok) setUploadSummary(label)
  }

  return (
    <>
      <HostLobbySettingBlock title={kind === 'crossword' ? 'Answers & clues' : 'Words'} className="sm:col-span-2">
        <SegmentedControl
          value={source}
          onChange={(v) => onSourceChange(v as QuestionSource)}
          options={questionSourceOptions(kind)}
        />

        {source === 'platform' && (
          <div className="pt-2">
            <HostLobbyOptionChips
              value={currentTheme}
              options={themeOptions}
              onChange={(v) => {
                const admin = puzzleThemes.find((t) => t.name === String(v))
                if (admin) void patch({ puzzle_theme_id: admin.id })
                else void patch({ [themeField]: String(v) })
              }}
              disabled={saving}
            />
          </div>
        )}

        {source === 'library' && (
          <div className="surface-inset border border-theme rounded-xl p-3 mt-2 space-y-2">
            <LibraryPackBrowser
              gameType={kind}
              noun={cfg.noun}
              onPick={async (questions) => {
                const incoming = cfg.parseStored(questions)
                await applyCustomPool(incoming, `${incoming.length} ${cfg.noun} loaded from this pack`)
              }}
            />
            {loadedCount > 0 && (
              <p className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                ✓ {loadedCount} {cfg.noun} loaded — unused entries are picked first.
              </p>
            )}
          </div>
        )}

        {source === 'custom' && (
          <div className="pt-1">
            {loadedCount > 0 && !uploadSummary && (
              <p className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                ✓ {loadedCount} {cfg.noun} loaded — unused entries are picked first.
              </p>
            )}
            <PuzzleUpload
              sample={questionSampleFile(kind)}
              hint={questionUploadHint(kind)}
              buttonLabel={saving ? 'Saving…' : 'Choose CSV'}
              fileRef={fileRef}
              error={uploadError}
              summary={uploadSummary}
              onFile={async (file) => {
                setUploadError(null)
                setUploadSummary(null)
                try {
                  const result = cfg.parseImport(await file.text())
                  if (result.questions.length < 4) throw new Error(`Need at least 4 ${cfg.noun}`)
                  const extra = formatEntryImportSummary(result)
                  await applyCustomPool(
                    result.questions,
                    `${result.questions.length} ${cfg.noun} loaded${extra ? ` · ${extra}` : ''}`
                  )
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : 'Could not read that file')
                }
              }}
            />
          </div>
        )}
      </HostLobbySettingBlock>

      <HostLobbySettingBlock title="Difficulty">
        <HostLobbyOptionChips
          value={lockedDifficulty ?? currentDifficulty}
          options={DIFFICULTIES}
          onChange={(v) => void patch({ [diffField]: String(v) })}
          disabled={saving || !!lockedDifficulty}
        />
        {lockedDifficulty ? (
          <p className="mt-1 text-xs text-muted">Set by this theme.</p>
        ) : (
          <p className="mt-1 text-xs text-muted">Sets the grid size and word count — not how tricky the words are.</p>
        )}
      </HostLobbySettingBlock>
    </>
  )
}
