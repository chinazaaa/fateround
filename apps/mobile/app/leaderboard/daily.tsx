/**
 * Daily Challenges leaderboard picker (mobile).
 *
 * Mobile mirror of `src/app/leaderboard/daily/page.tsx`. Grid of tiles —
 * one per daily game — that each open that game's leaderboard at
 * /daily-challenges/leaderboard/[slug].
 */

import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_LABELS,
  DAILY_GAME_TYPE_TO_SLUG,
} from '@/lib/daily-challenge'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { centeredContent } from '@/constants/layout'

export default function DailyLeaderboardPicker() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Daily Leaderboards' }} />
      <AmbientBackground />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.title}>Daily Challenges</Text>
          <Text style={styles.blurb}>Pick a puzzle to see today&apos;s top scores.</Text>
        </View>

        <View style={styles.grid}>
          {DAILY_CHALLENGE_GAME_TYPES.map((gt) => (
            <Pressable
              key={gt}
              onPress={() =>
                router.push(`/daily-challenges/leaderboard/${DAILY_GAME_TYPE_TO_SLUG[gt]}` as never)
              }
              style={[
                styles.tile,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Text style={styles.tileEmoji}>{DAILY_GAME_EMOJIS[gt]}</Text>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {DAILY_GAME_LABELS[gt]}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    container: {
      paddingHorizontal: theme.space.md,
      paddingTop: theme.space.md,
      paddingBottom: 40,
      gap: theme.space.md,
      ...centeredContent,
    },
    hero: { alignItems: 'center', gap: 4 },
    title: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    blurb: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: {
      width: '31%',
      minHeight: 88,
      paddingVertical: 14,
      paddingHorizontal: 6,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    tileEmoji: { fontSize: 24 },
    tileLabel: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
  })
