import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { GameType } from '@fateround/shared'
import type { CreateThemeOption, ThemeId } from '@fateround/shared/create-themes'
import { CREATE_THEMES, MONOPOLY_EDITION_THEMES, themesForGameType } from '@fateround/shared/create-themes'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useOwnedGameThemes } from '@/hooks/useOwnedGameThemes'
import {
  isMonopolyEditionAvailable,
  MONOPOLY_THEME_TO_EDITION,
  useOwnedMonopolyEditions,
} from '@/hooks/useOwnedMonopolyEditions'
import { COIN_EVENTS, trackCoinEvent } from '@/lib/coins/analytics'

type Props = {
  gameType: GameType
  value: ThemeId
  onChange: (themeId: ThemeId) => void
}

/**
 * Extra Monopoly editions available in the shop but not in the base
 * shared theme list. Kept locally rather than in `@fateround/shared`
 * because they're rendered purely as locked "Unlock in Shop" tiles
 * here — the actual selection is server-gated by
 * `checkMonopolyEditionEntitlement` and the mobile picker cannot select
 * an edition the profile doesn't own anyway.
 */
const EXTRA_MONOPOLY_EDITIONS: CreateThemeOption[] = [
  { id: 'america' as ThemeId, label: 'USA', emoji: '🗽' },
  { id: 'christmas' as ThemeId, label: 'Christmas', emoji: '🎄' },
]

export function ThemePicker({ gameType, value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const isMonopoly = gameType === 'monopoly'
  const { available: ownedEditions, prices: editionPrices } = useOwnedMonopolyEditions()
  const { available: ownedGameThemes, prices: gameThemePrices } = useOwnedGameThemes(isMonopoly ? null : gameType)

  const options = useMemo(() => {
    if (isMonopoly) {
      // Base four editions plus the paid additions. Surface EVERY known
      // edition so unowned ones are discoverable as locked tiles — the
      // same discoverability shape as the web HostThemePicker (plan
      // §"UI surfaces" → tile grid, locked tiles).
      return [...MONOPOLY_EDITION_THEMES, ...EXTRA_MONOPOLY_EDITIONS]
    }
    // Non-monopoly: the shared themesForGameType() is the base list. The
    // current selection is ALWAYS preserved (three-branch preservation
    // guard, mirroring HostThemePicker.tsx lines 74–89):
    //   1. `theme.id === value` — a game whose stored theme was later
    //      narrowed out of the list stays usable (e.g. legacy 'america'
    //      on a picker that no longer surfaces it).
    //   2. `theme.id === 'default'` — the always-free default is not a
    //      game_themes row and must always be present.
    //   3. Any theme the shared list itself returns for this gameType.
    // Also fold in any catalog theme entries priced for this gameType
    // whose slug isn't in the shared list yet, so a new shop theme
    // shows up (locked) without a shared-package release.
    const base = themesForGameType(gameType)
    const knownIds = new Set(base.map((t) => t.id))
    // Match to a full CreateThemeOption from CREATE_THEMES for label/emoji.
    // Catalog theme rows for this gameType whose slug isn't already
    // rendered:
    const extras: CreateThemeOption[] = []
    for (const slug of gameThemePrices.keys()) {
      if (knownIds.has(slug as ThemeId)) continue
      const known = CREATE_THEMES.find((t) => t.id === slug)
      if (known) {
        extras.push(known)
        knownIds.add(known.id)
      }
    }
    const withExtras = [...base, ...extras]
    // Preserve the current pick if the narrowing dropped it.
    if (!knownIds.has(value)) {
      const currentKnown = CREATE_THEMES.find((t) => t.id === value)
      if (currentKnown) withExtras.push(currentKnown)
    }
    return withExtras
  }, [isMonopoly, gameType, value, gameThemePrices])

  const openShop = () => {
    trackCoinEvent(COIN_EVENTS.shopViewed, { entry_point: 'theme_picker_lock' })
    router.push('/shop' as never)
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{isMonopoly ? 'Edition' : 'Theme'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => {
          const selected = option.id === value
          // Lock unowned paid Monopoly editions / unowned paid per-game
          // themes. Never lock the currently-selected pick or the
          // free-forever 'default' tile — matches the web HostThemePicker
          // guard so a room whose entitlement was later revoked keeps
          // its currently-picked tile usable.
          const locked =
            !selected &&
            (isMonopoly
              ? !isMonopolyEditionAvailable(option.id, ownedEditions)
              : option.id !== 'default' && gameThemePrices.has(option.id) && !ownedGameThemes.has(option.id))
          const priceCoins = locked
            ? isMonopoly
              ? editionPrices.get(MONOPOLY_THEME_TO_EDITION[option.id] ?? option.id)
              : gameThemePrices.get(option.id)
            : undefined
          const onPress = locked ? openShop : () => onChange(option.id)
          return (
            <Pressable
              key={option.id}
              style={[styles.tile, selected && styles.tileSelected, locked && styles.tileLocked]}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={
                locked
                  ? priceCoins != null
                    ? `Unlock ${option.label} — ${priceCoins} coins`
                    : `Unlock ${option.label} in Shop`
                  : option.label
              }
            >
              <Text style={[styles.emoji, locked && styles.emojiLocked]}>{locked ? '🔒' : option.emoji}</Text>
              <Text
                style={[styles.label, selected && styles.labelSelected, locked && styles.labelLocked]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
              {locked ? (
                <Text style={styles.unlockLabel} numberOfLines={1}>
                  {priceCoins != null ? `🪙 ${priceCoins}` : 'Shop'}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm },
    heading: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    row: { gap: theme.space.sm, paddingVertical: 2 },
    tile: {
      width: 92,
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.xs,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      alignItems: 'center',
      gap: 4,
    },
    tileSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    tileLocked: {
      opacity: 0.75,
      backgroundColor: theme.surface,
    },
    emoji: { fontSize: 24 },
    emojiLocked: { fontSize: 22 },
    label: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 16,
    },
    labelSelected: { color: theme.primaryMuted },
    labelLocked: { color: theme.textFaint },
    unlockLabel: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 2,
    },
  })
