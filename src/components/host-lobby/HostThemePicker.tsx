'use client'

import { useMemo, useState } from 'react'
import type { Game } from '@/types'
import { THEMES, type ThemeId } from '@/lib/themes'
import { MONOPOLY_EDITIONS } from '@/components/monopoly/monopoly-themes'
import { ThemePreviewCard, ThemePreviewModal } from '@/components/ThemePreviewModal'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { useToast } from '@/components/ui/Toast'

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

  const currentTheme = (game.theme as ThemeId | null | undefined) ?? 'default'

  const options = useMemo(() => {
    if (isMonopoly) return THEMES.filter((theme) => MONOPOLY_EDITIONS.some((e) => e.themeId === theme.id))
    if (game.game_type === 'ping_pong') {
      return THEMES.filter((theme) => theme.id === 'default' || theme.id === 'grass_court').map((theme) =>
        theme.id === 'default'
          ? {
              ...theme,
              label: 'Table Tennis',
              emoji: '🏓',
              preview: { bg: '#064e3b', accent: '#f43f5e', text: '#ecfdf5' },
            }
          : theme
      )
    }
    return THEMES.filter((theme) => theme.id !== 'pirate' && theme.id !== 'arctic' && theme.id !== 'naija')
  }, [isMonopoly, game.game_type])

  const selectTheme = async (themeId: ThemeId) => {
    if (saving || themeId === currentTheme) return
    setSaving(themeId)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
