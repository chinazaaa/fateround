/**
 * Browse — public games feed (mobile).
 *
 * Mirror of the web /browse page (src/app/browse/page.tsx). Reuses the same
 * cursor-paginated GET /api/games endpoint. All list + realtime + chip-strip
 * behaviour lives in BrowseGamesList so the same list can be reused in the
 * Home "Live games" preview.
 */

import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { BrowseGamesList } from '@/components/browse/BrowseGamesList'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export default function BrowseScreen() {
  const styles = useThemedStyles(makeStyles)
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Browse' }} />
      <AmbientBackground />
      <View style={styles.hero}>
        <Text style={styles.kicker}>🌐 Public games</Text>
        <Text style={styles.title}>Live now</Text>
        <Text style={styles.blurb}>
          Games anyone can jump into right now. Hosts choose to list a game publicly — private games stay code-only.
        </Text>
      </View>
      <BrowseGamesList />
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    hero: {
      paddingHorizontal: theme.space.md,
      paddingTop: theme.space.md,
      gap: 2,
      alignItems: 'center',
    },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    blurb: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      textAlign: 'center',
      maxWidth: 340,
      marginTop: 4,
    },
  })
