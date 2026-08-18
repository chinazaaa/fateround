'use client'

import { useEffect, useRef, useState } from 'react'
import type { Game, QuestionSource } from '@/types'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import { LibraryPackBrowser } from '@/components/LibraryPackPicker'
import { questionSourceOptions, parseQuestionSource } from '@/lib/custom-questions'
import {
  parseStoredWordGroupingPuzzles,
  parseWordGroupingPoolText,
  WORD_GROUPING_SAMPLE_CSV,
} from '@/lib/word-grouping'
import { useToast } from '@/components/ui/Toast'

export function WordGroupingLobbySettings({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
}: {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
}) {
  const { error: toastError } = useToast()
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSummary, setUploadSummary] = useState<string | null>(null)

  // Persisted question_source is 'platform' or 'custom'. Both Library and "Your own" fold to
  // 'custom' at rest — we can't tell them apart afterwards, so on load we default a saved custom
  // pool to 'library' (the more common case). The host can flip to Your own to upload a fresh
  // pool.
  const savedSource: QuestionSource =
    parseQuestionSource(game.question_source, 'word_grouping') === 'custom' ? 'library' : 'platform'
  const [source, setSource] = useState<QuestionSource>(savedSource)
  useEffect(() => {
    setSource(savedSource)
  }, [savedSource])

  if (game.status !== 'waiting') return null

  const loadedCount = source !== 'platform' && Array.isArray(game.custom_questions) ? game.custom_questions.length : 0

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
    // Switching back to Platform after a library / custom pack was loaded: clear the pool so
    // start falls back to the built-in bank. If the clear fails, roll the segmented control back
    // to the previous state so the UI keeps matching the still-persisted pack.
    if (next === 'platform' && savedSource !== 'platform') {
      void patch({ puzzle_custom_questions: [] }).then((ok) => {
        if (!ok) setSource(savedSource)
      })
    }
  }

  const onFile = async (file: File) => {
    setUploadError(null)
    setUploadSummary(null)
    try {
      const text = await file.text()
      const { entries, totalRows, skippedRows } = parseWordGroupingPoolText(text)
      const validated = parseStoredWordGroupingPuzzles(entries)
      if (!validated || validated.length < 1) {
        setUploadError(
          `Could not read any valid puzzles (${totalRows - skippedRows}/${totalRows} rows had a puzzle-shaped JSON, but none passed shape validation — need 4 groups × 4 unique words with difficulty 1-4).`
        )
        return
      }
      const ok = await patch({ puzzle_custom_questions: validated })
      if (ok) {
        setUploadSummary(
          `${validated.length} puzzle${validated.length === 1 ? '' : 's'} loaded${
            skippedRows ? ` · ${skippedRows} row${skippedRows === 1 ? '' : 's'} skipped` : ''
          }`
        )
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that file')
    }
  }

  return (
    <HostLobbySettingBlock title="Puzzle source" className="sm:col-span-2">
      <SegmentedControl
        value={source}
        onChange={(v) => onSourceChange(v as QuestionSource)}
        options={questionSourceOptions('word_grouping')}
      />

      {source === 'library' && (
        <div className="surface-inset border border-theme rounded-xl p-3 mt-2 space-y-2">
          <LibraryPackBrowser
            gameType="word_grouping"
            noun="puzzles"
            onPick={async (questions) => {
              const incoming = Array.isArray(questions) ? questions : []
              if (incoming.length < 4) {
                toastError('Pack needs at least 4 puzzles')
                return
              }
              await patch({ puzzle_custom_questions: incoming })
            }}
          />
          {loadedCount > 0 && (
            <p className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">✓ {loadedCount} puzzles loaded</p>
          )}
        </div>
      )}

      {source === 'custom' && (
        <div className="surface-inset border border-theme rounded-xl p-3 mt-2 space-y-2">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(WORD_GROUPING_SAMPLE_CSV)}`}
            download="word-grouping-sample.csv"
            className="inline-block text-sm text-[var(--primary)] underline"
          >
            Download sample CSV
          </a>
          <p className="text-faint text-xs">
            CSV columns: <code>puzzle, category, difficulty, word1, word2, word3, word4</code>. Four rows per puzzle
            (one per group, difficulties 1–4). JSON-per-line also accepted.
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-secondary w-full py-2.5 text-sm"
            disabled={saving}
          >
            {saving ? 'Uploading…' : 'Upload puzzles'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,.jsonl,.ndjson,.txt,text/csv,application/json,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) await onFile(file)
              e.target.value = ''
            }}
          />
          {uploadSummary && (
            <p className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">{uploadSummary}</p>
          )}
          {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}
          {loadedCount > 0 && !uploadSummary && (
            <p className="text-faint text-xs">
              Currently loaded: {loadedCount} puzzle{loadedCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
      )}
    </HostLobbySettingBlock>
  )
}
