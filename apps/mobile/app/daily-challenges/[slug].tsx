/**
 * Daily challenge play surface (mobile). One dynamic route drives every
 * per-game screen — mirror of `src/app/daily-challenges/[gameType]/page.tsx`
 * plus `DailyChallengeGame` on web.
 *
 * If the requested game type does not have a native play surface yet, the
 * hub already opens the web URL via Linking; landing here for that game
 * means someone deep-linked in, so we redirect straight back to the hub
 * rather than error.
 */

import { useCallback } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { DailyChallengeResults } from '@/components/daily/DailyChallengeResults'
import { DailyTriviaPlay } from '@/components/daily/DailyTriviaPlay'
import { DailyWordScramblePlay } from '@/components/daily/DailyWordScramblePlay'
import { DailySudokuPlay } from '@/components/daily/DailySudokuPlay'
import { DailyWordlePlay } from '@/components/daily/DailyWordlePlay'
import { useDailyChallengeSession } from '@/hooks/useDailyChallengeSession'
import {
  DAILY_GAME_EMOJIS,
  DAILY_GAME_LABELS,
  DAILY_GAME_SLUG_TO_TYPE,
  DAILY_GAME_TIMER,
  hasNativeDailyPlay,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { formatDayLabel } from '@/lib/community-dates'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useThemedStyles, useTheme } from '@/constants/theme-context'

export default function DailyChallengePlay() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const params = useLocalSearchParams<{ slug: string }>()
  const slug = typeof params.slug === 'string' ? params.slug : ''
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug] as DailyChallengeGameType | undefined

  const backToHub = useCallback(() => {
    // Prefer pop over replace so the stack stays anchored to the hub the user
    // came from. Falls back to replace when this route was cold-started.
    if (router.canGoBack()) router.back()
    else router.replace('/daily-challenges' as never)
  }, [router])

  if (!gameType) return <NotFound onBack={backToHub} />
  if (!hasNativeDailyPlay(gameType)) return <NotYetPorted gameType={gameType} onBack={backToHub} />

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: DAILY_GAME_LABELS[gameType] }} />
      <AmbientBackground />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <GameBody gameType={gameType} onBackToHub={backToHub} />
      </ScrollView>
    </SafeAreaView>
  )
}

function GameBody({ gameType, onBackToHub }: { gameType: DailyChallengeGameType; onBackToHub: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const session = useDailyChallengeSession(gameType)
  const { phase, challengeData, result, previousScore, error, launchDate, submitResult } = session

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primaryMuted} size="large" />
        <Text style={styles.centerText}>Loading Daily {DAILY_GAME_LABELS[gameType]}…</Text>
      </View>
    )
  }

  if (phase === 'notLive') {
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>{DAILY_GAME_EMOJIS[gameType]}</Text>
        <Text style={styles.headline}>
          Daily Challenge starts {launchDate ? formatDayLabel(launchDate) : 'soon'}
        </Text>
        <Text style={styles.centerText}>
          Come back on launch day for Daily {DAILY_GAME_LABELS[gameType]} — same puzzle for everyone, one attempt.
        </Text>
        <AppButton label="Back to Daily Challenges" tone="secondary" onPress={onBackToHub} />
      </View>
    )
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.headline}>Something went wrong</Text>
        <Text style={styles.centerText}>{error ?? 'Please try again later.'}</Text>
        <AppButton label="Back to Daily Challenges" tone="secondary" onPress={onBackToHub} />
      </View>
    )
  }

  if (phase === 'results' || phase === 'submitting') {
    return (
      <DailyChallengeResults
        gameType={gameType}
        result={result}
        previousScore={previousScore}
        challengeNumber={challengeData?.challengeNumber ?? 0}
        submitting={phase === 'submitting'}
        onBackToHub={onBackToHub}
      />
    )
  }

  if (!challengeData) {
    return (
      <View style={styles.center}>
        <Text style={styles.headline}>No challenge data</Text>
        <AppButton label="Back to Daily Challenges" tone="secondary" onPress={onBackToHub} />
      </View>
    )
  }

  const timer = DAILY_GAME_TIMER[gameType] ?? (challengeData.config.timer as number | undefined) ?? 300

  return (
    <View style={styles.playWrap}>
      <View style={styles.playHeader}>
        <Text style={styles.emoji}>{DAILY_GAME_EMOJIS[gameType]}</Text>
        <Text style={styles.playTitle}>
          Daily {DAILY_GAME_LABELS[gameType]} #{challengeData.challengeNumber}
        </Text>
        <Text style={styles.playSubtitle}>Same puzzle for everyone. One attempt.</Text>
      </View>

      <PlaySurface
        gameType={gameType}
        challengeId={challengeData.challengeId}
        puzzle={challengeData.puzzle}
        timer={timer}
        onSubmit={submitResult}
      />
    </View>
  )
}

function PlaySurface({
  gameType,
  challengeId,
  puzzle,
  timer,
  onSubmit,
}: {
  gameType: DailyChallengeGameType
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}) {
  switch (gameType) {
    case 'trivia':
      return <DailyTriviaPlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'word_scramble':
      return <DailyWordScramblePlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'sudoku':
      return (
        <DailySudokuPlay
          challengeId={challengeId}
          puzzle={puzzle.puzzle as number[][]}
          timer={timer}
          onSubmit={onSubmit}
        />
      )
    case 'wordle':
      return <DailyWordlePlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    default:
      // Compile-time safety: any gameType listed in NATIVE_DAILY_GAMES but
      // missing from this switch is a bug in the registry. Runtime fallback
      // still keeps the user unstuck instead of crashing.
      return (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text>This daily game is not yet available on mobile.</Text>
        </View>
      )
  }
}

function NotYetPorted({ gameType, onBack }: { gameType: DailyChallengeGameType; onBack: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: DAILY_GAME_LABELS[gameType] }} />
      <AmbientBackground />
      <View style={styles.center}>
        <Text style={styles.emoji}>{DAILY_GAME_EMOJIS[gameType]}</Text>
        <Text style={styles.headline}>Daily {DAILY_GAME_LABELS[gameType]}</Text>
        <Text style={styles.centerText}>
          This puzzle isn&apos;t available in the mobile app yet. Open it on the web to play today.
        </Text>
        <AppButton label="Back to Daily Challenges" tone="secondary" onPress={onBack} />
      </View>
    </SafeAreaView>
  )
}

function NotFound({ onBack }: { onBack: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Not found' }} />
      <View style={styles.center}>
        <Text style={styles.headline}>Game not found</Text>
        <Text style={styles.centerText}>This daily challenge type doesn&apos;t exist.</Text>
        <AppButton label="Back to Daily Challenges" tone="secondary" onPress={onBack} />
      </View>
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    container: { paddingBottom: 40, ...centeredContent },
    playWrap: { gap: theme.space.md },
    playHeader: { alignItems: 'center', paddingTop: theme.space.md, gap: 6 },
    playTitle: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    playSubtitle: { color: theme.textMuted, fontSize: theme.type.body.size },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: theme.space.lg,
      minHeight: 360,
    },
    centerText: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    headline: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800', textAlign: 'center' },
    emoji: { fontSize: 44 },
  })
