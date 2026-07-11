import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { AyoSession, AyoSide } from '@fateround/shared'
import { isPitActive, AYO_PITS_PER_SIDE, type AyoVariant } from '@/lib/ayo-sow'
import type { AyoSowAnimationState } from '@/hooks/useAyoSowAnimation'

const BOARD_WOOD = '#8b5e34'
const PIT_BG = '#5c3d1e'
const PIT_RING = '#3d2812'
const SEED_TEXT = '#fef3c7' // amber-100
const SEED_EMOJI = 'rgba(253,230,138,0.75)' // amber-200/70
const AMBER = '#fcd34d' // amber-300
const EMERALD = '#34d399'
const PRIMARY = '#f43f5e'

type Props = {
  session: AyoSession
  mySide: AyoSide | null
  legal: number[]
  disabled: boolean
  onMove: (pitIndex: number) => void
  animation: AyoSowAnimationState
  variant: AyoVariant
  nameA: string
  nameB: string
}

function totalSeedsOnSide(pits: number[], side: AyoSide, rowSize: number): number {
  const start = side === 'a' ? 0 : AYO_PITS_PER_SIDE
  let sum = 0
  for (let i = start; i < start + rowSize; i += 1) sum += pits[i] ?? 0
  return sum
}

export function AyoBoard({ session, mySide, legal, disabled, onMove, animation, variant, nameA, nameB }: Props) {
  const animating = animation.animating && animation.pits.length === 12
  const pits = animating ? animation.pits : session.pits
  const config = { aRowSize: session.a_row_size, bRowSize: session.b_row_size }

  const flip = mySide === 'b'
  const bottomIndices = flip ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5]
  const topIndices = flip ? [5, 4, 3, 2, 1, 0] : [11, 10, 9, 8, 7, 6]
  const bottomSide: AyoSide = flip ? 'b' : 'a'
  const topSide: AyoSide = flip ? 'a' : 'b'

  const renderPit = (pitIndex: number) => {
    const active = isPitActive(pitIndex, config)
    const count = pits[pitIndex] ?? 0

    if (!active) {
      return <View key={pitIndex} style={[styles.pit, styles.pitInactive]} />
    }

    const highlighted = animating ? animation.highlightPit === pitIndex : false
    const landing = animating ? animation.landingPit === pitIndex : false
    const pulsing = animating ? animation.pulsePit === pitIndex : false
    const playable = !disabled && legal.includes(pitIndex)

    return (
      <Pressable
        key={pitIndex}
        style={[
          styles.pit,
          playable && styles.pitPlayable,
          highlighted && styles.pitHighlighted,
          landing && styles.pitLanding,
        ]}
        disabled={disabled || !playable}
        onPress={() => onMove(pitIndex)}
      >
        {pulsing ? (
          <View style={styles.plusBadge}>
            <Text style={styles.plusBadgeText}>+1</Text>
          </View>
        ) : null}
        <Text style={styles.seedCount}>{count}</Text>
        <Text style={styles.seedEmoji} numberOfLines={1}>
          {'🌰'.repeat(Math.min(count, 4))}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.wood}>
      <ScoreTray
        side={topSide}
        session={session}
        variant={variant}
        name={topSide === 'a' ? nameA : nameB}
        rowSize={topSide === 'a' ? session.a_row_size : session.b_row_size}
        pits={pits}
      />
      <View style={styles.row}>{topIndices.map(renderPit)}</View>

      {animating && animation.seedsInHand != null ? (
        <View style={styles.handPill}>
          <Text style={styles.handPillText}>🌰 {animation.seedsInHand} in hand</Text>
        </View>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={styles.row}>{bottomIndices.map(renderPit)}</View>
      <ScoreTray
        side={bottomSide}
        session={session}
        variant={variant}
        name={bottomSide === 'a' ? nameA : nameB}
        rowSize={bottomSide === 'a' ? session.a_row_size : session.b_row_size}
        pits={pits}
      />
    </View>
  )
}

function ScoreTray({
  side,
  session,
  variant,
  name,
  rowSize,
  pits,
}: {
  side: AyoSide
  session: AyoSession
  variant: AyoVariant
  name: string
  rowSize: number
  pits: number[]
}) {
  const captured = side === 'a' ? session.captured_a : session.captured_b
  const houses = side === 'a' ? session.houses_a : session.houses_b
  const streak = side === 'a' ? session.a_win_streak : session.b_win_streak
  const active = session.status === 'active' && session.current_turn === side

  const detail =
    variant === 'oware'
      ? `${captured + totalSeedsOnSide(pits, side, rowSize)} seeds (${captured} captured)`
      : `${houses} houses · ${rowSize} pits left`

  return (
    <View style={[styles.tray, active && styles.trayActive]}>
      <View style={styles.trayLeft}>
        <Text style={styles.trayText} numberOfLines={1}>
          🌰 {name} · {detail}
        </Text>
        {streak >= 3 ? <Text style={styles.champion}>🏆 Ọta champion</Text> : null}
      </View>
      <AyoClockChip session={session} side={side} />
    </View>
  )
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function AyoClockChip({ session, side }: { session: AyoSession; side: AyoSide }) {
  const active = session.status === 'active' && session.current_turn === side
  const [, bump] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => bump((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [active])

  const timed = session.a_time_ms != null && session.b_time_ms != null
  if (!timed) return null

  const base = (side === 'a' ? session.a_time_ms : session.b_time_ms) ?? 0
  const startedAt = session.turn_started_at ? new Date(session.turn_started_at).getTime() : null
  const ms = active && startedAt != null ? Math.max(0, base - Math.max(0, Date.now() - startedAt)) : base
  const lowTime = ms <= 30000

  return (
    <View style={[styles.clock, active && styles.clockActive, active && lowTime && styles.clockLow]}>
      <Text style={[styles.clockText, active && lowTime && styles.clockTextLow]}>{formatClock(ms)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wood: {
    backgroundColor: BOARD_WOOD,
    borderRadius: 18,
    padding: 12,
    gap: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  spacer: { height: 8 },
  pit: {
    flex: 1,
    aspectRatio: 0.8,
    maxWidth: 56,
    borderRadius: 999,
    backgroundColor: PIT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PIT_RING,
  },
  pitInactive: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: 'rgba(61,40,18,0.6)',
    opacity: 0.3,
  },
  pitPlayable: { borderColor: PRIMARY },
  pitHighlighted: {
    borderColor: AMBER,
    transform: [{ scale: 1.04 }],
  },
  pitLanding: {
    borderColor: EMERALD,
    transform: [{ scale: 1.04 }],
  },
  seedCount: { color: SEED_TEXT, fontSize: 18, fontWeight: '900' },
  seedEmoji: { fontSize: 10, color: SEED_EMOJI, marginTop: 1 },
  plusBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: AMBER,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    zIndex: 2,
  },
  plusBadgeText: { color: '#3d2812', fontSize: 10, fontWeight: '900' },
  handPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  handPillText: { color: SEED_TEXT, fontSize: 13, fontWeight: '700' },
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  trayActive: { backgroundColor: 'rgba(244,63,94,0.25)' },
  trayLeft: { flex: 1, gap: 1 },
  trayText: { color: SEED_TEXT, fontSize: 13, fontWeight: '700' },
  champion: { color: AMBER, fontSize: 11, fontWeight: '800' },
  clock: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  clockActive: { backgroundColor: 'rgba(244,63,94,0.35)' },
  clockLow: { backgroundColor: 'rgba(244,63,94,0.55)' },
  clockText: { color: SEED_TEXT, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clockTextLow: { color: '#fff' },
})
