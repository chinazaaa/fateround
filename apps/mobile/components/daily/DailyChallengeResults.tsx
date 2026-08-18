/**
 * Post-play results screen shared by every native daily-challenge game.
 * Simplified mobile port of `src/components/daily/DailyChallengeResults.tsx` —
 * skips the HTML-canvas share card (that's a web-only pipeline) and instead
 * hands the user a plain-text share via React Native's Share API.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Share, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { DailyNamePrompt } from '@/components/daily/DailyNamePrompt'
import type { DailyChallengeResult } from '@/hooks/useDailyChallengeSession'
import {
  DAILY_GAME_EMOJIS,
  DAILY_GAME_LABELS,
  DAILY_GAME_PRIMARY_METRIC,
  DAILY_GAME_TYPE_TO_SLUG,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  gameType: DailyChallengeGameType
  result: DailyChallengeResult | null
  previousScore: Record<string, unknown> | null
  challengeNumber: number
  submitting: boolean
  onBackToHub: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Count-up animation for the hero score — pure cosmetic. */
function useAnimatedScore(target: number) {
  const [display, setDisplay] = useState(0)
  const animRef = useRef(new Animated.Value(0))

  useEffect(() => {
    if (target === 0) {
      setDisplay(0)
      return
    }
    animRef.current.setValue(0)
    const id = animRef.current.addListener(({ value }) => {
      setDisplay(Math.round(value * target))
    })
    Animated.timing(animRef.current, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
    return () => animRef.current.removeListener(id)
  }, [target])

  return display
}

export function DailyChallengeResults({
  gameType,
  result,
  previousScore,
  challengeNumber,
  submitting,
  onBackToHub,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()
  const slug = DAILY_GAME_TYPE_TO_SLUG[gameType]

  const isPointsGame = DAILY_GAME_PRIMARY_METRIC[gameType] === 'score'
  const normalized = result?.normalizedScore ?? (previousScore?.normalized_score as number | undefined) ?? 0
  const rawPoints = result?.rawPoints ?? (previousScore?.raw_points as number | undefined) ?? 0
  const score = isPointsGame ? rawPoints : normalized
  const rank = result?.rank ?? null
  const totalPlayers = result?.totalPlayers ?? null
  const timeSeconds = result?.timeSeconds ?? (previousScore?.time_seconds as number | undefined) ?? 0
  const itemsSolved = result?.itemsSolved ?? (previousScore?.items_solved as number | undefined) ?? 0
  const itemsTotal = result?.itemsTotal ?? (previousScore?.items_total as number | undefined) ?? 0
  const isNewBest = result?.isNewBest ?? false
  const grid = result?.grid ?? (previousScore?.grid as string | undefined) ?? ''

  const animated = useAnimatedScore(score)

  const share = useCallback(async () => {
    const lines = [
      `FateRound Daily ${DAILY_GAME_LABELS[gameType]} #${challengeNumber}`,
      `Score: ${score}${isPointsGame ? ' pts' : '/1000'} · Time: ${formatTime(timeSeconds)}`,
      grid || null,
      rank && totalPlayers ? `Rank: #${rank} of ${totalPlayers}` : null,
      `${shareDomain()}/daily-challenges/${slug}`,
    ]
    const text = lines.filter(Boolean).join('\n')
    try {
      await Share.share({ message: text })
    } catch {
      /* user dismissed sheet */
    }
  }, [challengeNumber, gameType, grid, isPointsGame, rank, score, slug, timeSeconds, totalPlayers])

  if (submitting) {
    return (
      <View style={styles.submittingWrap}>
        <Text style={styles.submitting}>Calculating your score…</Text>
      </View>
    )
  }

  const itemsLabel = gameType === 'trivia' ? 'Correct' : gameType === 'wordle' ? 'Guesses' : 'Solved'

  return (
    <View style={styles.wrap}>
      <SurfaceCard elevation="raised" padding={20}>
        <View style={styles.center}>
          <Text style={styles.emoji}>{DAILY_GAME_EMOJIS[gameType]}</Text>
          <Text style={styles.kicker}>
            Daily {DAILY_GAME_LABELS[gameType]} #{challengeNumber}
          </Text>
          <View style={styles.scoreRow}>
            <Text style={[styles.score, { color: theme.primary }]}>{animated}</Text>
            <Text style={styles.scoreUnit}>{isPointsGame ? 'pts' : '/ 1000'}</Text>
          </View>
          {isNewBest && score > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.borderAccent }]}>
              <Text style={[styles.badgeText, { color: theme.primary }]}>★ New personal best</Text>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={[styles.stat, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={styles.statValue}>{formatTime(timeSeconds)}</Text>
              <Text style={styles.statLabel}>Time</Text>
            </View>
            <View style={[styles.stat, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={styles.statValue}>
                {itemsSolved}/{itemsTotal}
              </Text>
              <Text style={styles.statLabel}>{itemsLabel}</Text>
            </View>
            {rank && score > 0 ? (
              <View style={[styles.stat, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={styles.statValue}>#{rank}</Text>
                <Text style={styles.statLabel}>of {totalPlayers ?? '—'}</Text>
              </View>
            ) : null}
          </View>

          {score === 0 ? (
            <Text style={styles.zeroNote}>Scores of 0 don&apos;t appear on the leaderboard.</Text>
          ) : null}

          {grid ? <Text style={styles.grid}>{grid}</Text> : null}

          {/* Same slot the web finish screen uses — nudges a first-time player
              to pick a name so their leaderboard row isn't the auto handle. */}
          <View style={styles.nameSlot}>
            <DailyNamePrompt />
          </View>
        </View>
      </SurfaceCard>

      <AppButton
        label="View leaderboard"
        fullWidth
        onPress={() => router.push(`/daily-challenges/leaderboard/${slug}` as never)}
      />
      <AppButton label="Share result" tone="secondary" fullWidth onPress={() => void share()} />
      <AppButton label="Back to Daily Challenges" tone="ghost" fullWidth onPress={onBackToHub} />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { padding: theme.space.md, gap: theme.space.md },
    center: { alignItems: 'center', gap: 6 },
    emoji: { fontSize: 44 },
    kicker: {
      color: theme.textFaint,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 },
    score: { fontSize: 56, fontWeight: '900', fontVariant: ['tabular-nums'] },
    scoreUnit: { color: theme.textFaint, fontSize: theme.type.body.size, fontWeight: '600', paddingBottom: 12 },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      marginTop: 8,
    },
    badgeText: { fontSize: 12, fontWeight: '700' },
    statsRow: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
    stat: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    statValue: { color: theme.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
    statLabel: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: 4,
    },
    zeroNote: { color: theme.textMuted, fontSize: theme.type.caption.size, marginTop: 12, textAlign: 'center' },
    nameSlot: { alignSelf: 'stretch', marginTop: 18 },
    grid: {
      color: theme.text,
      fontFamily: 'Menlo',
      fontSize: 20,
      lineHeight: 24,
      marginTop: 16,
      textAlign: 'center',
    },
    submittingWrap: { paddingVertical: 60, alignItems: 'center' },
    submitting: { color: theme.textMuted, fontSize: theme.type.body.size },
  })
