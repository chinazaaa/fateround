'use client'

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

/**
 * Lobby theme/edition editor. Monopoly maps themes to named board editions; Troll Run shows
 * the palettes its canvas can actually render; every other themed game shows the shared visual
 * themes. Saves via PATCH /api/games/[code] (theme is only editable while waiting/finished,
 * enforced server-side).
 */
export function HostThemePicker({ gameCode, hostToken, game, onGameUpdate }: Props) {
  const { error: toastError } = useToast()
  const isMonopoly = game.game_type === 'monopoly'
  const isTrollRun = game.game_type === 'troll_run'
  const [saving, setSaving] = useState<ThemeId | null>(null)
  const [previewTheme, setPreviewTheme] = useState<(typeof THEMES)[number] | null>(null)

  const storedTheme = (game.theme as ThemeId | null | undefined) ?? 'default'
  // A Troll Run game created without touching Visual Palette carries theme 'default', which the
  // canvas renders as dark via its fallback. Show dark as the live selection so the picker
  // reflects what is actually on screen instead of leaving all three cards unselected.
  const currentTheme: ThemeId =
    isTrollRun && !TROLL_RUN_PALETTES.some((palette) => palette.id === storedTheme) ? 'dark' : storedTheme

  const options = useMemo(() => {
    if (isMonopoly) return THEMES.filter((theme) => MONOPOLY_EDITIONS.some((edition) => edition.themeId === theme.id))
    return THEMES.filter((theme) => theme.id !== 'pirate' && theme.id !== 'arctic' && theme.id !== 'naija')
  }, [isMonopoly])

  const selectTheme = async (themeId: ThemeId) => {
    // Compared against the stored value, not the displayed one: a Troll Run game sitting on
    // 'default' displays dark, and clicking Dark Slate must still persist so the page chrome
    // lines up with the canvas instead of staying on the default palette.
    if (saving || themeId === storedTheme) return
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

  return (
    <HostLobbySettingBlock title={isMonopoly ? 'Edition' : 'Theme'} className="sm:col-span-2">
      <div
        className={`grid ${isMonopoly ? 'grid-cols-2 max-w-sm sm:max-w-md' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'} gap-1.5 sm:gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}
      >
        {options.map((theme) => {
          const edition = isMonopoly ? MONOPOLY_EDITIONS.find((item) => item.themeId === theme.id) : null
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
