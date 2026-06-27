'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import {
  adminMaxCeiling,
  LOBBY_LIMIT_GAME_TYPES,
  type GameLimitConfig,
  type GamePlayerLimitsMap,
  type LobbyLimitGameType,
} from '@/lib/game-limits'

type LimitDraft = Record<LobbyLimitGameType, string>

function toDraft(limits: GamePlayerLimitsMap): LimitDraft {
  return LOBBY_LIMIT_GAME_TYPES.reduce((acc, type) => {
    acc[type] = String(limits[type].max)
    return acc
  }, {} as LimitDraft)
}

function formatGameLabel(type: LobbyLimitGameType): string {
  return GAME_TYPE_CONFIG[type]?.label ?? type
}

export default function AdminGameLimitsPage() {
  const { success, error } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [draft, setDraft] = useState<LimitDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadLimits = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/admin/game-limits')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load game limits')
      setLimits(data.limits)
      setDraft(toDraft(data.limits))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load game limits')
      setLimits(null)
      setDraft(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLimits()
  }, [loadLimits])

  const updateDraft = (type: LobbyLimitGameType, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [type]: value } : prev))
  }

  const save = async () => {
    if (!limits || !draft) return

    const updates: { game_type: LobbyLimitGameType; max_players: number }[] = []

    for (const type of LOBBY_LIMIT_GAME_TYPES) {
      const raw = draft[type].trim()
      const maxPlayers = Number(raw)
      const cfg = limits[type]

      if (!Number.isInteger(maxPlayers)) {
        error(`Enter a whole number for ${formatGameLabel(type)}`)
        return
      }
      const ceiling = adminMaxCeiling(type)
      if (maxPlayers < cfg.min || maxPlayers > ceiling) {
        error(`${formatGameLabel(type)} max must be between ${cfg.min} and ${ceiling}`)
        return
      }
      if (maxPlayers !== cfg.max) {
        updates.push({ game_type: type, max_players: maxPlayers })
      }
    }

    if (updates.length === 0) {
      success('No changes to save')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/game-limits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits: updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save game limits')
      setLimits(data.limits)
      setDraft(toDraft(data.limits))
      success('Game limits updated')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to save game limits')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-muted">Loading game limits…</p>
  if (loadError) return <p className="text-red-500">{loadError}</p>
  if (!limits || !draft) return null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-title">Game limits</h1>
        <p className="text-muted text-sm mt-1">
          Set the maximum lobby size for each game type. Changes apply to new games and join enforcement immediately
          (cached for ~30 seconds on the server).
        </p>
      </div>

      <div className="glass-card-strong p-5 space-y-4">
        {LOBBY_LIMIT_GAME_TYPES.map((type) => (
          <LimitRow key={type} type={type} config={limits[type]} value={draft[type]} onChange={updateDraft} />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary px-5 py-2.5 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(toDraft(limits))}
          disabled={saving}
          className="btn-secondary px-5 py-2.5 disabled:opacity-60"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

function LimitRow({
  type,
  config,
  value,
  onChange,
}: {
  type: LobbyLimitGameType
  config: GameLimitConfig
  value: string
  onChange: (type: LobbyLimitGameType, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
      <div>
        <p className="font-semibold">{formatGameLabel(type)}</p>
        <p className="text-faint text-xs">
          Min {config.min} · max {adminMaxCeiling(type)} · default lobby size {config.default}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted">Max players</span>
        <input
          type="number"
          min={config.min}
          max={adminMaxCeiling(type)}
          value={value}
          onChange={(e) => onChange(type, e.target.value)}
          className="input-field w-24"
        />
      </label>
    </div>
  )
}
