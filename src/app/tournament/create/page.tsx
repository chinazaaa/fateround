'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DEFAULT_POINTS = [10, 7, 5, 3, 2, 1]

export default function TournamentCreatePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [targetGameCount, setTargetGameCount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!title.trim()) {
      setError('Enter a tournament title')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        placementPoints: DEFAULT_POINTS,
      }
      const count = parseInt(targetGameCount, 10)
      if (!isNaN(count) && count > 0) {
        body.targetGameCount = count
      }

      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create tournament')
        return
      }

      localStorage.setItem(`tournament_host_${data.tournamentCode}`, data.hostToken)
      router.push(`/tournament/${data.tournamentCode}`)
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6 space-y-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-heading">Create Tournament</h1>
          <p className="text-muted text-sm">Set up a multi-game competition for your group</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Tournament Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Friday Game Night"
              maxLength={100}
              className="w-full rounded-xl border border-theme bg-surface px-4 py-3 text-body placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-1">Target Games (optional)</label>
            <input
              type="number"
              value={targetGameCount}
              onChange={(e) => setTargetGameCount(e.target.value)}
              placeholder="Leave empty for unlimited"
              min={1}
              max={100}
              className="w-full rounded-xl border border-theme bg-surface px-4 py-3 text-body placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-faint text-xs mt-1">Tournament ends after this many games, or you can end it manually</p>
          </div>

          <div className="glass-card p-4 space-y-2">
            <p className="text-sm font-medium text-body">Placement Points</p>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_POINTS.map((pts, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
                >
                  {i + 1}
                  {i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}: {pts}pts
                </span>
              ))}
              <span className="inline-flex items-center rounded-full bg-surface-inset px-3 py-1 text-xs text-faint">
                7th+: 1pt
              </span>
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={submitting}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </main>
  )
}
