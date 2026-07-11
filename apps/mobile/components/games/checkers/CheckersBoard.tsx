import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { CheckersColor } from '@fateround/shared'
import {
  colorOfPiece,
  isDarkSquare,
  legalStepsFromSquare,
  pieceAt,
  squareId,
} from '@fateround/shared/checkers'

type Props = {
  board: string
  myColor: CheckersColor | null
  isMyTurn: boolean
  mustContinue: string | null
  selected: string | null
  lastMoveFrom: string | null
  lastMoveTo: string | null
  acting: boolean
  redName: string
  blackName: string
  /** Themed text colors for the capture trays (they sit on the app background). */
  nameColor: string
  mutedColor: string
  onSquarePress: (row: number, col: number) => void
}

export function CheckersBoard({
  board,
  myColor,
  isMyTurn,
  mustContinue,
  selected,
  lastMoveFrom,
  lastMoveTo,
  acting,
  redName,
  blackName,
  nameColor,
  mutedColor,
  onSquarePress,
}: Props) {
  const { width } = useWindowDimensions()
  const squareSize = Math.min(Math.floor((width - 32) / 8), 44)
  const flip = myColor === 'b'

  const legalTargets = useMemo(() => {
    if (!selected || !myColor || !isMyTurn) return new Set<string>()
    return new Set(
      legalStepsFromSquare(board, myColor, selected, mustContinue).map((step) => step.to)
    )
  }, [board, myColor, isMyTurn, selected, mustContinue])

  // Captured counts: a side's tally is the 12 opposing men no longer on the board.
  const counts = useMemo(() => {
    let red = 0
    let black = 0
    for (const ch of board) {
      const c = colorOfPiece(ch)
      if (c === 'r') red += 1
      else if (c === 'b') black += 1
    }
    return { red, black }
  }, [board])

  const rows = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const cols = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]

  const bottomColor: CheckersColor = flip ? 'b' : 'r'
  const topColor: CheckersColor = flip ? 'r' : 'b'
  const trayFor = (color: CheckersColor) => ({
    name: color === 'r' ? redName : blackName,
    glyphColor: color,
    captured: 12 - (color === 'r' ? counts.black : counts.red),
  })

  const boardWidth = squareSize * 8

  return (
    <View style={{ alignSelf: 'center', width: boardWidth }}>
      <CaptureTray {...trayFor(topColor)} nameColor={nameColor} mutedColor={mutedColor} />
      <View style={[styles.board, { borderRadius: 8 }]}>
        {rows.map((row) => (
          <View key={row} style={styles.row}>
            {cols.map((col) => {
              const dark = isDarkSquare(row, col)
              const piece = pieceAt(board, row, col)
              const sq = squareId(row, col)
              const isSelected = selected === sq
              const isTarget = legalTargets.has(sq)
              const hasPiece = piece !== '.'
              const isLast = sq === lastMoveFrom || sq === lastMoveTo
              return (
                <Pressable
                  key={col}
                  style={[
                    styles.square,
                    { width: squareSize, height: squareSize },
                    dark ? styles.darkSquare : styles.lightSquare,
                    isSelected && styles.selectedSquare,
                    isTarget && styles.targetSquare,
                    isLast && styles.lastMoveSquare,
                  ]}
                  disabled={!dark || acting || !isMyTurn}
                  onPress={() => onSquarePress(row, col)}
                >
                  {dark && hasPiece ? (
                    <View style={[styles.disc, discStyle(piece), isKing(piece) && styles.kingDisc]}>
                      {isKing(piece) ? <Text style={styles.crown}>♔</Text> : null}
                    </View>
                  ) : null}
                  {dark && isTarget && !hasPiece ? <View style={styles.targetDot} /> : null}
                  {dark && isTarget && hasPiece ? <View style={styles.captureRing} /> : null}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
      <CaptureTray {...trayFor(bottomColor)} nameColor={nameColor} mutedColor={mutedColor} />
    </View>
  )
}

/** A player's row above/below the board: glyph, name, and captured tally. */
function CaptureTray({
  name,
  glyphColor,
  captured,
  nameColor,
  mutedColor,
}: {
  name: string
  glyphColor: CheckersColor
  captured: number
  nameColor: string
  mutedColor: string
}) {
  return (
    <View style={styles.tray}>
      <Text style={[styles.trayName, { color: nameColor }]} numberOfLines={1}>
        {glyphColor === 'r' ? '🔴' : '⚫'} {name}
      </Text>
      {captured > 0 ? (
        <Text style={[styles.trayCaptured, { color: mutedColor }]}>· {captured} captured</Text>
      ) : null}
    </View>
  )
}

function isKing(piece: string): boolean {
  return piece === 'R' || piece === 'B'
}

function discStyle(piece: string) {
  const color = colorOfPiece(piece)
  if (color === 'r') return styles.redDisc
  return styles.blackDisc
}

const styles = StyleSheet.create({
  board: {
    borderWidth: 2,
    borderColor: '#2a2a35',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  square: { alignItems: 'center', justifyContent: 'center' },
  lightSquare: { backgroundColor: '#f5e6c8' },
  darkSquare: { backgroundColor: '#8b5e34' },
  selectedSquare: { borderWidth: 2, borderColor: '#f43f5e' },
  targetSquare: { backgroundColor: '#a67c52' },
  lastMoveSquare: { backgroundColor: '#c4a574' },
  disc: {
    width: '72%',
    height: '72%',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redDisc: { backgroundColor: '#dc2626' },
  blackDisc: { backgroundColor: '#111827' },
  kingDisc: { borderColor: '#fcd34d', borderWidth: 2 },
  crown: { color: '#fcd34d', fontSize: 12, fontWeight: '800', marginTop: -2 },
  targetDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(244,63,94,0.85)',
  },
  captureRing: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 24,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  trayName: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  trayCaptured: { fontSize: 12, fontWeight: '600' },
})
