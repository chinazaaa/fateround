/**
 * Leaderboards hub (mobile).
 *
 * Mobile mirror of `src/app/leaderboard/page.tsx`. Three entry points —
 * Daily Challenges, Trophies, Community — matching the web hub. Each card
 * routes into its own screen; the community card lands on the existing
 * mobile /community screen (already ported from the web community
 * leaderboard) rather than a duplicate.
 */

import { StyleSheet, Text, View, ScrollView } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { centeredContent } from '@/constants/layout'

interface BoardEntry {
  href: string
  emoji: string
  title: string
  description: string
  accent: string
}

const BOARDS: BoardEntry[] = [
  {
    href: '/leaderboard/daily',
    emoji: '📅',
    title: 'Daily Challenges',
    description: "Today's top scores on each daily puzzle. New puzzles every day.",
    accent: '#6366f1',
  },
  {
    href: '/leaderboard/trophies',
    emoji: '🏆',
    title: 'Trophies',
    description: 'All-time rankings by trophy points earned across every game.',
    accent: '#d4a017',
  },
  {
    href: '/community',
    emoji: '👥',
    title: 'Community',
    description: 'Nightly winners from the WhatsApp community games.',
    accent: '#25D366',
  },
]

export default function LeaderboardHub() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Leaderboards' }} />
      <AmbientBackground />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.emoji}>🏆</Text>
          <Text style={styles.title}>Leaderboards</Text>
          <Text style={styles.blurb}>See who&apos;s on top.</Text>
        </View>

        <SurfaceCard padding={0} gap={0}>
          {BOARDS.map((b, i) => (
            <ListRow
              key={b.href}
              onPress={() => router.push(b.href as never)}
              divider={i < BOARDS.length - 1}
              left={
                <View style={[styles.badge, { backgroundColor: b.accent + '22' }]}>
                  <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                </View>
              }
              title={<Text style={styles.rowTitle}>{b.title}</Text>}
              subtitle={b.description}
              right={<Text style={[styles.chev, { color: theme.textFaint }]}>›</Text>}
            />
          ))}
        </SurfaceCard>
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
    hero: { alignItems: 'center', gap: 4, paddingTop: theme.space.sm },
    emoji: { fontSize: 38 },
    title: { color: theme.text, fontSize: theme.type.display.size, fontWeight: '800' },
    blurb: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeEmoji: { fontSize: 22 },
    rowTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800' },
    chev: { fontSize: 22, fontWeight: '600' },
  })
