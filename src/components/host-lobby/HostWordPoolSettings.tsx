'use client'

import { useEffect, useRef, useState } from 'react'
import { LibraryPackBrowser } from '@/components/LibraryPackPicker'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import { questionSampleFile, questionUploadHint, parseQuestionSource } from '@/lib/custom-questions'
import { parseDescribeItWords, parseExcelDescribeItWords, parseStoredDescribeItWords } from '@/lib/describe-it-words'
import type { Game } from '@/types'

type WordSource = 'platform' | 'library' | 'custom'

type Props = {
  gameCode: string
  hostToken: string
  game: Pick<Game, 'question_source' | 'custom_questions'>
  noun: 'words' | 'prompts'
  disabled?: boolean
  onSaved: (patch: Pick<Game, 'question_source' | 'custom_questions'>) => void
  onError: (message: string) => void
}

function wordSourceFromGame(game: Pick<Game, 'question_source' | 'custom_questions'>): WordSource {
  const parsed = parseStoredDescribeItWords(game.custom_questions)
  if (parsed.length > 0) return 'custom'
  return parseQuestionSource(game.question_source, 'quick_draw') === 'custom' ? 'custom' : 'platform'
}

export function HostWordPoolSettings({ gameCode, hostToken, game, noun, disabled, onSaved, onError }: Props) {
  const [wordSource, setWordSource] = useState<WordSource>(() => wordSourceFromGame(game))
  const [wordsDraft, setWordsDraft] = useState(() => parseStoredDescribeItWords(game.custom_questions).join('\n'))
  const [wordTab, setWordTab] = useState<'upload' | 'paste'>('paste')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setWordSource(wordSourceFromGame(game))
    setWordsDraft(parseStoredDescribeItWords(game.custom_questions).join('\n'))
  }, [game.custom_questions, game.question_source])

  const saveWords = async (text: string): Promise<boolean> => {
    setSaving(true)
    try {
      const res = await fetch('/api/quick-draw/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, words: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save word list')
      onSaved({
        question_source: data.question_source ?? 'platform',
        custom_questions: data.custom_questions ?? null,
      })
      return true
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save word list')
      return false
    } finally {
      setSaving(false)
    }
  }

  const onSourceChange = (next: WordSource) => {
    if (disabled || saving) return
    setWordSource(next)
    setUploadError(null)
    if (next === 'platform') {
      setWordsDraft('')
      void saveWords('')
    }
  }

  const applyWords = async (text: string) => {
    const parsed = parseDescribeItWords(text)
    if (parsed.length === 0) {
      setUploadError(`Add at least one ${noun === 'words' ? 'word' : 'prompt'}.`)
      return
    }
    setUploadError(null)
    const ok = await saveWords(parsed.join('\n'))
    if (ok) {
      setWordsDraft(parsed.join('\n'))
      setWordSource('custom')
    }
  }

  const onFileChange = async (file: File | undefined) => {
    if (!file) return
    setUploadError(null)
    try {
      const lower = file.name.toLowerCase()
      const rows =
        lower.endsWith('.xlsx') || lower.endsWith('.xls')
          ? await parseExcelDescribeItWords(await file.arrayBuffer())
          : parseDescribeItWords(await file.text())
      if (rows.length === 0) throw new Error('No words found in that file')
      await applyWords(rows.join('\n'))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that file')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const sample = questionSampleFile('quick_draw')
  const loadedCount = parseDescribeItWords(wordsDraft).length

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-faint capitalize">{noun}</p>
      <SegmentedControl
        value={wordSource}
        onChange={(v) => onSourceChange(v as WordSource)}
        options={[
          { value: 'platform', label: 'Platform', hint: 'Use our built-in word bank.' },
          { value: 'library', label: 'Library', hint: 'Pick a community word pack.' },
          { value: 'custom', label: 'Your own', hint: 'Upload a CSV or paste your own list.' },
        ]}
      />

      {wordSource === 'platform' && (
        <p className="text-faint text-[11px]">Using our built-in {noun} — no upload needed.</p>
      )}

      {wordSource === 'library' && (
        <div className="surface-inset border border-theme rounded-xl p-3 space-y-2">
          <LibraryPackBrowser
            gameType="describe_it"
            noun={noun}
            onPick={async (questions) => {
              const incoming = parseStoredDescribeItWords(questions)
              if (incoming.length === 0) return
              await applyWords(incoming.join('\n'))
            }}
          />
          <p className="text-faint text-[11px]">Word packs are shared with Text Charades.</p>
        </div>
      )}

      {wordSource === 'custom' && (
        <div className="space-y-2">
          {loadedCount > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              ✓ {loadedCount} {noun} loaded — unused entries are picked first.
            </p>
          )}
          <p className="text-faint text-[11px]">{questionUploadHint('quick_draw')}</p>
          <a
            href={sample.href}
            download={sample.download}
            className="inline-block text-sm text-[var(--primary)] underline"
          >
            Download sample CSV
          </a>
          <SegmentedControl
            value={wordTab}
            onChange={(v: string) => setWordTab(v as 'upload' | 'paste')}
            options={[
              { value: 'upload', label: 'Upload file' },
              { value: 'paste', label: 'Paste' },
            ]}
          />
          {wordTab === 'upload' ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || saving}
                className="btn-secondary w-full py-3 text-sm"
              >
                {saving ? 'Saving…' : 'Choose CSV or Excel file'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => void onFileChange(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={wordsDraft}
                onChange={(e) => setWordsDraft(e.target.value)}
                placeholder={noun === 'words' ? 'pizza\nrainbow\nastronaut' : 'A cat in a tuxedo\nA haunted toaster'}
                rows={4}
                disabled={disabled || saving}
                className="input-field w-full resize-y text-sm"
              />
              <button
                type="button"
                onClick={() => void applyWords(wordsDraft)}
                disabled={disabled || saving}
                className="btn-primary w-full py-2.5 text-sm font-bold"
              >
                {saving ? 'Saving…' : `Save ${noun}`}
              </button>
            </div>
          )}
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>
      )}
    </div>
  )
}
