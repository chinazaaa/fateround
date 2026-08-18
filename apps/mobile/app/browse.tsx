/**
 * Browse — public games feed (mobile).
 *
 * Mirror of the web /browse page (src/app/browse/page.tsx). Reuses the same
 * cursor-paginated GET /api/games endpoint. Two tabs (Phase A + C):
 *   - Live now  — status='waiting' | 'active'
 *   - Upcoming  — status='scheduled' (from Phase C)
 */

import { useState } from 'react'
import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { BrowseGamesList } from '@/components/browse/BrowseGamesList'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export default function BrowseScreen() {
  const styles = useThemedStyles(makeStyles)
  const [tab, setTab] = useState<'live' | 'upcoming'>('live')
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Browse' }} />
      <AmbientBackground />
      <View style={styles.hero}>
        <Text style={styles.kicker}>🌐 Public games</Text>
        <Text style={styles.title}>{tab === 'live' ? 'Live now' : 'Upcoming'}</Text>
        <Text style={styles.blurb}>
          {tab === 'live'
            ? 'Games anyone can jump into right now.'
            : 'Games scheduled to open soon — RSVP and get a ping when they open.'}
        </Text>
      </View>
      <View style={styles.tabs}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'live', label: 'Live now' },
            { value: 'upcoming', label: 'Upcoming' },
          ]}
        />
      </View>
      <BrowseGamesList tab={tab} />
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
    tabs: { paddingHorizontal: theme.space.md, paddingTop: theme.space.sm },
  })
