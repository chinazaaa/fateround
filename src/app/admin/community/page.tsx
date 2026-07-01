'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { MANAGER_CODE_MIN_LENGTH, POST_CODE_MIN_LENGTH } from '@/lib/manager-constants'
import { communityGameTypeOptions } from '@/lib/game-types'
import type { CommunityGame } from '@/types/community'

const GAME_TYPE_OPTIONS = communityGameTypeOptions()

export default function AdminCommunityPage() {
  const { success, error } = useToast()
  const [games, setGames] = useState<CommunityGame[]>([])
  const [loading, setLoading] = useState(true)
  const [newType, setNewType] = useState('')
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

  // Game types not already on the leaderboard (one row per type).
  const availableTypes = useMemo(() => {
    const taken = new Set(games.map((g) => g.game_type).filter(Boolean))
    return GAME_TYPE_OPTIONS.filter((o) => !taken.has(o.id))
  }, [games])

  const addGame = async () => {
    if (!newType) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/community/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: newType }),
      })
      applyGames(await res.json(), res)
      setNewType('')
      success('Game added')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to add game')
    } finally {
      setAdding(false)
    }
  }

  const patchGame = async (
    id: string,
    patch: Partial<Pick<CommunityGame, 'name' | 'accent' | 'is_active' | 'sort_order' | 'game_type'>>
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
          Manage the games shown on the public leaderboard, the weekly code winners use to post their own wins, and the
          access code your community manager uses to enter scores manually.
        </p>
      </div>

      <PostCodePanel />
      <ManagerCodePanel />
      <WhatsAppPanel />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Games</h2>
        <p className="text-sm text-muted -mt-1">
          Pick a game to add it to the leaderboard. Winners of that game can then post their own wins from the end
          screen using this week’s code.
        </p>
        <div className="glass-card-strong p-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="text-muted">Add a game</span>
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="input-field w-full mt-1">
              <option value="">Choose a game…</option>
              {availableTypes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addGame}
            disabled={adding || !newType}
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

// A game_type value is "real" only if it matches a known game-type option.
const KNOWN_TYPE_IDS = new Set(GAME_TYPE_OPTIONS.map((o) => o.id))

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
  onPatch: (patch: Partial<Pick<CommunityGame, 'name' | 'accent' | 'is_active' | 'sort_order' | 'game_type'>>) => void
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

  const mapped = game.game_type && KNOWN_TYPE_IDS.has(game.game_type as never)

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${game.is_active ? '' : 'opacity-50'}`}>
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
        className="input-field flex-1 min-w-[8rem] py-1.5"
      />
      <label className="text-xs text-muted flex items-center gap-1.5">
        <span className="hidden sm:inline">Maps to</span>
        <select
          value={mapped ? (game.game_type as string) : ''}
          onChange={(e) => onPatch({ game_type: e.target.value || null })}
          className={`input-field py-1 px-2 text-xs w-auto ${mapped ? '' : 'text-amber-600'}`}
          title="Which in-app game a winner posts from"
        >
          <option value="">Not mapped</option>
          {GAME_TYPE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
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

// A code panel used by both the weekly post code and the manager code — same
// shape (set/rotate a hashed code), different endpoint and copy.
function CodePanel({
  title,
  endpoint,
  minLength,
  describe,
  hint,
}: {
  title: string
  endpoint: string
  minLength: number
  describe: (configured: boolean) => string
  hint: string
}) {
  const { success, error } = useToast()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(endpoint, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false))
  }, [endpoint])

  const save = async () => {
    if (code.trim().length < minLength) {
      error(`Code must be at least ${minLength} characters`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to set code')
      setConfigured(true)
      setCode('')
      success(`${title} saved`)
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to set code')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="glass-card-strong p-5 space-y-3">
        <p className="text-sm text-muted">{configured === null ? 'Checking…' : describe(configured)}</p>
        <p className="text-xs text-faint">{hint}</p>
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
            disabled={saving || code.trim().length < minLength}
            className="btn-primary btn-fit px-5 py-2.5 disabled:opacity-60"
          >
            {saving ? 'Saving…' : configured ? 'Rotate code' : 'Set code'}
          </button>
        </div>
      </div>
    </section>
  )
}

function PostCodePanel() {
  return (
    <CodePanel
      title="Weekly post code"
      endpoint="/api/admin/community/post-code"
      minLength={POST_CODE_MIN_LENGTH}
      describe={(configured) =>
        configured
          ? 'A code is set. Rotate it each week (Monday) and share the new code in the WhatsApp group. Winners enter it on the game end screen to post their win.'
          : 'No code set yet. Create one and share it in the WhatsApp group — winners enter it on the game end screen to post their win to the leaderboard.'
      }
      hint={`Change this every week. At least ${POST_CODE_MIN_LENGTH} characters — keep it easy to type but not obvious.`}
    />
  )
}

function ManagerCodePanel() {
  return (
    <CodePanel
      title="Manager access code"
      endpoint="/api/admin/community/code"
      minLength={MANAGER_CODE_MIN_LENGTH}
      describe={(configured) =>
        configured
          ? 'A code is set. Setting a new one immediately replaces it — anyone using the old code will need the new one.'
          : 'No code set yet. Create one and share it with your community manager so she can enter scores at /input.'
      }
      hint={`Use at least ${MANAGER_CODE_MIN_LENGTH} characters — this grants full entry powers, so keep it private.`}
    />
  )
}

function WhatsAppPanel() {
  const { success, error } = useToast()
  const [url, setUrl] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/community/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setUrl(d.whatsappInviteUrl ?? ''))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/community/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappInviteUrl: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setUrl(data.whatsappInviteUrl ?? '')
      success(url.trim() ? 'WhatsApp link saved' : 'WhatsApp link cleared')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Community WhatsApp link</h2>
      <div className="glass-card-strong p-5 space-y-3">
        <p className="text-sm text-muted">
          Shown as a “Join the community” button on the public leaderboard. Leave blank to hide it.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="https://chat.whatsapp.com/…"
            className="input-field flex-1"
            autoComplete="off"
            disabled={!loaded}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !loaded}
            className="btn-primary btn-fit px-5 py-2.5 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save link'}
          </button>
        </div>
      </div>
    </section>
  )
}
