/**
 * Yesterday's daily-challenge answers (mobile).
 *
 * Native port of `src/components/daily/DailyAnswersClient.tsx`, reading the same
 * `/api/daily-challenges/[gameType]/answers` route — so both platforms show identical answers
 * and neither can be coaxed into showing a live puzzle. The route refuses any date that is not
 * strictly in the past (WAT), which is the whole safety model: by the time answers are visible,
 * that puzzle can no longer be scored.
 *
 * A screen of its own rather than a panel on the results card, for the reason that decides it:
 * the answers a player wants are for the puzzle they JUST played, and those aren't available
 * until tomorrow. Inline would promise the wrong thing; a screen titled with the date it
 * belongs to can't be misread.
 */

import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl } from '@/lib/config'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_LABELS,
  DAILY_GAME_SLUG_TO_TYPE,
  DAILY_GAME_TYPE_TO_SLUG,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Section =
  | { kind: 'lines'; label?: string; items: { label?: string; value: string }[] }
  | { kind: 'grid'; label?: string; rows: string[][] }
type Reveal = { gameType: string; challengeDate: string; sections: Section[] }

export default function DailyAnswersScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)

  const gameType = DAILY_GAME_SLUG_TO_TYPE[String(slug)] as DailyChallengeGameType | undefined
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading')

  useEffect(() => {
    if (!gameType) {
      setState('empty')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        // No date param: the route defaults to yesterday, the only one worth linking to.
        const res = await fetch(apiUrl(`/api/daily-challenges/${gameType}/answers`), { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setState('empty')
          return
        }
        const data = (await res.json()) as Reveal
        if (cancelled) return
        setReveal(data)
        setState('ready')
      } catch {
        if (!cancelled) setState('empty')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameType])

  const label = gameType ? DAILY_GAME_LABELS[gameType] : 'Daily Challenge'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AmbientBackground />
      <Stack.Screen options={{ title: 'Answers' }} />
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Yesterday&apos;s {label} answers</Text>
          <Text style={styles.sub}>
            {reveal ? formatDate(reveal.challengeDate) : 'Published a day after each puzzle closes.'}
          </Text>
        </View>

        {/* Game chips, mirroring the leaderboard screen. Without them, arriving from the hub
          would strand you on whichever game the link happened to name. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
            const active = gt === gameType
            return (
              <Pressable
                key={gt}
                onPress={() => {
                  if (active) return
                  router.replace(`/daily-challenges/answers/${DAILY_GAME_TYPE_TO_SLUG[gt]}` as never)
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>
                  {DAILY_GAME_EMOJIS[gt]} {DAILY_GAME_LABELS[gt]}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {state === 'loading' ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : state === 'empty' || !reveal ? (
          <SurfaceCard>
            <Text style={styles.emptyTitle}>No answers to show yet.</Text>
            <Text style={styles.emptyBody}>
              Answers go up the day after a puzzle closes, so today&apos;s stay secret until tomorrow.
            </Text>
          </SurfaceCard>
        ) : (
          reveal.sections.map((section, i) => <SectionCard key={i} section={section} />)
        )}

        {gameType ? (
          <AppButton
            label={`Play today's ${label}`}
            fullWidth
            onPress={() => router.replace(`/daily-challenges/${slug}` as never)}
          />
        ) : null}
        <AppButton
          label="Back to Daily Challenges"
          tone="ghost"
          fullWidth
          onPress={() => router.replace('/daily-challenges' as never)}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function SectionCard({ section }: { section: Section }) {
  const styles = useThemedStyles(makeStyles)

  if (section.kind === 'grid') {
    return (
      <SurfaceCard>
        {section.label ? <Text style={styles.sectionLabel}>{section.label}</Text> : null}
        {/* Scrolls inside its own box — a 9×9 grid must not widen the screen. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {section.rows.map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((cell, c) => (
                  <View key={c} style={styles.cell}>
                    <Text style={styles.cellText}>{cell}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </SurfaceCard>
    )
  }

  return (
    <SurfaceCard>
      {section.label ? <Text style={styles.sectionLabel}>{section.label}</Text> : null}
      <View style={styles.lines}>
        {section.items.map((item, i) => (
          <View key={i} style={styles.line}>
            {item.label ? (
              <Text style={styles.lineLabel} numberOfLines={2}>
                {item.label}
              </Text>
            ) : null}
            <Text style={styles.lineValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </SurfaceCard>
  )
}

function formatDate(date: string): string {
  // Formatted in UTC: the string is already a WAT calendar date, so letting the device zone
  // reinterpret it would show the wrong day either side of midnight.
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    wrap: { padding: theme.space.md, gap: theme.space.md, paddingBottom: theme.space.xl },
    header: { alignItems: 'center', gap: 4, marginBottom: theme.space.xs },
    title: { color: theme.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    sub: { color: theme.textMuted, fontSize: theme.type.caption.size, textAlign: 'center' },
    loading: { marginVertical: theme.space.xl },
    chipsRow: { gap: 6, paddingVertical: 2 },
    chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
    // White on the solid rose chip — intentional, correct in both schemes.
    chipText: { fontSize: 12, fontWeight: '700' },
    emptyTitle: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700', textAlign: 'center' },
    emptyBody: {
      color: theme.textFaint,
      fontSize: theme.type.caption.size,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    lines: { gap: 6 },
    line: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
    lineLabel: { color: theme.textMuted, fontSize: theme.type.caption.size, flex: 1, minWidth: 0 },
    lineValue: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '800' },
    gridRow: { flexDirection: 'row' },
    cell: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
    },
    cellText: { color: theme.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  })
