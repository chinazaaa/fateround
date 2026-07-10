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

  const rows = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const cols = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]

  return (
    <View style={[styles.board, { borderRadius: 8 }]}>
      {rows.map((row) => (
        <View key={row} style={styles.row}>
          {cols.map((col) => {
            const dark = isDarkSquare(row, col)
            const piece = pieceAt(board, row, col)
            const sq = squareId(row, col)
            const isSelected = selected === sq
            const isTarget = legalTargets.has(sq)
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
                {dark && piece !== '.' ? (
                  <View style={[styles.disc, discStyle(piece), isKing(piece) && styles.kingDisc]}>
                    {isKing(piece) ? <Text style={styles.crown}>♔</Text> : null}
                  </View>
                ) : null}
                {dark && isTarget ? <View style={styles.targetDot} /> : null}
              </Pressable>
            )
          })}
        </View>
      ))}
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
    alignSelf: 'center',
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
})
