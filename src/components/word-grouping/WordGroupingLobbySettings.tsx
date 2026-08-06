'use client'

import { useEffect, useState } from 'react'
import type { Game, QuestionSource } from '@/types'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import { LibraryPackBrowser } from '@/components/LibraryPackPicker'
import { questionSourceOptions, parseQuestionSource } from '@/lib/custom-questions'
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

  // Persisted question_source is 'platform' or 'custom' (library folds into 'custom' at save
  // time). WG's segmented control only offers Platform + Library — no separate custom upload
  // — so a saved 'custom' can only have come from a library pack pick. Map it back to
  // 'library' for the UI, otherwise the segmented control snaps back to Platform and the
  // "N puzzles loaded" chip never fires even though a pack is live.
  const savedSource: QuestionSource =
    parseQuestionSource(game.question_source, 'word_grouping') === 'custom' ? 'library' : 'platform'
  const [source, setSource] = useState<QuestionSource>(savedSource)
  useEffect(() => {
    setSource(savedSource)
  }, [savedSource])

  if (game.status !== 'waiting') return null

  const loadedCount =
    savedSource === 'library' && Array.isArray(game.custom_questions) ? game.custom_questions.length : 0

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
    // Switching back to Platform after a library pack was loaded: clear the pool so start
    // falls back to the built-in bank. Matches savedSource === 'library' now that we surface
    // library (rather than 'custom') as the UI state.
    if (next === 'platform' && savedSource === 'library') {
      void patch({ puzzle_custom_questions: [] })
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
    </HostLobbySettingBlock>
  )
}
