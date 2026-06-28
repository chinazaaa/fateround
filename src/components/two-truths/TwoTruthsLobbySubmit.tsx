'use client'

import { useState } from 'react'
import { TTL_MAX_STATEMENT_LENGTH } from '@/lib/two-truths'
import { useToast } from '@/components/ui/Toast'

export function TwoTruthsLobbySubmit({
  gameCode,
  resumeToken,
  existingLieIndex,
  existingStatements,
  onSaved,
}: {
  gameCode: string
  resumeToken: string | null
  existingLieIndex?: number | null
  existingStatements?: [string, string, string] | null
  onSaved?: () => void
}) {
  const { success, error: toastError } = useToast()
  const [a, setA] = useState(existingStatements?.[0] ?? '')
  const [b, setB] = useState(existingStatements?.[1] ?? '')
  const [c, setC] = useState(existingStatements?.[2] ?? '')
  const [lieIndex, setLieIndex] = useState<number | null>(existingLieIndex ?? null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!a.trim() || !b.trim() || !c.trim() || lieIndex == null) {
      toastError('Fill in all three statements and pick which one is the lie')
      return
    }
    if (!resumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/two-truths/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken,
          statementA: a.trim(),
          statementB: b.trim(),
          statementC: c.trim(),
          lieIndex,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      success('Statements saved!')
      onSaved?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { value: a, set: setA, label: 'Statement 1' },
    { value: b, set: setB, label: 'Statement 2' },
    { value: c, set: setC, label: 'Statement 3' },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted leading-relaxed">
        Write two true things and one lie about yourself. Everyone will try to spot the fib when it&apos;s your turn.
      </p>
      {fields.map((field, index) => (
        <div key={field.label} className="space-y-2">
          <label className="label-caps">{field.label}</label>
          <div className="flex gap-2 items-start">
            <button
              type="button"
              onClick={() => setLieIndex(index)}
              className={[
                'shrink-0 mt-1 h-9 w-9 rounded-lg border text-sm font-bold transition-colors',
                lieIndex === index
                  ? 'border-violet-500 bg-violet-500/15 text-violet-800 dark:text-violet-100'
                  : 'border-[var(--border-strong)] text-faint hover:text-[var(--foreground)]',
              ].join(' ')}
              title={lieIndex === index ? 'This is the lie' : 'Mark as the lie'}
            >
              🤥
            </button>
            <textarea
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder={`${field.label}…`}
              className="input-field w-full min-h-[4rem] resize-y"
              maxLength={TTL_MAX_STATEMENT_LENGTH}
            />
          </div>
        </div>
      ))}
      <p className="text-faint text-xs">Tap 🤥 on the statement that is the lie.</p>
      <button type="button" onClick={save} disabled={saving} className="btn-primary w-full">
        {saving ? 'Saving…' : existingStatements ? 'Update statements' : 'Save statements'}
      </button>
    </div>
  )
}
