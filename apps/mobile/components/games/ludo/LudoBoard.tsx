import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Polygon } from 'react-native-svg'
import type { LudoColor, LudoPiece, LudoPlayerState, LudoVariant, Player } from '@fateround/shared'
import {
  LUDO_COLOR_HEX,
  LUDO_COLOR_LABELS,
  finishedPieceCount,
  pickLudoMoveForPiece,
  type LudoMoveOption,
} from '@fateround/shared/ludo'
import {
  BASE_SLOTS,
  CORNER_BOUNDS,
  boardCellKind,
  moveDestinationCell,
  pathArrowAt,
} from '@fateround/shared/ludo-board-layout'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const BOARD_SIZE = 15
const COLOR_VIVID: Record<LudoColor, string> = {
  red: '#e5362b',
  green: '#37a93b',
  yellow: '#f9c00c',
  blue: '#2098e6',
}

const ARROW_GLYPH: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

/** Corner colours laid out to match the physical board — green TL, red TR, yellow BL, blue BR. */
const TOP_ROW_COLORS: [LudoColor, LudoColor] = ['green', 'red']
const BOTTOM_ROW_COLORS: [LudoColor, LudoColor] = ['yellow', 'blue']

type CellKind = ReturnType<typeof boardCellKind>

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

function cellBackground(kind: CellKind): string {
  switch (kind.kind) {
    case 'void':
      return 'transparent'
    case 'base':
      return COLOR_VIVID[kind.color!]
    case 'track':
      return '#fff'
    case 'start':
      return COLOR_VIVID[kind.color!]
    // Safe squares are white cells carrying a colour-tinted ★, matching the
    // classic board — only start squares are solid colour.
    case 'safe':
      return '#fff'
    case 'home':
      return COLOR_VIVID[kind.color!]
    // The centre 3×3 is covered by the coloured pinwheel drawn on top.
    case 'center':
      return 'transparent'
    default:
      return '#fff'
  }
}

/** A player chip — avatar, name, "(you)", finished count — bordered in the
 *  player's colour and glowing on their turn. Mirrors the web LudoPlayerCard. */
function LudoPlayerCard({
  color,
  name,
  finished,
  isTurn,
  isMe,
  align,
  styles,
}: {
  color: LudoColor
  name: string
  finished: number
  isTurn: boolean
  isMe: boolean
  align: 'left' | 'right'
  styles: ReturnType<typeof makeStyles>
}) {
  const vivid = COLOR_VIVID[color]
  return (
    <View
      style={[
        styles.playerCard,
        align === 'right' && styles.playerCardRight,
        { borderColor: vivid },
        isTurn && [styles.playerCardTurn, { shadowColor: vivid }],
      ]}
    >
      <View>
        <ParticipantAvatar name={name} size={26} />
        <View style={[styles.playerDot, { backgroundColor: vivid }]} />
      </View>
      <View style={styles.playerCardText}>
        <Text style={styles.playerName} numberOfLines={1}>
          {name}
          {isMe ? ' (you)' : ''}
        </Text>
        <Text style={styles.playerCount}>{finished}/4 home</Text>
      </View>
    </View>
  )
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
  variant = 'modern',
  turnPlayerId,
}: {
  states: LudoPlayerState[]
  players: Player[]
  legalMoves: LudoMoveOption[]
  myPlayerId: string | null
  isMyTurn: boolean
  highlightCells?: Set<string>
  onMovePiece: (pieceId: number, diceIndex: number) => void
  acting: boolean
  variant?: LudoVariant
  turnPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const { width } = useWindowDimensions()
  const cellSize = Math.min(Math.floor((width - 24) / BOARD_SIZE), 24)
  const boardPx = cellSize * BOARD_SIZE
  const starSize = Math.max(Math.round(cellSize * 0.55), 9)
  const arrowSize = Math.max(Math.round(cellSize * 0.42), 7)

  const selectablePieceIds = useMemo(
    () => [...new Set(legalMoves.map((m) => m.pieceId))],
    [legalMoves]
  )

  const overlayPieces = useMemo(
    () => buildOverlayPieces(states, myPlayerId, selectablePieceIds),
    [states, myPlayerId, selectablePieceIds]
  )

  const stateByColor = useMemo(() => {
    const map = new Map<LudoColor, LudoPlayerState>()
    for (const state of states) map.set(state.color, state)
    return map
  }, [states])

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

  const renderCardRow = (colors: [LudoColor, LudoColor]) => {
    const [leftColor, rightColor] = colors
    const leftState = stateByColor.get(leftColor)
    const rightState = stateByColor.get(rightColor)
    if (!leftState && !rightState) return null
    return (
      <View style={styles.cardRow}>
        <View style={styles.cardSlotLeft}>
          {leftState ? (
            <LudoPlayerCard
              color={leftColor}
              name={playerNameByColor.get(leftColor) ?? leftColor}
              finished={finishedPieceCount(leftState.pieces)}
              isTurn={leftState.player_id === turnPlayerId}
              isMe={leftState.player_id === myPlayerId}
              align="left"
              styles={styles}
            />
          ) : null}
        </View>
        <View style={styles.cardSlotRight}>
          {rightState ? (
            <LudoPlayerCard
              color={rightColor}
              name={playerNameByColor.get(rightColor) ?? rightColor}
              finished={finishedPieceCount(rightState.pieces)}
              isTurn={rightState.player_id === turnPlayerId}
              isMe={rightState.player_id === myPlayerId}
              align="right"
              styles={styles}
            />
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      {myColor ? (
        <Text style={styles.onboarding}>
          You are{' '}
          <Text style={[styles.onboardingColor, { color: COLOR_VIVID[myColor] }]}>
            {LUDO_COLOR_LABELS[myColor]}
          </Text>
          . Roll a 6 on either die to leave your yard onto your ★ start square, then follow the arrows
          clockwise into your home column.
        </Text>
      ) : null}

      {renderCardRow(TOP_ROW_COLORS)}

      <View style={styles.boardOuter}>
        {(Object.keys(CORNER_BOUNDS) as LudoColor[]).map((color) => {
          const bounds = CORNER_BOUNDS[color]
          const state = stateByColor.get(color)
          if (!state) return null
          const finished = finishedPieceCount(state.pieces)
          const isTurn = state.player_id === turnPlayerId
          return (
            <View
              key={color}
              pointerEvents="none"
              style={[
                styles.cornerLabel,
                isTurn && [styles.cornerLabelTurn, { borderColor: COLOR_VIVID[color] }],
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
                const rawKind = boardCellKind(row, col)
                // Traditional Ludo has no mid-arm safe stars — render those cells
                // as plain track. Start squares are unchanged in both variants.
                const kind: CellKind =
                  variant === 'traditional' && rawKind.kind === 'safe' ? { kind: 'track' } : rawKind
                if (kind.kind === 'void') {
                  return <View key={col} style={{ width: cellSize, height: cellSize }} />
                }
                const key = `${row},${col}`
                const highlighted = highlightCells?.has(key)
                const isStart = kind.kind === 'start'
                const isSafe = kind.kind === 'safe'
                const isMyStart = isStart && kind.color === myColor
                const direction = kind.kind === 'track' ? pathArrowAt(row, col) : null
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
                      isMyStart && styles.myStartCell,
                      highlighted && styles.highlightCell,
                    ]}
                    onPress={() => onCellPress(row, col)}
                  >
                    {isStart ? (
                      <Text style={[styles.star, { fontSize: starSize, color: '#fff' }]}>★</Text>
                    ) : isSafe && kind.color ? (
                      <Text style={[styles.star, { fontSize: starSize, color: COLOR_VIVID[kind.color] }]}>
                        ★
                      </Text>
                    ) : direction ? (
                      <Text style={[styles.arrow, { fontSize: arrowSize }]}>{ARROW_GLYPH[direction]}</Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          ))}

          {/* Classic four-colour centre pinwheel. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: (6 / BOARD_SIZE) * boardPx,
              top: (6 / BOARD_SIZE) * boardPx,
              width: (3 / BOARD_SIZE) * boardPx,
              height: (3 / BOARD_SIZE) * boardPx,
              zIndex: 1,
            }}
          >
            <Svg viewBox="0 0 100 100" width="100%" height="100%">
              <Polygon points="50,50 0,0 100,0" fill={COLOR_VIVID.red} stroke="#1e293b" strokeWidth={0.5} />
              <Polygon points="50,50 100,0 100,100" fill={COLOR_VIVID.blue} stroke="#1e293b" strokeWidth={0.5} />
              <Polygon points="50,50 0,100 100,100" fill={COLOR_VIVID.yellow} stroke="#1e293b" strokeWidth={0.5} />
              <Polygon points="50,50 0,0 0,100" fill={COLOR_VIVID.green} stroke="#1e293b" strokeWidth={0.5} />
            </Svg>
          </View>

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
        </View>
      </View>

      {renderCardRow(BOTTOM_ROW_COLORS)}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignSelf: 'stretch', alignItems: 'center', gap: 8, marginVertical: 8 },
    onboarding: {
      color: theme.textMuted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 8,
    },
    onboardingColor: { fontWeight: '800' },
    boardOuter: { position: 'relative' },
    board: {
      position: 'relative',
      backgroundColor: '#454079',
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: '#2a2a35',
    },
    row: { flexDirection: 'row' },
    cell: {
      borderWidth: 0.25,
      borderColor: 'rgba(0,0,0,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    myStartCell: { borderWidth: 1.5, borderColor: '#fff' },
    highlightCell: { backgroundColor: 'rgba(252,211,77,0.55)' },
    star: { fontWeight: '900', textAlign: 'center' },
    arrow: { color: 'rgba(100,116,139,0.85)', fontWeight: '700', textAlign: 'center' },
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
    cornerLabelTurn: {
      borderWidth: 2,
      borderRadius: 8,
    },
    // White on the vivid colour corner base — readable in both schemes.
    cornerName: { color: '#fff', fontSize: 9, fontWeight: '800', maxWidth: '90%' },
    cornerProgress: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '700' },
    cardRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', maxWidth: 420 },
    cardSlotLeft: { flex: 1, alignItems: 'flex-start' },
    cardSlotRight: { flex: 1, alignItems: 'flex-end' },
    playerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 2,
      borderRadius: 12,
      backgroundColor: theme.surface,
      paddingHorizontal: 8,
      paddingVertical: 6,
      maxWidth: '100%',
    },
    playerCardRight: { flexDirection: 'row-reverse' },
    playerCardTurn: {
      shadowOpacity: 0.6,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
      transform: [{ scale: 1.03 }],
    },
    playerDot: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: '#fff',
    },
    playerCardText: { flexShrink: 1 },
    playerName: { color: theme.text, fontSize: 11, fontWeight: '800' },
    playerCount: { color: theme.textMuted, fontSize: 10, fontWeight: '600' },
  })
