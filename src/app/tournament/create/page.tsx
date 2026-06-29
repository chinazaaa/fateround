'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, Toggle, PrimaryBtn } from '@/components/ui/PageShell'

const DEFAULT_POINTS = [10, 7, 5, 3, 2, 1]

const PLACEMENT_STYLES = [
  { ring: 'rgba(217, 119, 6, 0.4)', bg: 'rgba(245, 158, 11, 0.14)', text: 'var(--marry)', medal: '🥇' },
  { ring: 'rgba(100, 116, 139, 0.4)', bg: 'rgba(100, 116, 139, 0.12)', text: '#475569', medal: '🥈' },
  { ring: 'rgba(180, 83, 9, 0.4)', bg: 'rgba(180, 83, 9, 0.12)', text: '#b45309', medal: '🥉' },
]

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="surface-inset flex items-center gap-1 p-1">
      <button
        type="button"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold text-muted transition hover:bg-[var(--card-hover)] hover:text-body disabled:opacity-30 disabled:hover:bg-transparent"
      >
        −
      </button>
      <span className="w-8 text-center text-body font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold text-muted transition hover:bg-[var(--card-hover)] hover:text-body disabled:opacity-30 disabled:hover:bg-transparent"
      >
        +
      </button>
    </div>
  )
}

export default function TournamentCreatePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [targetGameCount, setTargetGameCount] = useState<string>('')
  const [livesEnabled, setLivesEnabled] = useState(false)
  const [startingLives, setStartingLives] = useState(3)
  const [eliminateCount, setEliminateCount] = useState(1)
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
      if (livesEnabled) {
        body.eliminationConfig = {
          mode: 'lives',
          startingLives,
          livesLostRule: 'bottom-n',
          eliminateCount,
        }
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
    <PageShell centered narrow>
      <div className="text-center space-y-2">
        <span className="premium-badge">Tournament</span>
        <h1 className="text-4xl font-black gradient-title leading-tight">Create Tournament</h1>
        <p className="text-muted text-sm">Set up a multi-game competition for your group</p>
      </div>

      <div className="glass-card-strong p-5 sm:p-6 space-y-5">
        <Field label="Tournament Title" htmlFor="tournament-title">
          <input
            id="tournament-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Friday Game Night"
            maxLength={100}
            className="input-field"
          />
        </Field>

        <Field label="Target Games (optional)" htmlFor="tournament-target-games">
          <input
            id="tournament-target-games"
            type="number"
            value={targetGameCount}
            onChange={(e) => setTargetGameCount(e.target.value)}
            placeholder="Leave empty for unlimited"
            min={1}
            max={100}
            className="input-field"
          />
          <p className="text-faint text-xs mt-1.5">Tournament ends after this many games, or you can end it manually</p>
        </Field>

        <div className="space-y-3">
          <Toggle
            label="Lives mode"
            description="Bottom finishers lose a life each game — last player standing wins"
            value={livesEnabled}
            onChange={setLivesEnabled}
          />

          {livesEnabled && (
            <div className="surface-inset p-4 space-y-3 animate-stagger">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body text-sm font-medium">Starting lives</p>
                  <p className="text-faint text-xs mt-0.5">How many each player begins with</p>
                </div>
                <Stepper value={startingLives} min={1} max={10} onChange={setStartingLives} />
              </div>
              <div className="divider-soft" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body text-sm font-medium">Lives lost per game</p>
                  <p className="text-faint text-xs mt-0.5">Bottom-N players lose a life</p>
                </div>
                <Stepper value={eliminateCount} min={1} max={10} onChange={setEliminateCount} />
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="label-caps mb-2.5">Placement Points</p>
          <div className="grid grid-cols-3 gap-2">
            {DEFAULT_POINTS.map((pts, i) => {
              const medal = PLACEMENT_STYLES[i]
              return (
                <div
                  key={i}
                  className="rounded-xl border border-theme px-3 py-2.5 text-center"
                  style={
                    medal
                      ? { background: medal.bg, boxShadow: `inset 0 0 0 1px ${medal.ring}` }
                      : { background: 'var(--surface-inset-bg)' }
                  }
                >
                  <p className="text-[0.6875rem] font-semibold" style={{ color: medal ? medal.text : 'var(--muted)' }}>
                    {medal ? `${medal.medal} ` : ''}
                    {ordinal(i + 1)}
                  </p>
                  <p
                    className="text-lg font-black tabular-nums leading-tight"
                    style={{ color: medal ? medal.text : 'var(--foreground)' }}
                  >
                    {pts}
                    <span className="text-[0.625rem] font-semibold align-top ml-0.5">pt</span>
                  </p>
                </div>
              )
            })}
          </div>
          <p className="text-faint text-xs mt-2 text-center">7th place and below earn 1pt each</p>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <PrimaryBtn onClick={handleCreate} disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Tournament'}
      </PrimaryBtn>
    </PageShell>
  )
}
