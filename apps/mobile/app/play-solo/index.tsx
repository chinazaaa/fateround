/**
 * Solo-play hub (mobile).
 *
 * Mobile mirror of `src/app/play-solo/page.tsx`. Lists every `/play-solo/<slug>` screen so
 * practice-vs-bot has a way in from the home screen.
 *
 * The six solo screens shipped before this did: the ONLY navigation to them was
 * `CreateWizardShell`, which meant a player had to start creating a multiplayer game and
 * pick one of those six types before the app would offer to let them practise alone. Web
 * had a hub page, a footer index and a CTA on every game landing page; the app had none of
 * it. Rows come from `SOLO_PLAY_INDEX` so this and the create wizard can never disagree
 * about which games have a bot screen.
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
import { SOLO_PLAY_INDEX } from '@/lib/solo-play'

export default function SoloPlayHub() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Practice vs bot' }} />
      <AmbientBackground />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.emoji}>🤖</Text>
          <Text style={styles.title}>Practice vs bot</Text>
          <Text style={styles.blurb}>
            No room, no code, no waiting for friends. Play a full game against the computer — offline-friendly and
            scored to your profile.
          </Text>
        </View>

        <SurfaceCard padding={0} gap={0}>
          {SOLO_PLAY_INDEX.map((game, index) => (
            <ListRow
              key={game.slug}
              // Cast: expo-router's typed href doesn't know about the /play-solo routes
              // registered in _layout.tsx.
              onPress={() => router.push(`/play-solo/${game.slug}` as never)}
              divider={index < SOLO_PLAY_INDEX.length - 1}
              left={
                <View style={styles.badge}>
                  <Text style={styles.badgeEmoji}>{game.emoji}</Text>
                </View>
              }
              title={<Text style={styles.rowTitle}>{game.label}</Text>}
              subtitle={game.blurb}
              right={<Text style={[styles.chev, { color: theme.textFaint }]}>›</Text>}
            />
          ))}
        </SurfaceCard>

        <Text style={styles.footnote}>
          Want to play with people? Create a room from the home screen — every game here works multiplayer too.
        </Text>
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
      backgroundColor: theme.primary + '22',
    },
    badgeEmoji: { fontSize: 22 },
    rowTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800' },
    chev: { fontSize: 22, fontWeight: '600' },
    footnote: {
      color: theme.textFaint,
      fontSize: theme.type.caption.size,
      textAlign: 'center',
      paddingHorizontal: theme.space.sm,
    },
  })
