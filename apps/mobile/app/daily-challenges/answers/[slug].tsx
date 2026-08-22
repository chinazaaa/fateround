/**
 * Yesterday's (and previous days') daily-challenge answers (mobile).
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
 *
 * URL-driven date via `?date=YYYY-MM-DD` (Expo local search params) so prev/next-day nav
 * works the same as web. The server enforces the "strictly in the past" gate — the client
 * arrows just change the URL and let that rule stand.
 */

import { useEffect, useMemo, useState } from 'react'
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
  | {
      kind: 'wordSearch'
      label?: string
      grid: string[][]
      placements: { word: string; cells: { row: number; col: number }[] }[]
    }

type Reveal = { gameType: string; challengeDate: string; sections: Section[] }

const SUDOKU_SIZE = 9

/** Same cycling palette the web renderer uses for word-search word-path tints. */
const WORD_SEARCH_HIGHLIGHT_COLORS = [
  '#f43f5e',
  '#06b6d4',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#3b82f6',
  '#ec4899',
  '#14b8a6',
]

export default function DailyAnswersScreen() {
  const { slug, date } = useLocalSearchParams<{ slug: string; date?: string }>()
  const dateParam = typeof date === 'string' && date ? date : null
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
    setState('loading')
    setReveal(null)
    void (async () => {
      try {
        // Explicit ?date=… wins; otherwise the route defaults to yesterday. The server still
        // refuses any date that isn't strictly in the past, so passing one through is safe.
        const url = apiUrl(
          `/api/daily-challenges/${gameType}/answers${dateParam ? `?date=${dateParam}` : ''}`
        )
        const res = await fetch(url, { cache: 'no-store' })
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
  }, [gameType, dateParam])

  const label = gameType ? DAILY_GAME_LABELS[gameType] : 'Daily Challenge'
  const viewingDate = dateParam ?? reveal?.challengeDate ?? yesterdayWatSlug()
  const prevDateSlug = shiftDay(viewingDate, -1)
  const nextDateSlug = shiftDay(viewingDate, +1)
  const canGoNext = nextDateSlug < todayWatSlug()
  const heading = viewingDate === yesterdayWatSlug() ? `Yesterday's ${label} answers` : `${label} answers`

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AmbientBackground />
      <Stack.Screen options={{ title: 'Answers' }} />
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>{heading}</Text>
          <View style={styles.dateRow}>
            <Pressable
              style={styles.dateArrow}
              onPress={() =>
                router.replace(
                  `/daily-challenges/answers/${DAILY_GAME_TYPE_TO_SLUG[gameType!]}?date=${prevDateSlug}` as never
                )
              }
              disabled={!gameType}
              accessibilityRole="button"
              accessibilityLabel={`Previous day (${prevDateSlug})`}
            >
              <Text style={styles.dateArrowText}>‹</Text>
            </Pressable>
            <Text style={styles.sub}>
              {reveal ? formatDate(reveal.challengeDate) : formatDate(viewingDate)}
            </Text>
            <Pressable
              style={[styles.dateArrow, !canGoNext && styles.dateArrowDisabled]}
              disabled={!canGoNext || !gameType}
              onPress={() =>
                router.replace(
                  `/daily-challenges/answers/${DAILY_GAME_TYPE_TO_SLUG[gameType!]}?date=${nextDateSlug}` as never
                )
              }
              accessibilityRole="button"
              accessibilityLabel={canGoNext ? `Next day (${nextDateSlug})` : 'No next day'}
            >
              <Text style={[styles.dateArrowText, !canGoNext && styles.dateArrowTextDisabled]}>›</Text>
            </Pressable>
          </View>
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
                  const target = `/daily-challenges/answers/${DAILY_GAME_TYPE_TO_SLUG[gt]}${dateParam ? `?date=${dateParam}` : ''}`
                  router.replace(target as never)
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
            <Text style={styles.emptyTitle}>No answers to show for this date.</Text>
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
  // Cell -> first placement index that owns it (word-search only). Computed unconditionally to
  // stay within Rules of Hooks; it's an empty map for non-wordSearch sections.
  const cellOwner = useMemo(() => {
    const map = new Map<string, number>()
    if (section.kind !== 'wordSearch') return map
    section.placements.forEach((placement, pIdx) => {
      placement.cells.forEach((c) => {
        const key = `${c.row}-${c.col}`
        if (!map.has(key)) map.set(key, pIdx)
      })
    })
    return map
  }, [section])

  if (section.kind === 'wordSearch') {
    return (
      <SurfaceCard>
        {section.label ? <Text style={styles.sectionLabel}>{section.label}</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {section.grid.map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((cell, c) => {
                  const owner = cellOwner.get(`${r}-${c}`)
                  const color =
                    owner != null ? WORD_SEARCH_HIGHLIGHT_COLORS[owner % WORD_SEARCH_HIGHLIGHT_COLORS.length] : null
                  return (
                    <View
                      key={c}
                      style={[styles.cell, color ? { backgroundColor: withAlpha(color, 0.32) } : null]}
                    >
                      <Text style={styles.cellText}>{cell}</Text>
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.legend}>
          {section.placements.map((placement, i) => {
            const color = WORD_SEARCH_HIGHLIGHT_COLORS[i % WORD_SEARCH_HIGHLIGHT_COLORS.length]
            return (
              <View key={i} style={styles.legendChip}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendLabel}>{placement.word}</Text>
              </View>
            )
          })}
        </View>
      </SurfaceCard>
    )
  }

  if (section.kind === 'grid') {
    const cols = section.rows[0]?.length ?? 1
    const isSudoku = cols === SUDOKU_SIZE && section.rows.length === SUDOKU_SIZE
    return (
      <SurfaceCard>
        {section.label ? <Text style={styles.sectionLabel}>{section.label}</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {section.rows.map((row, r) => (
              <View key={r} style={[styles.gridRow, isSudoku && r > 0 && r % 3 === 0 && styles.sudokuThickRow]}>
                {row.map((cell, c) => (
                  <View
                    key={c}
                    style={[styles.cell, isSudoku && c > 0 && c % 3 === 0 && styles.sudokuThickCol]}
                  >
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

/** YYYY-MM-DD for today in WAT (UTC+1, no DST). */
function todayWatSlug(): string {
  const nowMs = Date.now() + 60 * 60 * 1000
  return new Date(nowMs).toISOString().slice(0, 10)
}

/** YYYY-MM-DD for yesterday in WAT. */
function yesterdayWatSlug(): string {
  return shiftDay(todayWatSlug(), -1)
}

/** Shift a YYYY-MM-DD string by N days (positive or negative). */
function shiftDay(date: string, delta: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Add an alpha channel to a hex colour without pulling in a colour library. */
function withAlpha(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha))
  const a = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    wrap: { padding: theme.space.md, gap: theme.space.md, paddingBottom: theme.space.xl },
    header: { alignItems: 'center', gap: 4, marginBottom: theme.space.xs },
    title: { color: theme.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    dateArrow: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    dateArrowDisabled: { opacity: 0.35 },
    dateArrowText: { color: theme.text, fontSize: 18, fontWeight: '700' },
    dateArrowTextDisabled: { color: theme.textMuted },
    sub: { color: theme.textMuted, fontSize: theme.type.caption.size, textAlign: 'center', minWidth: 160 },
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
    // 2px "thicker" divider every 3 rows/cols for sudoku, drawn as a margin so the border
    // colour reads correctly against the tile surface on both themes.
    sudokuThickRow: { marginTop: 2 },
    sudokuThickCol: { marginLeft: 2 },
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
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 6,
      columnGap: 10,
      marginTop: 10,
    },
    legendChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 999 },
    legendLabel: { color: theme.text, fontSize: 12, fontWeight: '700' },
    legendHint: { color: theme.textFaint, fontSize: 10, marginTop: 6 },
  })
