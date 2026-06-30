'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Field, PrimaryBtn } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { DailyGameWinner } from '@/types/community'

type SessionState = { authed: boolean; codeConfigured: boolean }

export default function InputPage() {
  const [session, setSession] = useState<SessionState | null>(null)

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch('/api/manager/session', { cache: 'no-store' })
      const data = (await res.json()) as SessionState
      setSession(data)
    } catch {
      setSession({ authed: false, codeConfigured: false })
    }
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  if (!session) {
    return <div className="page-wrap flex min-h-screen items-center justify-center text-muted">Loading…</div>
  }

  if (!session.authed) {
    return <LoginCard codeConfigured={session.codeConfigured} onSuccess={loadSession} />
  }

  return <EntryForm onLoggedOut={loadSession} />
}

function LoginCard({ codeConfigured, onSuccess }: { codeConfigured: boolean; onSuccess: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/manager/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Login failed')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
            style={{ background: 'var(--chip-active-bg)' }}
          >
            🏆
          </span>
          <h1 className="text-3xl font-black tracking-tight gradient-title">Enter scores</h1>
          <p className="text-muted text-sm">Community manager access — record tonight&apos;s winners</p>
        </div>

        <div className="glass-card-strong p-6 space-y-4">
          {!codeConfigured ? (
            <p className="text-sm text-muted">
              No access code has been set up yet. Ask the admin to set a community-manager code from the admin
              dashboard, then come back here.
            </p>
          ) : (
            <>
              <Field label="Access code">
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  autoFocus
                  className="input-field w-full"
                  placeholder="Enter your code"
                />
              </Field>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <PrimaryBtn onClick={submit} disabled={loading || !code} className="w-full">
                {loading ? 'Checking…' : 'Continue'}
              </PrimaryBtn>
            </>
          )}
          <p className="text-center text-xs text-faint">
            <Link href="/leaderboard" className="hover:text-[var(--foreground)] transition-colors">
              View the public leaderboard →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function EntryForm({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { success, error } = useToast()
  const [date, setDate] = useState('')
  const [dayLabel, setDayLabel] = useState('')
  const [games, setGames] = useState<DailyGameWinner[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (forDate?: string) => {
      setLoading(true)
      try {
        const qs = forDate ? `?date=${forDate}` : ''
        const res = await fetch(`/api/manager/results${qs}`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setDate(data.date)
        setGames(data.games)
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [error]
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!date) return
    setDayLabel(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date(`${date}T00:00:00Z`))
    )
  }, [date])

  const logout = async () => {
    await fetch('/api/manager/logout', { method: 'POST' })
    onLoggedOut()
  }

  const recordedCount = games.filter((g) => g.winnerName).length

  return (
    <div className="page-wrap flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight gradient-title">Enter scores</h1>
            <p className="text-muted text-sm mt-1">Record one winner per game for the night.</p>
          </div>
          <button type="button" onClick={logout} className="btn-secondary text-sm px-4 py-2 shrink-0">
            Log out
          </button>
        </div>

        <div className="glass-card-strong p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-faint uppercase tracking-wide">Recording for</p>
            <p className="font-semibold">{dayLabel || '…'}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && load(e.target.value)}
              className="input-field"
            />
          </label>
        </div>

        {loading ? (
          <p className="text-muted text-sm">Loading games…</p>
        ) : games.length === 0 ? (
          <div className="glass-card p-6 text-center text-muted text-sm">
            No games are set up yet. Ask the admin to add games in the admin dashboard.
          </div>
        ) : (
          <>
            <p className="text-xs text-faint">
              {recordedCount} of {games.length} games recorded
            </p>
            <div className="space-y-3">
              {games.map((g) => (
                <GameRow
                  key={g.game.id}
                  entry={g}
                  date={date}
                  onChanged={() => load(date)}
                  onToast={{ success, error }}
                />
              ))}
            </div>
          </>
        )}

        <p className="text-center text-xs text-faint">
          <Link href="/leaderboard" className="hover:text-[var(--foreground)] transition-colors">
            View the public leaderboard →
          </Link>
        </p>
      </div>
    </div>
  )
}

function GameRow({
  entry,
  date,
  onChanged,
  onToast,
}: {
  entry: DailyGameWinner
  date: string
  onChanged: () => void
  onToast: { success: (m: string) => void; error: (m: string) => void }
}) {
  const { confirm } = useConfirm()
  const [value, setValue] = useState(entry.winnerName ?? '')
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(entry.winnerName ?? '')
  }, [entry.winnerName])

  const accent = entry.game.accent ?? 'var(--primary)'
  const dirty = value.trim() !== (entry.winnerName ?? '')

  const fetchSuggestions = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/manager/players?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        const data = await res.json()
        if (res.ok) setSuggestions(data.players ?? [])
      } catch {
        setSuggestions([])
      }
    }, 180)
  }

  const save = async (name = value) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/manager/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: entry.game.id, date, playerName: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onToast.success(`${entry.game.name}: ${trimmed} 🏆`)
      onChanged()
    } catch (err) {
      onToast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
      setOpen(false)
    }
  }

  const clear = async () => {
    const ok = await confirm({
      title: `Clear ${entry.game.name}?`,
      message: `Remove ${entry.winnerName} as the winner for this day.`,
      confirmLabel: 'Clear',
      destructive: true,
    })
    if (!ok) return
    setSaving(true)
    try {
      const res = await fetch(`/api/manager/results?gameId=${entry.game.id}&date=${date}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to clear')
      setValue('')
      onToast.success(`${entry.game.name} cleared`)
      onChanged()
    } catch (err) {
      onToast.error(err instanceof Error ? err.message : 'Failed to clear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: accent }} />
        <span className="font-semibold">{entry.game.name}</span>
        {entry.winnerName && (
          <span className="ml-auto text-xs text-faint">
            current: <span className="text-[var(--foreground)] font-medium">{entry.winnerName}</span>
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setOpen(true)
              fetchSuggestions(e.target.value)
            }}
            onFocus={() => {
              setOpen(true)
              fetchSuggestions(value)
            }}
            onBlur={() => {
              blurRef.current = setTimeout(() => setOpen(false), 120)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
            placeholder="Winner's name"
            className="input-field w-full"
          />
          {open && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-strong)] shadow-lg backdrop-blur-md">
              {suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--chip-active-bg)] transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (blurRef.current) clearTimeout(blurRef.current)
                    setValue(name)
                    setOpen(false)
                    save(name)
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => save()}
          disabled={saving || !dirty || !value.trim()}
          className="btn-primary btn-fit px-4 disabled:opacity-50"
        >
          {saving ? '…' : entry.winnerName ? 'Update' : 'Save'}
        </button>
        {entry.winnerName && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="btn-secondary px-3 disabled:opacity-50"
            aria-label={`Clear ${entry.game.name}`}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
