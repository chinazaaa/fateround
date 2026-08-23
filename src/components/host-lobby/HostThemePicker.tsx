'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Game } from '@/types'
import { THEMES, type ThemeId } from '@/lib/themes'
import { MONOPOLY_EDITIONS } from '@/components/monopoly/monopoly-themes'
import { ThemePreviewCard, ThemePreviewModal } from '@/components/ThemePreviewModal'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { useToast } from '@/components/ui/Toast'
import { isMonopolyEditionAvailable, useOwnedMonopolyEditions } from '@/hooks/useOwnedMonopolyEditions'
import { useOwnedGameThemes } from '@/hooks/useOwnedGameThemes'
import { GAME_THEMES_BY_GAME, isGameThemeSlug } from '@/lib/coins/game-themes'
import { authHeaders } from '@/lib/identity'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  /** Optional — callers that don't poll/subscribe can sync immediately; others (e.g. the
   *  central HostLobby sheet) pick up `game.theme` on their own. */
  onGameUpdate?: (game: Game) => void
}

/** Games that use a per-game visual reskin from `game_themes` (Phase 3 shop). */
const GAME_THEME_TYPES = new Set(Object.keys(GAME_THEMES_BY_GAME))

/**
 * Lobby theme/edition editor. Monopoly maps themes to named board editions;
 * Whot / Ludo / Sudoku surface their per-game visual reskins from
 * `game_themes` with ownership gating; every other themable game shows the
 * shared visual themes. Saves via PATCH /api/games/[code] (theme is only
 * editable while waiting/finished, enforced server-side).
 */
export function HostThemePicker({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const isMonopoly = game.game_type === 'monopoly'
  const hasGameThemes = GAME_THEME_TYPES.has(game.game_type)
  const [saving, setSaving] = useState<ThemeId | null>(null)
  const [previewTheme, setPreviewTheme] = useState<(typeof THEMES)[number] | null>(null)
  const { available: ownedEditions } = useOwnedMonopolyEditions()
  const { available: ownedGameThemes } = useOwnedGameThemes(hasGameThemes ? game.game_type : null)

  const currentTheme = (game.theme as ThemeId | null | undefined) ?? 'default'

  const options = useMemo(() => {
    if (isMonopoly) {
      return THEMES.filter(
        (theme) =>
          MONOPOLY_EDITIONS.some((e) => e.themeId === theme.id) &&
          (theme.id === currentTheme || isMonopolyEditionAvailable(theme.id, ownedEditions))
      )
    }
    if (hasGameThemes) {
      // Free default + owned game_themes slugs for this game type. Any
      // slug not in GAME_THEMES_BY_GAME[game_type] belongs to a
      // different game (whot-neon on a Ludo picker, etc.) and is
      // hidden. The currently-selected theme is never hidden so a
      // room created before a revoked purchase still shows its pick.
      const scoped = new Set<string>(GAME_THEMES_BY_GAME[game.game_type] ?? [])
      return THEMES.filter(
        (theme) =>
          theme.id === 'default' ||
          (scoped.has(theme.id) && (theme.id === currentTheme || ownedGameThemes.has(theme.id)))
      )
    }
    return THEMES.filter(
      (theme) =>
        theme.id !== 'pirate' &&
        theme.id !== 'arctic' &&
        theme.id !== 'naija' &&
        theme.id !== 'america' &&
        theme.id !== 'grass_court' &&
        // Per-game reskins from game_themes never surface on other
        // games' pickers — those show up only under the owning game's
        // hasGameThemes branch above.
        !isGameThemeSlug(theme.id)
    )
  }, [isMonopoly, hasGameThemes, game.game_type, ownedEditions, ownedGameThemes, currentTheme])

  // Paid Monopoly editions the host doesn't own (and isn't currently using).
  // Drives the "More editions in the Shop" nudge below the picker so hosts
  // learn USA (and future editions) exist even when they've never opened
  // /shop directly. Free grandfathered editions never count — everyone
  // already has them.
  const hasUnownedPaidEditions = useMemo(() => {
    if (!isMonopoly) return false
    return MONOPOLY_EDITIONS.some(
      (e) => e.themeId !== currentTheme && !isMonopolyEditionAvailable(e.themeId as ThemeId, ownedEditions)
    )
  }, [isMonopoly, ownedEditions, currentTheme])

  // Same idea for the per-game reskin lineup: nudge Whot / Ludo / Sudoku
  // hosts toward the shop when there are paid themes they haven't
  // bought yet. Free themes (price 0 — none today, future drops maybe)
  // don't count.
  const hasUnownedGameThemes = useMemo(() => {
    if (!hasGameThemes) return false
    const scoped = GAME_THEMES_BY_GAME[game.game_type] ?? []
    return scoped.some((slug) => slug !== currentTheme && !ownedGameThemes.has(slug))
  }, [hasGameThemes, game.game_type, currentTheme, ownedGameThemes])

  const selectTheme = async (themeId: ThemeId) => {
    if (saving || themeId === currentTheme) return
    setSaving(themeId)
    try {
      // Send the bearer token alongside hostToken so the server can identify
      // the signed-in profile for the paid-edition/theme entitlement check.
      // Games created before sign-in have host_user_id = null, and without a
      // bearer the server would 401 a legitimate paid pick just because the
      // stored row still points at nobody.
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ hostToken, theme: themeId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to update theme')
      if (data.game) onGameUpdate?.(data.game)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update theme')
    } finally {
      setSaving(null)
    }
  }

  // Theme is only editable pre-game (server enforces waiting/finished); hide it once live. Troll Run
  // picks a world instead of a theme, so it opts out here rather than above the hooks — returning
  // before them changes how many hooks run between renders, which React rejects outright.
  if (game.game_type === 'troll_run') return null
  if (game.status === 'active') return null
  if (options.length <= 1) return null

  const blockTitle = isMonopoly ? 'Edition' : 'Theme'
  const useTightGrid = isMonopoly || hasGameThemes

  return (
    <HostLobbySettingBlock title={blockTitle} className="sm:col-span-2">
      <div
        className={`grid ${useTightGrid ? 'grid-cols-2 max-w-sm sm:max-w-md' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'} gap-1.5 sm:gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}
      >
        {options.map((theme) => {
          const edition = isMonopoly ? MONOPOLY_EDITIONS.find((e) => e.themeId === theme.id) : null
          const displayTheme = edition ? { ...theme, label: edition.editionName, emoji: edition.editionEmoji } : theme
          return (
            <ThemePreviewCard
              key={theme.id}
              theme={displayTheme}
              selected={currentTheme === theme.id}
              onClick={() => void selectTheme(theme.id)}
              onPreview={() => setPreviewTheme(theme)}
            />
          )
        })}
      </div>
      {isMonopoly && hasUnownedPaidEditions && (
        <p className="mt-2 text-xs text-faint">
          More editions in the{' '}
          <Link href="/shop" prefetch={false} className="underline hover:no-underline text-body">
            Shop
          </Link>
          {' — '}
          USA and more.
        </p>
      )}
      {hasGameThemes && hasUnownedGameThemes && (
        <p className="mt-2 text-xs text-faint">
          More themes in the{' '}
          <Link href="/shop" prefetch={false} className="underline hover:no-underline text-body">
            Shop
          </Link>
          {' →'}
        </p>
      )}
      <ThemePreviewModal
        open={previewTheme !== null}
        theme={previewTheme}
        onClose={() => setPreviewTheme(null)}
        onSelect={(themeId) => void selectTheme(themeId)}
        gameType={game.game_type}
      />
    </HostLobbySettingBlock>
  )
}
