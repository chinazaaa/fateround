'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SaveToProfileModal } from '@/components/profile/SaveToProfileModal'
import { ShareProfileModal } from '@/components/profile/ShareProfileModal'
import { GAME_CATEGORIES } from '@/lib/game-types'
import { authHeaders } from '@/lib/identity'
import { Skeleton } from '@/components/Skeleton'

type GameRow = {
  gameType: string
  label: string
  emoji: string
  category: string
  gamesPlayed: number
  gamesWon: number
  earned: number
  total: number
  points: number
  pct: number
  tiers: { bronze: number; silver: number; gold: number; platinum: number }
}

type ProfileSummary = {
  id: string
  handle: string | null
  username: string | null
  avatar_url: string | null
  is_anonymous: boolean
  trophy_points: number
  trophy_level: number
  current_streak: number
  longest_streak: number
  last_active_date: string | null
  streak_freezes: number
} | null

/** "1 day", not "1 days". Small, and the thing people notice. */
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * The trophy list — the games you've played, not a catalogue of every game that exists.
 *
 * Modelled on a console trophy list: you open a game to see its trophies. Listing all 47 would
 * bury the two someone actually plays, and a game only enters this list by being PLAYED —
 * admin creating a Monopoly trophy is not a reason to show Monopoly to someone who plays Ayo.
 */
export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileSummary>(null)
  const [games, setGames] = useState<GameRow[]>([])
  const [category, setCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const fetchGames = useCallback(async (headers: Record<string, string>) => {
    const res = await fetch('/api/profile/games', { headers })
    if (!res.ok) return
    const json = await res.json()
    if (!json.profile) {
      setSignedOut(true)
      return
    }
    setProfile(json.profile)
    setGames(json.games ?? [])
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const headers = await authHeaders()
    if (!headers) {
      setSignedOut(true)
      setLoading(false)
      return
    }
    // Paint the summary first — don't block the whole screen on the sync pass.
    try {
      await fetchGames(headers)
    } finally {
      setLoading(false)
    }
    // Then reconcile in the background: sync collects anything newly qualified for (e.g. a trophy
    // added to the catalog after you last played), and a quiet re-read folds it in.
    await fetch('/api/profile/sync', { method: 'POST', headers }).catch(() => {})
    await fetchGames(headers)
  }, [fetchGames])

  useEffect(() => {
    void load()
  }, [load])

  // Only offer categories the player actually has games in — a tab that filters to nothing is
  // worse than no tab.
  const categories = useMemo(() => {
    const present = new Set(games.map((g) => g.category))
    return GAME_CATEGORIES.filter((c) => present.has(c.key))
  }, [games])

  const visible = useMemo(
    () => (category === 'all' ? games : games.filter((g) => g.category === category)),
    [games, category]
  )

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <span className="sr-only">Loading your profile…</span>
      </div>
    )
  }

  if (signedOut) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-black tracking-tight">Your trophies</h1>
        <p className="text-body">
          Finish a game and it appears here with its trophies. Save them to an email and they follow you to any device.
        </p>
        <Link href="/" className="btn-primary btn-fit inline-block px-5 py-2.5 text-sm">
          Find a game
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight">{profile?.handle || 'Your trophies'}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Level {profile?.trophy_level ?? 1} · {plural(profile?.trophy_points ?? 0, 'point')}
          </p>
        </div>
        {/* The name editor lives here rather than as a header chip: on these routes the floating
            theme toggle already owns the header's right side, and this is where someone looks
            for their own settings anyway. */}
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <button type="button" onClick={() => setShareOpen(true)} className="btn-primary btn-fit px-3 py-1.5 text-sm">
            Share profile
          </button>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="btn-secondary btn-fit px-3 py-1.5 text-sm"
          >
            {profile?.handle ? 'Edit name' : 'Set your name'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat
          value={`🔥${profile?.current_streak ?? 0}`}
          label="Day streak"
          sub={`Best ${profile?.longest_streak ?? 0}`}
        />
        <Stat
          value={`${games.reduce((sum, g) => sum + g.earned, 0)}`}
          label="Trophies"
          sub={`${plural(games.length, 'game')}`}
        />
        <Stat value={`${profile?.trophy_points ?? 0}`} label="Points" sub={`Level ${profile?.trophy_level ?? 1}`} />
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={category === 'all'} onClick={() => setCategory('all')}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}

      {games.length === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">
          You haven&apos;t finished a game yet. Play one and it shows up here.
        </p>
      ) : visible.length === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">No games in that category yet.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((game) => (
            <GameCard
              key={game.gameType}
              href={`/profile/${encodeURIComponent(game.gameType)}`}
              emoji={game.emoji}
              label={game.label}
              sub={`${plural(game.gamesPlayed, 'game')} played${game.gamesWon ? ` · ${game.gamesWon} won` : ''}`}
              earned={game.earned}
              total={game.total}
              pct={game.pct}
              tiers={game.tiers}
            />
          ))}
        </div>
      )}

      {/* Without this the list reads as "Trivia is the only game with trophies", because a game
          you haven't played has nothing to show yet. */}
      {games.length > 0 && (
        <p className="text-faint px-1 text-center text-xs">
          Every game has its own trophies — play another and it appears here.
        </p>
      )}

      <SaveToProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={profile}
        onChanged={() => void load()}
      />

      <ShareProfileModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        username={profile?.username ?? null}
        handle={profile?.handle ?? null}
        onClaimed={(username) => {
          setProfile((p) => (p ? { ...p, username } : p))
          void load()
        }}
      />
    </div>
  )
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="glass-card p-3 text-center sm:p-4">
      <p className="text-2xl font-black sm:text-3xl">{value}</p>
      <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">{label}</p>
      <p className="text-faint text-[11px]">{sub}</p>
    </div>
  )
}

function GameCard({
  href,
  emoji,
  label,
  sub,
  earned,
  total,
  pct,
  tiers,
}: {
  href: string
  emoji: string
  label: string
  sub: string
  earned: number
  total: number
  pct: number
  tiers?: { bronze: number; silver: number; gold: number; platinum: number }
}) {
  return (
    <Link href={href} className="glass-card-interactive flex items-center gap-3 p-4">
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{label}</p>
        <p className="text-faint text-xs">{sub}</p>
        {/* The per-tier tally is how a trophy list is actually scanned — "two silvers" tells you
            more at a glance than "6 of 14". */}
        {tiers && total > 0 && (
          <p className="text-faint mt-1 text-xs">
            🏆 {tiers.platinum} · 🥇 {tiers.gold} · 🥈 {tiers.silver} · 🥉 {tiers.bronze}
          </p>
        )}
        {total > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset-bg)]">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        {total > 0 ? (
          <>
            <p className="font-black">
              {earned}
              <span className="text-faint text-sm font-semibold">/{total}</span>
            </p>
            <p className="text-faint text-[11px]">{pct}%</p>
          </>
        ) : (
          // Honest rather than hiding the game: they played it, there just aren't trophies yet.
          <p className="text-faint text-[11px]">No trophies yet</p>
        )}
      </div>
    </Link>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white'
          : 'rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-muted hover:text-[var(--foreground)]'
      }
    >
      {children}
    </button>
  )
}
