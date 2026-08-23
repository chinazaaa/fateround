/**
 * Live track for the round in progress — one lane per runner showing how far through the round
 * they are and what it cost them. Mirrors the web component of the same name; the round filtering
 * and level count come from the shared helpers so the two cannot disagree about what "level 4 of
 * 10" means.
 */

import { StyleSheet, Text, View } from 'react-native'
import type { Player, TrollRunPlayerState, TrollRunSession } from '@fateround/shared'
import { selectTrollRunRoundStates, trollRunRoundLevelCount } from '@fateround/shared/troll-run-standings'
import { getPlayerGhostColor } from '@fateround/shared/troll-run-engine'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function TrollRunRaceProgress({
  session,
  players,
  playerStates,
}: {
  session: TrollRunSession
  players: Player[]
  playerStates: TrollRunPlayerState[]
}) {
  const styles = useThemedStyles(makeStyles)
  const levelCount = trollRunRoundLevelCount(session)
  const roundStates = selectTrollRunRoundStates(playerStates, session.current_round)
  const runners = players.filter((player) => player.spectator !== true)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerCell}>Runner</Text>
        <Text style={styles.headerCell}>Level 1 to {levelCount}</Text>
        <Text style={styles.headerCell}>Deaths</Text>
      </View>

      {runners.map((player) => {
        const state = roundStates.find((row) => row.player_id === player.id)
        const clearedLevels = Math.min(levelCount, state?.current_level_index ?? 0)
        const progressPct = levelCount > 0 ? Math.min(100, Math.round((clearedLevels / levelCount) * 100)) : 0
        const isFinished = state?.round_finished === true
        // Placement is only decided when the whole round is scored, so a runner who is already
        // home while others are still out gets a plain badge rather than "#" with nothing after it.
        const hasPlacement = typeof state?.finish_position === 'number'
        // The same colour the engine paints this runner's ghost with, so a tag on the stage can be
        // matched to a name here.
        const laneColor = getPlayerGhostColor(player.id)

        return (
          <View key={player.id} style={styles.lane}>
            <View style={styles.laneTop}>
              <View style={styles.laneName}>
                <View style={[styles.initial, { backgroundColor: laneColor }]}>
                  <Text style={styles.initialText}>{player.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {player.name}
                </Text>
                {isFinished ? (
                  <View style={styles.finishedPill}>
                    <Text style={styles.finishedText}>{hasPlacement ? `#${state?.finish_position}` : 'Finished'}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.levelCount}>
                {Math.min(clearedLevels + 1, levelCount)} / {levelCount}
              </Text>
              <Text style={styles.deaths}>💀 {state?.deaths ?? 0}</Text>
            </View>

            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progressPct}%` }, isFinished && styles.trackFillFinished]} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingBottom: 6,
    },
    headerCell: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    lane: { gap: 5 },
    laneTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.xs },
    laneName: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
    initial: { width: 18, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    initialText: { color: '#0b1120', fontSize: 10, fontWeight: '900' },
    name: { color: theme.text, fontSize: theme.type.caption.size, fontWeight: '700', flexShrink: 1 },
    finishedPill: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      backgroundColor: theme.primarySoft,
    },
    finishedText: { color: theme.success, fontSize: 10, fontWeight: '700' },
    levelCount: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
    deaths: { color: theme.error, fontSize: 11, fontWeight: '700' },
    track: { height: 8, borderRadius: 4, backgroundColor: theme.bgElevated, overflow: 'hidden' },
    trackFill: { height: '100%', borderRadius: 4, backgroundColor: theme.primary },
    trackFillFinished: { backgroundColor: theme.success },
  })
