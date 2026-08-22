'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { SaveToProfileModal } from '@/components/profile/SaveToProfileModal'
import { ShareProfileModal } from '@/components/profile/ShareProfileModal'
import { StatsTab } from '@/components/profile/StatsTab'
import { SettingsTab } from '@/components/profile/SettingsTab'
import { GAME_CATEGORIES, parseGameType } from '@/lib/game-types'
import { authHeaders } from '@/lib/identity'
import { StreakStatusBanner } from '@/components/profile/StreakStatusBanner'
import { Skeleton } from '@/components/Skeleton'
import { Glyph } from '@/components/icons/Glyph'
import { ChampionIcon, CrownIcon, FireIcon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { gameIcon, tierIcon } from '@/lib/game-glyphs'

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
  default_voice_on: boolean | null
  preferred_theme: string | null
} | null

const TABS = [
  { key: 'trophies', label: 'Trophies' },
  { key: 'stats', label: 'Stats & History' },
  { key: 'settings', label: 'Settings' },
] as const

type TabKey = (typeof TABS)[number]['key']

function isValidTab(v: string | null): v is TabKey {
  return v === 'trophies' || v === 'stats' || v === 'settings'
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export default function ProfilePage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState<TabKey>(isValidTab(initialTab) ? initialTab : 'trophies')

  const [profile, setProfile] = useState<ProfileSummary>(null)
  const [games, setGames] = useState<GameRow[]>([])
  const [category, setCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const switchTab = useCallback(
    (next: TabKey) => {
      setTab(next)
      const url = next === 'trophies' ? '/profile' : `/profile?tab=${next}`
      router.replace(url, { scroll: false })
    },
    [router]
  )

  const fetchGames = useCallback(async (headers: Record<string, string>) => {
    const res = await fetch('/api/profile/games', { headers })
    if (!res.ok) return
    const json = await res.json()
    if (!json.profile) {
      setSignedOut(true)
      return
    }
    setSignedOut(false)
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
    try {
      await fetchGames(headers)
    } finally {
      setLoading(false)
    }
    await fetch('/api/profile/sync', { method: 'POST', headers }).catch(() => {})
    await fetchGames(headers)
  }, [fetchGames])

  useEffect(() => {
    void load()
  }, [load])

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
        <span className="sr-only">Loading your profile...</span>
      </div>
    )
  }

  if (signedOut) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-black tracking-tight">Your profile</h1>
        <p className="text-body">
          Track your stats, trophies, and streaks. Save your profile with an email so your progress follows you to any
          device.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="btn-primary btn-fit px-5 py-2.5 text-sm"
          >
            Save your profile
          </button>
          <Link href="/" className="btn-secondary btn-fit inline-block px-5 py-2.5 text-sm">
            Find a game
          </Link>
        </div>
        <SaveToProfileModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          profile={null}
          onChanged={() => void load()}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      {/* Header — shared across all tabs */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight">{profile?.handle || 'Your profile'}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Level {profile?.trophy_level ?? 1} · {plural(profile?.trophy_points ?? 0, 'point')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="btn-primary btn-fit shrink-0 px-3 py-1.5 text-sm"
        >
          Share profile
        </button>
      </div>

      <StreakStatusBanner profile={profile} />

      <div className="grid grid-cols-3 gap-3">
        <Stat
          icon={FireIcon}
          value={`${profile?.current_streak ?? 0}`}
          label="Day streak"
          // Freezes were invisible everywhere despite being stored per profile — a player had
          // no way to know forgiveness existed, which is most of its retention value.
          sub={
            profile && profile.streak_freezes > 0
              ? `Best ${profile.longest_streak} · ${profile.streak_freezes} ❄`
              : `Best ${profile?.longest_streak ?? 0}`
          }
        />
        <Stat
          icon={ChampionIcon}
          value={`${games.reduce((sum, g) => sum + g.earned, 0)}`}
          label="Trophies"
          sub={`${plural(games.length, 'game')}`}
        />
        <Stat
          icon={CrownIcon}
          value={`${profile?.trophy_points ?? 0}`}
          label="Points"
          sub={`Level ${profile?.trophy_level ?? 1}`}
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 border-b border-[var(--border)] pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'border-b-2 border-[var(--primary)] text-[var(--foreground)]'
                : 'text-muted hover:text-[var(--foreground)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'trophies' && (
        <>
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
                  gameType={game.gameType}
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

          {games.length > 0 && (
            <p className="text-faint px-1 text-center text-xs">
              Every game has its own trophies — play another and it appears here.
            </p>
          )}
        </>
      )}

      {tab === 'stats' && <StatsTab games={games} myName={profile?.handle ?? null} />}

      {tab === 'settings' && <SettingsTab profile={profile} onChanged={() => void load()} />}

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

function Stat({ icon, value, label, sub }: { icon: IconSvgElement; value: string; label: string; sub: string }) {
  return (
    <div className="glass-card p-3 text-center sm:p-4">
      <div className="mb-1 flex justify-center text-[var(--primary)]">
        <Glyph icon={icon} size={20} />
      </div>
      <p className="text-2xl font-black sm:text-3xl">{value}</p>
      <p className="text-faint mt-0.5 text-[11px] uppercase tracking-wide">{label}</p>
      <p className="text-faint text-[11px]">{sub}</p>
    </div>
  )
}

function GameCard({
  href,
  gameType,
  label,
  sub,
  earned,
  total,
  pct,
  tiers,
}: {
  href: string
  gameType: string
  label: string
  sub: string
  earned: number
  total: number
  pct: number
  tiers?: { bronze: number; silver: number; gold: number; platinum: number }
}) {
  return (
    <Link href={href} className="glass-card-interactive flex items-center gap-3 p-4">
      <span className="text-[var(--primary)]">
        <Glyph icon={gameIcon(parseGameType(gameType))} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{label}</p>
        <p className="text-faint text-xs">{sub}</p>
        {tiers && total > 0 && (
          <div className="text-faint mt-1 flex items-center gap-3 text-xs">
            {(['platinum', 'gold', 'silver', 'bronze'] as const).map((tierName) => (
              <span key={tierName} className="inline-flex items-center gap-1">
                <Glyph icon={tierIcon(tierName)} size={14} /> {tiers[tierName]}
              </span>
            ))}
          </div>
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
