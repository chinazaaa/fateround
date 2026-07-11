import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY } from '@fateround/shared/memory-match'

// Memory-match uses a fixed, functional palette (same accents as the web view)
// rather than theme tokens, so the board reads identically in light and dark.
const ACCENT = {
  score: '#f59e0b',
  pairs: '#22c55e',
  streak: '#f97316',
  miss: '#ef4444',
}

type CardState = 'hidden' | 'flipped' | 'matched'

// ── Score header chips ────────────────────────────────────────────────────────

function ScoreChip({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.chipLabel}>{label}</Text>
      <Text style={[chipStyles.chipValue, { color: accent }]}>{value}</Text>
    </View>
  )
}

export function MatchingPairsScoreHeader({
  points,
  pairsMatched,
  gridSizePairs,
  streak,
  wrongAttempts,
}: {
  points: number
  pairsMatched: number
  gridSizePairs: number
  streak: number
  wrongAttempts: number
}) {
  return (
    <View style={chipStyles.row}>
      <View style={chipStyles.chips}>
        <ScoreChip label="Score" value={points} accent={ACCENT.score} />
        <ScoreChip label="Pairs" value={`${pairsMatched}/${gridSizePairs}`} accent={ACCENT.pairs} />
        <ScoreChip label="Streak" value={`${streak}🔥`} accent={ACCENT.streak} />
      </View>
      {wrongAttempts > 0 && (
        <Text style={chipStyles.miss}>
          -{wrongAttempts * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY} ({wrongAttempts} miss
          {wrongAttempts !== 1 ? 'es' : ''})
        </Text>
      )}
    </View>
  )
}

const chipStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 8,
  },
  chips: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  chip: { alignItems: 'center', minWidth: 52 },
  chipLabel: { fontSize: 10, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' },
  chipValue: { fontSize: 17, fontWeight: '700', marginTop: 1 },
  miss: { fontSize: 12, color: ACCENT.miss, fontWeight: '600' },
})

// ── Floating flash feedback ───────────────────────────────────────────────────

export type FlashType = 'match' | 'streak' | 'miss'

export function MatchingPairsFlash({
  flash,
  pointsPerPair,
  streakBonus,
}: {
  flash: { type: FlashType; id: number } | null
  pointsPerPair: number
  streakBonus: number
}) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!flash) return
    anim.setValue(0)
    Animated.timing(anim, {
      toValue: 1,
      duration: 1600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [flash, anim])

  if (!flash) return null

  const opacity = anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] })
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [8, -32] })

  return (
    <View pointerEvents="none" style={flashStyles.overlay}>
      <Animated.View style={{ opacity, transform: [{ translateY }] }}>
        {flash.type === 'match' && (
          <Text style={[flashStyles.big, { color: ACCENT.pairs }]}>+{pointsPerPair} 🎉</Text>
        )}
        {flash.type === 'streak' && (
          <Text style={[flashStyles.big, { color: ACCENT.pairs }]}>Streak! +{streakBonus} 🔥</Text>
        )}
        {flash.type === 'miss' && (
          <View style={{ alignItems: 'center' }}>
            <Text style={[flashStyles.big, { color: ACCENT.miss }]}>
              -{MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY}
            </Text>
            <Text style={flashStyles.missSub}>Miss — flip back!</Text>
          </View>
        )}
      </Animated.View>
    </View>
  )
}

const flashStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: '38%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  big: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  missSub: { fontSize: 13, color: ACCENT.miss, fontWeight: '700', marginTop: 2 },
})

// ── Memory card with styled back + match pulse ────────────────────────────────

export function MemoryCard({
  state,
  showFace,
  icon,
  color,
  size,
  disabled,
  onPress,
}: {
  state: CardState
  showFace: boolean
  icon: string
  color: string
  size: number
  disabled: boolean
  onPress: () => void
}) {
  const pulse = useRef(new Animated.Value(1)).current
  const wasMatched = useRef(state === 'matched')

  useEffect(() => {
    const nowMatched = state === 'matched'
    if (nowMatched && !wasMatched.current) {
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.09, duration: 130, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start()
    }
    wasMatched.current = nowMatched
  }, [state, pulse])

  const matched = state === 'matched'

  return (
    <Pressable disabled={disabled} onPress={onPress}>
      <Animated.View
        style={[
          cardStyles.card,
          { width: size, height: size, transform: [{ scale: pulse }] },
          showFace
            ? { borderColor: color, backgroundColor: `${color}22` }
            : cardStyles.cardBack,
          matched && cardStyles.cardMatched,
        ]}
      >
        {showFace ? (
          <Text style={cardStyles.icon}>{icon}</Text>
        ) : (
          <View style={cardStyles.backBubble}>
            <Text style={cardStyles.backMark}>?</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  )
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Decorative back face — brand indigo, consistent across themes.
  cardBack: { borderColor: '#4f46e5', backgroundColor: '#6366f1' },
  cardMatched: { opacity: 0.85 },
  icon: { fontSize: 28 },
  backBubble: {
    width: '42%',
    height: '42%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backMark: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 18 },
})
