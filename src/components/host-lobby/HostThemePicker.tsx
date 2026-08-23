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
import { authHeaders } from '@/lib/identity'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  /** Optional — callers that don't poll/subscribe can sync immediately; others (e.g. the
   *  central HostLobby sheet) pick up `game.theme` on their own. */
  onGameUpdate?: (game: Game) => void
}

/**
 * Lobby theme/edition editor. Monopoly maps themes to named board editions; every
 * other themed game shows the shared visual themes. Saves via PATCH /api/games/[code]
 * (theme is only editable while waiting/finished, enforced server-side).
 */
export function HostThemePicker({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const isMonopoly = game.game_type === 'monopoly'
  const [saving, setSaving] = useState<ThemeId | null>(null)
  const [previewTheme, setPreviewTheme] = useState<(typeof THEMES)[number] | null>(null)
  const { available: ownedEditions } = useOwnedMonopolyEditions()

  const currentTheme = (game.theme as ThemeId | null | undefined) ?? 'default'

  const options = useMemo(() => {
    if (isMonopoly) {
      // Ownership gate: paid editions (e.g. USA, 800 coins) only show once the
      // host has purchased them; free grandfathered editions always show. The
      // current theme is never hidden, so a host who created the room before
      // an edition was revoked from their catalog can still see what they
      // picked without an unresolved chip.
      return THEMES.filter(
        (theme) =>
          MONOPOLY_EDITIONS.some((e) => e.themeId === theme.id) &&
          (theme.id === currentTheme || isMonopolyEditionAvailable(theme.id, ownedEditions))
      )
    }
    return THEMES.filter(
      (theme) => theme.id !== 'pirate' && theme.id !== 'arctic' && theme.id !== 'naija' && theme.id !== 'america'
    )
  }, [isMonopoly, ownedEditions, currentTheme])

  // Paid Monopoly editions the host doesn't own (and isn't currently using).
  // Drives the "More editions in the Shop" nudge below the picker so hosts
  // learn USA (and future editions) exist even when they've never opened
  // /shop directly. Free grandfathered editions never count — everyone
  // already has them.
  const hasUnownedPaidEditions = useMemo(() => {
    if (!isMonopoly) return false
    return MONOPOLY_EDITIONS.some(
      (e) =>
        e.themeId !== currentTheme &&
        !isMonopolyEditionAvailable(e.themeId as ThemeId, ownedEditions) &&
        // isMonopolyEditionAvailable returns true for free editions too;
        // this branch is only reached for paid ones the host lacks.
        true
    )
  }, [isMonopoly, ownedEditions, currentTheme])

  const selectTheme = async (themeId: ThemeId) => {
    if (saving || themeId === currentTheme) return
    setSaving(themeId)
    try {
      // Send the bearer token alongside hostToken so the server can identify
      // the signed-in profile for the paid-edition entitlement check. Games
      // created before sign-in have host_user_id = null, and without a
      // bearer the server would 401 a legitimate USA pick just because the
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

  return (
    <HostLobbySettingBlock title={isMonopoly ? 'Edition' : 'Theme'} className="sm:col-span-2">
      <div
        className={`grid ${isMonopoly ? 'grid-cols-2 max-w-sm sm:max-w-md' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'} gap-1.5 sm:gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}
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
