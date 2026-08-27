'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { IconSvgElement } from '@hugeicons/react'
import { FlashIcon, Moon02Icon, Tv01Icon } from '@hugeicons/core-free-icons'
import type { Game } from '@/types'
import { THEMES, type ThemeId } from '@/lib/themes'
import { MONOPOLY_EDITIONS } from '@/components/monopoly/monopoly-themes'
import { ThemePreviewCard, ThemePreviewModal } from '@/components/ThemePreviewModal'
import { Glyph } from '@/components/icons/Glyph'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { useToast } from '@/components/ui/Toast'
import { isMonopolyEditionAvailable, useOwnedMonopolyEditions } from '@/hooks/useOwnedMonopolyEditions'
import { useOwnedGameThemes } from '@/hooks/useOwnedGameThemes'
import { MONOPOLY_THEME_TO_EDITION } from '@/lib/coins/editions'
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

/** The only palettes the Troll Run canvas renderer ships (see troll-run-engine/renderer.ts
 *  THEMES) — it falls back to dark for anything else. Labels, icons and order mirror the
 *  Visual Palette field on the create page so a host sees the same three choices either way. */
const TROLL_RUN_PALETTES: readonly { id: ThemeId; label: string; icon: IconSvgElement }[] = [
  { id: 'dark', label: 'Dark Slate', icon: Moon02Icon },
  { id: 'retro', label: 'Retro 8-Bit', icon: Tv01Icon },
  { id: 'neon', label: 'Cyber Neon', icon: FlashIcon },
]

/** Games that use a per-game visual reskin from `game_themes` (Phase 3 shop). */
const GAME_THEME_TYPES = new Set(Object.keys(GAME_THEMES_BY_GAME))

/**
 * Lobby theme/edition editor. Monopoly maps themes to named board editions;
 * Troll Run shows the palettes its canvas can actually render; Whot / Ludo /
 * Sudoku surface their per-game visual reskins from `game_themes` with
 * ownership gating; every other themable game shows the shared visual themes.
 * Saves via PATCH /api/games/[code] (theme is only editable while
 * waiting/finished, enforced server-side).
 */
export function HostThemePicker({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const router = useRouter()
  const isMonopoly = game.game_type === 'monopoly'
  const isTrollRun = game.game_type === 'troll_run'
  const hasGameThemes = GAME_THEME_TYPES.has(game.game_type)
  const [saving, setSaving] = useState<ThemeId | null>(null)
  const [previewTheme, setPreviewTheme] = useState<(typeof THEMES)[number] | null>(null)
  const { available: ownedEditions, prices: editionPrices } = useOwnedMonopolyEditions()
  const { available: ownedGameThemes, prices: gameThemePrices } = useOwnedGameThemes(
    hasGameThemes ? game.game_type : null
  )

  const storedTheme = (game.theme as ThemeId | null | undefined) ?? 'default'
  // A Troll Run game created without touching Visual Palette carries theme 'default', which the
  // canvas renders as dark via its fallback. Show dark as the live selection so the picker
  // reflects what is actually on screen instead of leaving all three cards unselected.
  const currentTheme: ThemeId =
    isTrollRun && !TROLL_RUN_PALETTES.some((palette) => palette.id === storedTheme) ? 'dark' : storedTheme

  const options = useMemo(() => {
    if (isMonopoly) {
      // Show EVERY known Monopoly edition — owned ones as normal tiles, paid
      // ones the host doesn't own as locked "Unlock in Shop" tiles. This is
      // strictly better for discoverability than filtering unowned editions
      // out (which hid USA / Christmas from anyone who had never opened the
      // shop). The `locked` flag below decides which is which; server-side
      // entitlement still gates the actual PATCH.
      return THEMES.filter((theme) => MONOPOLY_EDITIONS.some((e) => e.themeId === theme.id))
    }
    if (hasGameThemes) {
      // Free default + EVERY per-game reskin scoped to this game type
      // (Neon Whot, Wooden Ludo, …). Unowned tiles render locked below
      // and route to /shop on click — same discoverability shape as the
      // Monopoly edition picker. Any slug not in
      // GAME_THEMES_BY_GAME[game_type] belongs to a different game
      // (whot-neon on a Ludo picker, etc.) and stays hidden.
      //
      // The currently-selected theme is ALWAYS kept — a room created
      // before this narrowing (e.g. a Whot lobby whose stored theme is
      // 'dark' or 'grass_court', which used to be pickable here) would
      // otherwise be filtered out, the tile count could fall to one,
      // and the whole picker's `options.length <= 1` guard below would
      // hide the UI entirely, leaving the host with no way to change
      // theme at all.
      const scoped = new Set<string>(GAME_THEMES_BY_GAME[game.game_type] ?? [])
      return THEMES.filter((theme) => theme.id === currentTheme || theme.id === 'default' || scoped.has(theme.id))
    }
    return THEMES.filter(
      (theme) =>
        theme.id !== 'pirate' &&
        theme.id !== 'arctic' &&
        theme.id !== 'naija' &&
        theme.id !== 'america' &&
        theme.id !== 'christmas' &&
        // Per-game reskins from game_themes never surface on other
        // games' pickers — those show up only under the owning game's
        // hasGameThemes branch above.
        !isGameThemeSlug(theme.id)
    )
  }, [isMonopoly, hasGameThemes, game.game_type, currentTheme])

  const selectTheme = async (themeId: ThemeId) => {
    // Compared against the stored value, not the displayed one: a Troll Run game sitting on
    // 'default' displays dark, and clicking Dark Slate must still persist so the page chrome
    // lines up with the canvas instead of staying on the default palette.
    if (saving || themeId === storedTheme) return
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

  // Theme is only editable pre-game (server enforces waiting/finished); hide it once live.
  if (game.status === 'active') return null

  if (isTrollRun) {
    return (
      <HostLobbySettingBlock title="Visual Palette" className="sm:col-span-2">
        <div className={`grid grid-cols-3 gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}>
          {TROLL_RUN_PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              onClick={() => void selectTheme(palette.id)}
              className={[
                'rounded-xl border-2 py-2 px-2 text-center transition flex items-center justify-center gap-1.5',
                currentTheme === palette.id
                  ? 'border-[var(--primary)] bg-[var(--surface-inset-bg)] ring-1 ring-[var(--primary)] text-body font-semibold'
                  : 'border-[var(--border-strong)] text-muted hover:border-[var(--border)]',
              ].join(' ')}
            >
              <Glyph icon={palette.icon} size={13} className="shrink-0 text-[var(--primary)]" />
              <span className="text-xs">{palette.label}</span>
            </button>
          ))}
        </div>
      </HostLobbySettingBlock>
    )
  }

  if (options.length <= 1) return null

  const blockTitle = isMonopoly ? 'Edition' : 'Theme'
  const useTightGrid = isMonopoly || hasGameThemes

  return (
    <HostLobbySettingBlock title={blockTitle} className="sm:col-span-2">
      <div
        className={`grid ${useTightGrid ? 'grid-cols-2 max-w-sm sm:max-w-md' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'} gap-1.5 sm:gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}
      >
        {options.map((theme) => {
          const edition = isMonopoly ? MONOPOLY_EDITIONS.find((item) => item.themeId === theme.id) : null
          const displayTheme = edition ? { ...theme, label: edition.editionName, emoji: edition.editionEmoji } : theme
          // Lock unowned paid Monopoly editions and unowned paid per-game
          // themes. Two invariants encoded here:
          //  - `theme.id !== currentTheme` — a room whose entitlement was
          //    later revoked keeps its currently-picked tile usable.
          //  - `theme.id !== 'default'` inside the hasGameThemes clause —
          //    the always-free default tile is a game_themes non-row, so
          //    ownedGameThemes.has('default') is always false; without this
          //    guard the default would render as locked whenever the host's
          //    current pick is something else (e.g. a Whot host on
          //    'whot-neon' viewing the default tile). Not implied by the
          //    outer conjunct.
          const locked =
            theme.id !== currentTheme &&
            ((isMonopoly && !isMonopolyEditionAvailable(theme.id, ownedEditions)) ||
              (hasGameThemes && theme.id !== 'default' && !ownedGameThemes.has(theme.id)))
          // Price surfaced on the locked "Unlock — N" bar. Monopoly
          // themes carry a separate edition_slug (theme:'america' →
          // 'america'); per-game reskin slugs (whot-neon, …) are their
          // own catalog key.
          const priceCoins = locked
            ? isMonopoly
              ? editionPrices.get(MONOPOLY_THEME_TO_EDITION[theme.id] ?? theme.id)
              : gameThemePrices.get(theme.id)
            : undefined
          return (
            <ThemePreviewCard
              key={theme.id}
              theme={displayTheme}
              selected={currentTheme === theme.id}
              locked={locked}
              priceCoins={priceCoins}
              onClick={
                locked
                  ? () => router.push(`/shop?category=${isMonopoly ? 'edition' : 'theme'}`)
                  : () => void selectTheme(theme.id)
              }
              onPreview={() => setPreviewTheme(theme)}
            />
          )
        })}
      </div>
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
