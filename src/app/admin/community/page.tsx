'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { MANAGER_CODE_MIN_LENGTH } from '@/lib/manager-constants'
import type { CommunityGame } from '@/types/community'

const ACCENT_PRESETS = ['#f43f5e', '#22c55e', '#fb923c', '#ec4899', '#8b5cf6', '#38bdf8', '#a78bfa', '#e879f9']

export default function AdminCommunityPage() {
  const { success, error } = useToast()
  const [games, setGames] = useState<CommunityGame[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newAccent, setNewAccent] = useState(ACCENT_PRESETS[0])
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/community/games', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load games')
      setGames(data.games)
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to load games')
    } finally {
      setLoading(false)
    }
  }, [error])

  useEffect(() => {
    load()
  }, [load])

  const applyGames = (data: { games?: CommunityGame[]; error?: string }, res: Response) => {
    if (!res.ok) throw new Error(data.error ?? 'Request failed')
    if (data.games) setGames(data.games)
  }

  const addGame = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/community/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), accent: newAccent }),
      })
      applyGames(await res.json(), res)
      setNewName('')
      success('Game added')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to add game')
    } finally {
      setAdding(false)
    }
  }

  const patchGame = async (
    id: string,
    patch: Partial<Pick<CommunityGame, 'name' | 'accent' | 'is_active' | 'sort_order'>>
  ) => {
    try {
      const res = await fetch('/api/admin/community/games', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      applyGames(await res.json(), res)
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  const { confirm } = useConfirm()
  const deleteGame = async (game: CommunityGame) => {
    const ok = await confirm({
      title: `Delete ${game.name}?`,
      message:
        'Games that already have recorded winners can’t be deleted — hide them instead to keep the leaderboard history.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/community/games?id=${game.id}`, { method: 'DELETE' })
      applyGames(await res.json(), res)
      success('Game deleted')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const current = games[index]
    const other = games[index + dir]
    if (!current || !other) return

    const swap = (id: string, sort_order: number) =>
      fetch('/api/admin/community/games', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, sort_order }),
      }).then((res) => {
        if (!res.ok) throw new Error('Failed to reorder')
      })

    try {
      // Await sequentially (not two fire-and-forget PATCHes) so the writes can't
      // race, then refresh once from the server as the source of truth.
      await swap(current.id, other.sort_order)
      await swap(other.id, current.sort_order)
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to reorder')
    } finally {
      load()
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight gradient-title">Community leaderboard</h1>
        <p className="text-muted text-sm mt-1">
          Manage the games shown on the public leaderboard and the access code your community manager uses to enter
          winners.
        </p>
      </div>

      <ManagerCodePanel />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Games</h2>
        <div className="glass-card-strong p-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="text-muted">New game name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGame()}
              placeholder="e.g. Ludo"
              className="input-field w-full mt-1"
            />
          </label>
          <div className="text-sm">
            <span className="text-muted">Colour</span>
            <div className="flex gap-1.5 mt-1">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Accent ${c}`}
                  onClick={() => setNewAccent(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${newAccent === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-[var(--background)]' : ''}`}
                  style={{ background: c, boxShadow: newAccent === c ? `0 0 0 2px ${c}` : undefined }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={addGame}
            disabled={adding || !newName.trim()}
            className="btn-primary btn-fit px-5 py-2.5 disabled:opacity-60"
          >
            {adding ? 'Adding…' : 'Add game'}
          </button>
        </div>

        {loading ? (
          <p className="text-muted text-sm">Loading games…</p>
        ) : games.length === 0 ? (
          <p className="text-muted text-sm">No games yet — add your first one above.</p>
        ) : (
          <div className="glass-card-strong divide-y divide-[var(--border)]">
            {games.map((game, i) => (
              <GameRow
                key={game.id}
                game={game}
                isFirst={i === 0}
                isLast={i === games.length - 1}
                onPatch={(patch) => patchGame(game.id, patch)}
                onMove={(dir) => move(i, dir)}
                onDelete={() => deleteGame(game)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function GameRow({
  game,
  isFirst,
  isLast,
  onPatch,
  onMove,
  onDelete,
}: {
  game: CommunityGame
  isFirst: boolean
  isLast: boolean
  onPatch: (patch: Partial<Pick<CommunityGame, 'name' | 'accent' | 'is_active' | 'sort_order'>>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(game.name)
  useEffect(() => setName(game.name), [game.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== game.name) onPatch({ name: trimmed })
    else setName(game.name)
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${game.is_active ? '' : 'opacity-50'}`}>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={isFirst}
          className="text-faint hover:text-[var(--foreground)] disabled:opacity-30 leading-none"
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={isLast}
          className="text-faint hover:text-[var(--foreground)] disabled:opacity-30 leading-none"
          aria-label="Move down"
        >
          ▼
        </button>
      </div>
      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: game.accent ?? 'var(--primary)' }} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="input-field flex-1 py-1.5"
      />
      <button
        type="button"
        onClick={() => onPatch({ is_active: !game.is_active })}
        className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${game.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[var(--border-strong)] text-muted'}`}
      >
        {game.is_active ? 'Active' : 'Hidden'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-faint hover:text-red-500 transition-colors px-1"
        aria-label={`Delete ${game.name}`}
      >
        ✕
      </button>
    </div>
  )
}

function ManagerCodePanel() {
  const { success, error } = useToast()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/community/code', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false))
  }, [])

  const save = async () => {
    if (code.trim().length < MANAGER_CODE_MIN_LENGTH) {
      error(`Code must be at least ${MANAGER_CODE_MIN_LENGTH} characters`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/community/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to set code')
      setConfigured(true)
      setCode('')
      success('Manager access code saved')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to set code')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Manager access code</h2>
      <div className="glass-card-strong p-5 space-y-3">
        <p className="text-sm text-muted">
          {configured === null
            ? 'Checking…'
            : configured
              ? 'A code is set. Setting a new one immediately replaces it — anyone using the old code will need the new one.'
              : 'No code set yet. Create one and share it with your community manager so she can enter scores at /input.'}
        </p>
        <p className="text-xs text-faint">
          Use at least {MANAGER_CODE_MIN_LENGTH} characters — a short code can be guessed.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={configured ? 'Enter a new code to rotate' : 'Choose a code'}
            className="input-field flex-1"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || code.trim().length < MANAGER_CODE_MIN_LENGTH}
            className="btn-primary btn-fit px-5 py-2.5 disabled:opacity-60"
          >
            {saving ? 'Saving…' : configured ? 'Rotate code' : 'Set code'}
          </button>
        </div>
      </div>
    </section>
  )
}
