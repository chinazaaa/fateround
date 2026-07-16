import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { LudoColor } from '@fateround/shared'
import type { LudoMoveOption } from '@fateround/shared/ludo'
import { pieceStatusLabel } from '@fateround/shared/ludo-board-layout'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const COLOR_VIVID: Record<LudoColor, string> = {
  red: '#e5362b',
  green: '#37a93b',
  yellow: '#f9c00c',
  blue: '#2098e6',
}

function toLabel(move: LudoMoveOption): string {
  // Matches web LudoGamePanel's toLabel exactly (incl. base→track = "Onto the path").
  if (move.to.zone === 'finished') return 'Center — home!'
  if (move.to.zone === 'home') return `Home lane step ${move.to.pos + 1}`
  if (move.to.zone === 'track') return 'Onto the path'
  return 'Leave base'
}

/**
 * The labelled list of every legal move — piece number, a 🎲 dice-value chip, a
 * from→to description, and a "· Capture!" warning. Mirrors the web LudoGamePanel
 * displayMoves list so mobile players can see where each move lands (and which one
 * captures) before committing. Tapping a highlighted board piece still works too.
 */
export function LudoMoveList({
  moves,
  myColor,
  remainingDice,
  acting,
  onMovePiece,
}: {
  moves: LudoMoveOption[]
  myColor: LudoColor | undefined
  remainingDice: number[]
  acting: boolean
  onMovePiece: (pieceId: number, diceIndex: number) => void
}) {
  const styles = useThemedStyles(makeStyles)
  if (moves.length === 0) return null

  const hasCombined = moves.some((m) => m.usesAllDice)
  const allSixes = remainingDice.length > 0 && remainingDice.every((v) => v === 6)
  const hasBaseSix = moves.some((m) => m.from.zone === 'base' && m.diceValue === 6)
  const totalSpaces = remainingDice.reduce((sum, n) => sum + n, 0)

  const heading = hasCombined
    ? `Move your piece ${totalSpaces} spaces`
    : allSixes && remainingDice.length === 2
      ? 'Doubles! Use each 6 — bring out two pieces, or one out then move 6'
      : allSixes && remainingDice.length === 1
        ? 'Use your 6 — bring out another piece or move 6 spaces'
        : hasBaseSix
          ? 'Use your 6 — pick a piece to bring onto your ★ square'
          : remainingDice.length === 1
            ? `Move a piece ${remainingDice[0]} spaces`
            : `Use each die (${remainingDice.join(' & ')}) — pick a piece`

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.hint}>Tap a highlighted piece on the board or a move below</Text>
      <View style={styles.list}>
        {moves.map((move) => (
          <Pressable
            key={`${move.pieceId}-${move.diceIndex}`}
            disabled={acting}
            onPress={() => onMovePiece(move.pieceId, move.diceIndex)}
            style={[styles.moveBtn, acting && styles.moveBtnDisabled]}
          >
            <View style={styles.moveTopRow}>
              <View style={[styles.pieceBadge, { backgroundColor: myColor ? COLOR_VIVID[myColor] : '#64748b' }]}>
                <Text style={styles.pieceBadgeText}>{move.pieceId + 1}</Text>
              </View>
              <Text style={styles.pieceLabel}>Piece {move.pieceId + 1}</Text>
              <View style={styles.diceChip}>
                <Text style={styles.diceChipText}>
                  🎲 {move.usesAllDice ? remainingDice.join('+') : move.diceValue}
                </Text>
              </View>
            </View>
            <Text style={styles.moveDesc}>
              {pieceStatusLabel(move.from)} → {toLabel(move)}
              {move.captures ? '  ·  Capture!' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    heading: { color: theme.text, fontWeight: '700', fontSize: 14, textAlign: 'center' },
    hint: { color: theme.textMuted, fontSize: 11, textAlign: 'center' },
    list: { gap: 8 },
    moveBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    moveBtnDisabled: { opacity: 0.5 },
    moveTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pieceBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // White numeral on a vivid player-color badge — correct in both schemes.
    pieceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    pieceLabel: { color: theme.text, fontWeight: '700', fontSize: 13, flex: 1 },
    diceChip: { backgroundColor: '#fcd34d', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    diceChipText: { color: '#0f172a', fontSize: 11, fontWeight: '800' },
    moveDesc: { color: theme.textMuted, fontSize: 12 },
  })
