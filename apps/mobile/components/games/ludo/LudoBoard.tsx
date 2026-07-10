import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { LudoColor, LudoPiece, LudoPlayerState, Player } from '@fateround/shared'
import { LUDO_COLOR_HEX, finishedPieceCount, pickLudoMoveForPiece, type LudoMoveOption } from '@fateround/shared/ludo'
import {
  BASE_SLOTS,
  CORNER_BOUNDS,
  FINISHED_DISPLAY,
  boardCellKind,
  moveDestinationCell,
} from '@fateround/shared/ludo-board-layout'

const BOARD_SIZE = 15
const COLOR_VIVID: Record<LudoColor, string> = {
  red: '#e5362b',
  green: '#37a93b',
  yellow: '#f9c00c',
  blue: '#2098e6',
}

type OverlayPiece = {
  key: string
  row: number
  col: number
  color: LudoColor
  pieceId: number
  playerId: string
  selectable: boolean
}

function piecePosition(color: LudoColor, piece: LudoPiece): { row: number; col: number } | null {
  if (piece.zone === 'base') return BASE_SLOTS[color][piece.pos] ?? BASE_SLOTS[color][0] ?? null
  return moveDestinationCell(color, piece)
}

function buildOverlayPieces(
  states: LudoPlayerState[],
  myPlayerId: string | null,
  selectablePieceIds: number[]
): OverlayPiece[] {
  const raw: OverlayPiece[] = []
  for (const state of states) {
    for (const piece of state.pieces) {
      const pos = piecePosition(state.color, piece)
      if (!pos) continue
      raw.push({
        key: `${state.player_id}-${piece.id}`,
        row: pos.row,
        col: pos.col,
        color: state.color,
        pieceId: piece.id,
        playerId: state.player_id,
        selectable: selectablePieceIds.includes(piece.id) && state.player_id === myPlayerId,
      })
    }
  }

  const grouped = new Map<string, OverlayPiece[]>()
  for (const p of raw) {
    const k = `${p.row.toFixed(1)},${p.col.toFixed(1)}`
    const list = grouped.get(k) ?? []
    list.push(p)
    grouped.set(k, list)
  }

  const out: OverlayPiece[] = []
  for (const list of grouped.values()) {
    list.forEach((p, i) => {
      const spacing = list.length > 2 ? 0.18 : 0.35
      const offset = (i - (list.length - 1) / 2) * spacing
      out.push({ ...p, col: p.col + offset })
    })
  }
  return out
}

function cellBackground(kind: ReturnType<typeof boardCellKind>): string {
  switch (kind.kind) {
    case 'void':
      return 'transparent'
    case 'base':
      return COLOR_VIVID[kind.color!]
    case 'track':
      return '#fff'
    case 'start':
    case 'safe':
    case 'home':
      return COLOR_VIVID[kind.color!]
    case 'center':
      return '#fff'
    default:
      return '#fff'
  }
}

export function LudoBoard({
  states,
  players,
  legalMoves,
  myPlayerId,
  isMyTurn,
  highlightCells,
  onMovePiece,
  acting,
}: {
  states: LudoPlayerState[]
  players: Player[]
  legalMoves: LudoMoveOption[]
  myPlayerId: string | null
  isMyTurn: boolean
  highlightCells?: Set<string>
  onMovePiece: (pieceId: number, diceIndex: number) => void
  acting: boolean
}) {
  const { width } = useWindowDimensions()
  const cellSize = Math.min(Math.floor((width - 24) / BOARD_SIZE), 24)
  const boardPx = cellSize * BOARD_SIZE

  const selectablePieceIds = useMemo(
    () => [...new Set(legalMoves.map((m) => m.pieceId))],
    [legalMoves]
  )

  const overlayPieces = useMemo(
    () => buildOverlayPieces(states, myPlayerId, selectablePieceIds),
    [states, myPlayerId, selectablePieceIds]
  )

  const playerNameByColor = useMemo(() => {
    const map = new Map<LudoColor, string>()
    for (const state of states) {
      const player = players.find((p) => p.id === state.player_id)
      map.set(state.color, player?.name ?? state.color)
    }
    return map
  }, [states, players])

  const myColor = states.find((s) => s.player_id === myPlayerId)?.color

  const onCellPress = (row: number, col: number) => {
    if (!isMyTurn || acting || !myColor) return
    const key = `${row},${col}`
    if (!highlightCells?.has(key)) return
    for (const pieceId of selectablePieceIds) {
      const move = legalMoves.find((m) => {
        if (m.pieceId !== pieceId) return false
        const dest = moveDestinationCell(myColor, m.to)
        return dest && Math.round(dest.row) === row && Math.round(dest.col) === col
      })
      if (move) {
        onMovePiece(move.pieceId, move.diceIndex)
        return
      }
    }
  }

  return (
    <View style={styles.wrap}>
      {(Object.keys(CORNER_BOUNDS) as LudoColor[]).map((color) => {
        const bounds = CORNER_BOUNDS[color]
        const state = states.find((s) => s.color === color)
        const finished = state ? finishedPieceCount(state.pieces) : 0
        return (
          <View
            key={color}
            pointerEvents="none"
            style={[
              styles.cornerLabel,
              {
                left: (bounds.colStart / BOARD_SIZE) * boardPx,
                top: (bounds.rowStart / BOARD_SIZE) * boardPx,
                width: ((bounds.colEnd - bounds.colStart + 1) / BOARD_SIZE) * boardPx,
                height: ((bounds.rowEnd - bounds.rowStart + 1) / BOARD_SIZE) * boardPx,
              },
            ]}
          >
            <Text style={styles.cornerName} numberOfLines={1}>
              {playerNameByColor.get(color) ?? color}
            </Text>
            <Text style={styles.cornerProgress}>{finished}/4</Text>
          </View>
        )
      })}

      <View style={[styles.board, { width: boardPx, height: boardPx }]}>
        {Array.from({ length: BOARD_SIZE }, (_, row) => (
          <View key={row} style={styles.row}>
            {Array.from({ length: BOARD_SIZE }, (_, col) => {
              const kind = boardCellKind(row, col)
              if (kind.kind === 'void') {
                return <View key={col} style={{ width: cellSize, height: cellSize }} />
              }
              const key = `${row},${col}`
              const highlighted = highlightCells?.has(key)
              return (
                <Pressable
                  key={col}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: cellBackground(kind),
                    },
                    highlighted && styles.highlightCell,
                  ]}
                  onPress={() => onCellPress(row, col)}
                />
              )
            })}
          </View>
        ))}

        {overlayPieces.map((p) => {
          const left = ((p.col + 0.5) / BOARD_SIZE) * boardPx
          const top = ((p.row + 0.5) / BOARD_SIZE) * boardPx
          const tokenSize = Math.max(cellSize * 0.55, 14)
          return (
            <Pressable
              key={p.key}
              style={[
                styles.token,
                {
                  left: left - tokenSize / 2,
                  top: top - tokenSize / 2,
                  width: tokenSize,
                  height: tokenSize,
                  borderRadius: tokenSize / 2,
                  backgroundColor: LUDO_COLOR_HEX[p.color],
                },
                p.selectable && styles.tokenSelectable,
              ]}
              disabled={!p.selectable || acting}
              onPress={() => {
                const move = pickLudoMoveForPiece(legalMoves, p.pieceId)
                if (move) onMovePiece(move.pieceId, move.diceIndex)
              }}
            >
              {p.playerId === myPlayerId ? (
                <Text style={styles.tokenLabel}>{p.pieceId + 1}</Text>
              ) : null}
            </Pressable>
          )
        })}

        <View pointerEvents="none" style={styles.centerPin}>
          {(Object.keys(FINISHED_DISPLAY) as LudoColor[]).map((color) => {
            const cell = FINISHED_DISPLAY[color]
            const left = ((cell.col + 0.5) / BOARD_SIZE) * boardPx - 6
            const top = ((cell.row + 0.5) / BOARD_SIZE) * boardPx - 6
            return (
              <View
                key={color}
                style={[styles.centerTri, { left, top, borderBottomColor: COLOR_VIVID[color] }]}
              />
            )
          })}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', marginVertical: 8 },
  board: {
    position: 'relative',
    backgroundColor: '#454079',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2a2a35',
  },
  row: { flexDirection: 'row' },
  cell: { borderWidth: 0.25, borderColor: 'rgba(0,0,0,0.06)' },
  highlightCell: { backgroundColor: 'rgba(252,211,77,0.55)' },
  token: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tokenSelectable: {
    borderColor: '#fcd34d',
    shadowColor: '#fcd34d',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  tokenLabel: { color: '#fff', fontSize: 9, fontWeight: '800' },
  cornerLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  cornerName: { color: '#fff', fontSize: 9, fontWeight: '800', maxWidth: '90%' },
  cornerProgress: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '700' },
  centerPin: { ...StyleSheet.absoluteFill, zIndex: 1 },
  centerTri: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
})
