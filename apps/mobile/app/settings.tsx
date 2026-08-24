/**
 * Settings — one destination for everything a player would call "settings".
 *
 * WHY THIS SCREEN EXISTS. Settings used to live behind three separate doors, none of them
 * named Settings: device preferences in the Home ⚙ sheet, account settings at the bottom of
 * `/profile` (below an arbitrarily long per-game trophy list, so sign-out drifted further the
 * more you played), and identity in the ProfileChip sheet. Two of those doors sat side by side
 * in the same top bar and opened different things.
 *
 * The device/account split is real and worth keeping — one lives on this phone, the other
 * follows you to a new one — but no player holds that distinction in their head before they go
 * looking. So both are here, under headings that say which is which, rather than in separate
 * places a player has to already understand to find. Web does the same inside its Settings tab.
 *
 * See `docs/mobile-ia-audit-2026-08.md`.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { AccountSettingsSection } from '@/components/profile/AccountSettingsSection'
import { DevicePreferencesSection } from '@/components/settings/DevicePreferencesSection'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { fetchProfileGames, type ProfileMe } from '@/lib/profile-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileMe | null>(null)

  const load = useCallback(async () => {
    try {
      // Same endpoint /profile uses; only the profile half is needed here.
      setProfile((await fetchProfileGames()).profile)
    } catch {
      // Leave the last good profile on screen — device preferences still work without it.
    }
  }, [])

  // The handle can change from the daily-challenge name prompt, and sign-in happens on Home,
  // so re-read rather than trusting a mount-time snapshot.
  useRefreshOnFocus(load)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AmbientBackground />
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.pageTitle}>Settings</Text>

        {/* ── Account: follows you to another device ───────────────────── */}
        <AccountSettingsSection profile={profile} onChanged={() => void load()} />

        {/* ── This device only ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This device</Text>
          <SurfaceCard>
            <DevicePreferencesSection />
            <Text style={styles.hintFaint}>
              Saved on this phone only — they don&apos;t follow your account to another device.
            </Text>
          </SurfaceCard>
        </View>

        {/* Per-game-type push subscriptions live on their own screen — too much to inline, and
            it has its own quiet-hours controls. */}
        <AppButton
          label="Game notifications"
          tone="secondary"
          fullWidth
          onPress={() => router.push('/notifications' as never)}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    wrap: { padding: theme.space.md, gap: theme.space.md, paddingBottom: theme.space.xl },
    pageTitle: { color: theme.text, fontSize: 26, fontWeight: '900' },
    section: { gap: theme.space.sm },
    sectionTitle: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: theme.type.section.weight,
      marginTop: theme.space.sm,
    },
    hintFaint: { color: theme.textFaint, fontSize: theme.type.caption.size, marginTop: theme.space.sm },
  })
