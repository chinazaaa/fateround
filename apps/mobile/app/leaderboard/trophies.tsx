/**
 * Trophy Leaderboard (mobile).
 *
 * Mobile mirror of `src/app/leaderboard/trophies/page.tsx`. Reads the
 * same public `/api/leaderboard/trophies` endpoint; renders top 3 as a
 * podium row and the rest as a ranked list, matching the web treatment.
 * No auth required — the endpoint is a public read.
 */

import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { centeredContent } from '@/constants/layout'

interface TrophyEntry {
  rank: number
  handle: string | null
  trophyPoints: number
  trophyLevel: number
  currentStreak: number
  longestStreak: number
}

const PODIUM_TINTS = ['#d4a017', '#8e9099', '#a4682d']

export default function TrophyLeaderboard() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [entries, setEntries] = useState<TrophyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(apiUrl('/api/leaderboard/trophies'))
        const data = (await res.json()) as { entries?: TrophyEntry[]; error?: string }
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? 'Failed to load')
          return
        }
        setEntries(data.entries ?? [])
      } catch {
        if (!cancelled) setError('Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Trophies' }} />
      <AmbientBackground />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.title}>Trophy Leaderboard</Text>
          <Text style={styles.blurb}>Top players ranked by trophy points.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primaryMuted} style={{ marginTop: 30 }} />
        ) : error ? (
          <SurfaceCard padding={20}>
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </SurfaceCard>
        ) : entries.length === 0 ? (
          <SurfaceCard padding={20}>
            <Text style={styles.emptyText}>
              No trophy holders yet. Play games and earn trophies to appear here.
            </Text>
          </SurfaceCard>
        ) : (
          <>
            {/* Top-3 podium row */}
            <View style={styles.podiumRow}>
              {entries.slice(0, 3).map((e) => {
                const tint = PODIUM_TINTS[e.rank - 1] ?? theme.textMuted
                return (
                  <View
                    key={e.rank}
                    style={[
                      styles.podiumCard,
                      { borderColor: tint + '55', backgroundColor: theme.surface },
                    ]}
                  >
                    <View style={[styles.podiumBadge, { backgroundColor: tint + '2a' }]}>
                      <Text style={[styles.podiumRank, { color: tint }]}>{e.rank}</Text>
                    </View>
                    <Text style={styles.podiumHandle} numberOfLines={1}>
                      {e.handle ?? 'Anonymous'}
                    </Text>
                    <Text style={[styles.podiumPoints, { color: tint }]}>{e.trophyPoints} pts</Text>
                    <Text style={styles.podiumMeta}>
                      Level {e.trophyLevel}
                      {e.currentStreak > 0 ? ` · ${e.currentStreak}d` : ''}
                    </Text>
                  </View>
                )
              })}
            </View>

            {/* Rest of the list */}
            {entries.length > 3 ? (
              <SurfaceCard padding={0} gap={0}>
                {entries.slice(3).map((e, i) => (
                  <View
                    key={e.rank}
                    style={[
                      styles.row,
                      { borderColor: theme.border, borderBottomWidth: i < entries.length - 4 ? StyleSheet.hairlineWidth : 0 },
                    ]}
                  >
                    <Text style={[styles.rowRank, { color: theme.textFaint }]}>{e.rank}</Text>
                    <Text style={styles.rowHandle} numberOfLines={1}>
                      {e.handle ?? 'Anonymous'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Level {e.trophyLevel}
                      {e.currentStreak > 0 ? ` · ${e.currentStreak}d` : ''}
                    </Text>
                    <Text style={styles.rowPoints}>{e.trophyPoints} pts</Text>
                  </View>
                ))}
              </SurfaceCard>
            ) : null}
          </>
        )}
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
    errorText: { fontSize: theme.type.body.size, textAlign: 'center' },
    emptyText: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    podiumRow: { flexDirection: 'row', gap: 8 },
    podiumCard: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      gap: 4,
    },
    podiumBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    podiumRank: { fontSize: 14, fontWeight: '800' },
    podiumHandle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800', textAlign: 'center' },
    podiumPoints: { fontSize: theme.type.body.size, fontWeight: '700' },
    podiumMeta: { color: theme.textFaint, fontSize: 11, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowRank: { width: 28, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    rowHandle: { flex: 1, color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    rowMeta: { color: theme.textFaint, fontSize: 11 },
    rowPoints: { color: theme.textMuted, fontSize: theme.type.body.size, fontWeight: '700' },
  })
