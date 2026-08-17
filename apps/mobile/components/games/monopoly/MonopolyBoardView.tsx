import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { MonopolyPlayerState, Player } from '@fateround/shared'
import { MONOPOLY_COLOR_HEX, boardEdgeForSpace } from '@fateround/shared/monopoly-board-layout'
import { MONOPOLY_BOARD_SIZE, spaceAt, type MonopolyBoardSize } from '@fateround/shared/monopoly-board'
import { monopolyTokenEmoji } from '@fateround/shared/monopoly-tokens'
import {
  getBoardPalette,
  getBoardTitle,
  getEditionSubtitle,
  mobileBoardSpaceLines,
  themedSpaceIcon,
} from './monopoly-theme'

export const TOKEN_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']

// Board tiles walked in visual order for the frame layout. Corners bookend each
// edge run; the index maths mirrors `boardGridCell` in the shared package.
// For a `boardSize`-tile board there are `boardSize / 4` tiles per side (12 on
// the 48-space expanded board, 10 on the classic 40-space board), corners at
// 0, side, side*2, side*3.
function buildPerimeterIndices(boardSize: MonopolyBoardSize): {
  top: number[]
  bottom: number[]
  left: number[]
  right: number[]
} {
  const side = boardSize / 4
  const top: number[] = []
  for (let i = side * 2; i <= side * 3; i += 1) top.push(i)
  const bottom: number[] = []
  for (let i = side; i >= 0; i -= 1) bottom.push(i)
  const left: number[] = []
  for (let i = side * 2 - 1; i > side; i -= 1) left.push(i)
  const right: number[] = []
  for (let i = side * 3 + 1; i < boardSize; i += 1) right.push(i)
  return { top, bottom, left, right }
}

function defaultSpaceIcon(type: string): string {
  switch (type) {
    case 'go':
      return '→'
    case 'chance':
      return '?'
    case 'community':
      return '🎁'
    case 'tax':
      return '💸'
    case 'jail':
      return '🔒'
    case 'go_to_jail':
      return '👮'
    case 'free_parking':
      return '🅿'
    case 'station':
      return '🚂'
    case 'utility':
      return '💡'
    default:
      return ''
  }
}

// Ambient snowflakes for the Arctic edition — fixed positions (percent of board).
const SNOWFLAKES = [
  { top: '8%', left: '14%', size: 9, opacity: 0.75 },
  { top: '22%', left: '58%', size: 7, opacity: 0.6 },
  { top: '40%', left: '30%', size: 10, opacity: 0.7 },
  { top: '54%', left: '72%', size: 8, opacity: 0.55 },
  { top: '68%', left: '20%', size: 7, opacity: 0.65 },
  { top: '80%', left: '50%', size: 9, opacity: 0.6 },
  { top: '34%', left: '84%', size: 6, opacity: 0.5 },
  { top: '62%', left: '44%', size: 6, opacity: 0.5 },
] as const

type Edge = ReturnType<typeof boardEdgeForSpace>

function colorBarStyle(edge: Edge) {
  // Bar sits on the tile's inner edge (facing the board centre).
  switch (edge) {
    case 'top':
      return styles.barBottom
    case 'bottom':
      return styles.barTop
    case 'left':
      return styles.barRight
    case 'right':
      return styles.barLeft
    default:
      return null
  }
}

function tokenRowStyle(edge: Edge) {
  switch (edge) {
    case 'top':
      return styles.tokenRowTop
    case 'bottom':
      return styles.tokenRowBottom
    case 'left':
      return styles.tokenRowLeft
    case 'right':
      return styles.tokenRowRight
    default:
      return styles.tokenRowCorner
  }
}

export function MonopolyBoardView({
  states,
  players,
  propertyOwners,
  pendingSpace,
  myPlayerId,
  themeId,
  boardSize = MONOPOLY_BOARD_SIZE,
  center,
  onSpacePress,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  propertyOwners: Record<string, string>
  pendingSpace?: number | null
  myPlayerId?: string | null
  themeId?: string | null
  /** 40 (classic) or 48 (expanded). Defaults to the classic 40-space board. */
  boardSize?: MonopolyBoardSize
  /** Content rendered inside the board's empty center (turn UI: cash, dice, actions). */
  center?: ReactNode
  /** Tap-to-inspect — opens the property details modal for the tapped space. */
  onSpacePress?: (spaceIndex: number) => void
}) {
  const { width: winW } = useWindowDimensions()
  // Size to the real available width (the board sits inside nested container
  // paddings), measured via onLayout. `winW - 64` is just the first-paint estimate.
  const [availW, setAvailW] = useState(0)
  const boardW = Math.min(availW || winW - 64, 440)
  // The perimeter has `sideLength` tiles per side, with corners at both ends.
  // Classic 40 = 10/side (9 edge tiles between corners), expanded 48 = 12/side
  // (11 edge tiles between corners). Corners are ~1.25× an edge tile's short
  // side so the visual weight matches the web fractional grid.
  const sideLength = boardSize / 4
  const edgeCount = sideLength - 1
  const cornerRatio = 1.25
  const cornerSize = Math.round((boardW * cornerRatio) / (edgeCount + 2 * cornerRatio))
  const centerSize = boardW - cornerSize * 2
  const edgeMain = centerSize / edgeCount
  const palette = getBoardPalette(themeId)
  const perimeter = useMemo(() => buildPerimeterIndices(boardSize), [boardSize])

  const tokensBySpace = useMemo(() => {
    const map = new Map<number, { emoji: string; playerId: string; order: number }[]>()
    for (const state of states) {
      if (state.bankrupt) continue
      const player = players.find((p) => p.id === state.player_id)
      const emoji = monopolyTokenEmoji(player?.monopoly_token, state.player_order)
      const list = map.get(state.position) ?? []
      list.push({ emoji, playerId: state.player_id, order: state.player_order })
      map.set(state.position, list)
    }
    return map
  }, [states, players])

  const renderTile = (spaceIndex: number) => {
    const space = spaceAt(spaceIndex, boardSize)
    const edge = boardEdgeForSpace(spaceIndex, boardSize)
    const isCorner = edge === 'corner'
    const vertical = edge === 'top' || edge === 'bottom'
    const ownerId = propertyOwners[String(spaceIndex)]
    const ownerOrder = states.find((s) => s.player_id === ownerId)?.player_order ?? 0
    const tokens = tokensBySpace.get(spaceIndex) ?? []
    const highlighted = pendingSpace === spaceIndex
    const nameLines = mobileBoardSpaceLines(space.name, space.type, spaceIndex, themeId, boardSize)
    const icon = themedSpaceIcon(space.type, themeId) || defaultSpaceIcon(space.type)
    const showIcon = space.price == null && space.type !== 'property' && !!icon
    const colorHex = space.color ? MONOPOLY_COLOR_HEX[space.color] : null
    // Corners are square; top/bottom tiles are tall & narrow; side tiles are wide & short.
    const tileW = isCorner ? cornerSize : vertical ? edgeMain : cornerSize
    const tileH = isCorner ? cornerSize : vertical ? cornerSize : edgeMain

    return (
      <Pressable
        key={spaceIndex}
        onPress={onSpacePress ? () => onSpacePress(spaceIndex) : undefined}
        accessibilityRole={onSpacePress ? 'button' : undefined}
        accessibilityLabel={space.name}
        style={[
          styles.tile,
          { width: tileW, height: tileH },
          { backgroundColor: isCorner ? palette.cornerBg : palette.tileBg },
          highlighted && { borderColor: palette.highlightBorder, borderWidth: 1.5 },
        ]}
      >
        {colorHex && !isCorner ? (
          <View style={[styles.colorBar, colorBarStyle(edge), { backgroundColor: colorHex }]} />
        ) : null}

        {isCorner ? (
          <View style={styles.cornerContent}>
            {showIcon ? <Text style={styles.cornerIcon}>{icon}</Text> : null}
            {nameLines.map((line, i) => (
              <Text
                key={i}
                style={[styles.cornerName, { color: palette.tileText }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {line}
              </Text>
            ))}
          </View>
        ) : vertical ? (
          <View style={styles.vContent}>
            {/* Stacked lines laid out horizontally, then the whole block is rotated
                90° so they read as side-by-side vertical columns (like the sides). */}
            <View style={[styles.vBlock, { width: cornerSize - 8 }]}>
              {nameLines.map((line, i) => (
                <Text
                  key={i}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={[styles.vLine, { color: palette.tileText }]}
                >
                  {line}
                </Text>
              ))}
              {showIcon ? <Text style={[styles.vLine, { color: palette.tileText }]}>{icon}</Text> : null}
            </View>
          </View>
        ) : (
          <View style={styles.hContent}>
            {nameLines.map((line, i) => (
              <Text
                key={i}
                style={[styles.spaceName, { color: palette.tileText }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {line}
              </Text>
            ))}
            {showIcon ? <Text style={styles.spaceIcon}>{icon}</Text> : null}
          </View>
        )}

        {ownerId ? (
          <View style={[styles.ownerDot, { backgroundColor: TOKEN_COLORS[ownerOrder % TOKEN_COLORS.length] }]} />
        ) : null}

        {tokens.length > 0 ? (
          <View style={[styles.tokenRow, tokenRowStyle(edge)]}>
            {tokens.slice(0, 4).map((t) => {
              const mine = t.playerId === myPlayerId
              return (
                <View
                  key={t.playerId}
                  style={[
                    styles.tokenChip,
                    { backgroundColor: TOKEN_COLORS[t.order % TOKEN_COLORS.length] },
                    mine && styles.tokenChipMine,
                  ]}
                >
                  <Text style={styles.tokenChipEmoji}>{t.emoji}</Text>
                </View>
              )
            })}
          </View>
        ) : null}
      </Pressable>
    )
  }

  return (
    <View
      style={styles.measure}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        if (w > 0 && Math.abs(w - availW) > 0.5) setAvailW(w)
      }}
    >
      <View
        style={[
          styles.board,
          { width: boardW, height: boardW, backgroundColor: palette.boardBg, borderColor: palette.boardBorder },
        ]}
      >
        <View style={[styles.edgeRow, { height: cornerSize }]}>{perimeter.top.map(renderTile)}</View>

        <View style={[styles.midRow, { height: centerSize }]}>
          <View style={{ width: cornerSize, height: centerSize }}>{perimeter.left.map(renderTile)}</View>
          <View
            style={[styles.centerCell, { width: centerSize, height: centerSize, backgroundColor: palette.centerBg }]}
          >
            {center ?? (
              <View style={styles.defaultCenter}>
                <Text style={styles.defaultCenterTitle}>{getBoardTitle(themeId)}</Text>
                <Text style={styles.defaultCenterSubtitle}>{getEditionSubtitle(themeId)}</Text>
              </View>
            )}
          </View>
          <View style={{ width: cornerSize, height: centerSize }}>{perimeter.right.map(renderTile)}</View>
        </View>

        <View style={[styles.edgeRow, { height: cornerSize }]}>{perimeter.bottom.map(renderTile)}</View>

        {palette.decoration === 'arctic' ? (
          <View pointerEvents="none" style={styles.snowLayer}>
            {SNOWFLAKES.map((flake, i) => (
              <Text
                key={i}
                style={[
                  styles.snowflake,
                  {
                    top: flake.top as `${number}%`,
                    left: flake.left as `${number}%`,
                    fontSize: flake.size,
                    opacity: flake.opacity,
                  },
                ]}
              >
                ❄️
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  measure: { width: '100%', alignItems: 'center' },
  board: {
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    marginVertical: 8,
  },
  edgeRow: { flexDirection: 'row' },
  midRow: { flexDirection: 'row' },
  centerCell: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  defaultCenter: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  defaultCenterTitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  defaultCenterSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.28)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBar: { position: 'absolute' },
  barTop: { top: 0, left: 0, right: 0, height: 5 },
  barBottom: { bottom: 0, left: 0, right: 0, height: 5 },
  barLeft: { top: 0, bottom: 0, left: 0, width: 5 },
  barRight: { top: 0, bottom: 0, right: 0, width: 5 },
  cornerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cornerIcon: { fontSize: 13, marginBottom: 1 },
  cornerName: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 10,
    letterSpacing: -0.2,
  },
  hContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  vContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-90deg' }],
  },
  vLine: {
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 9,
    letterSpacing: -0.2,
    alignSelf: 'stretch',
  },
  spaceName: {
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 9,
    letterSpacing: -0.2,
  },
  spaceIcon: { fontSize: 9, marginTop: 1 },
  ownerDot: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  tokenRow: { position: 'absolute' },
  tokenRowTop: { top: 1, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  tokenRowBottom: { bottom: 1, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  tokenRowLeft: { left: 1, top: 0, bottom: 0, flexDirection: 'column', justifyContent: 'center' },
  tokenRowRight: { right: 1, top: 0, bottom: 0, flexDirection: 'column', justifyContent: 'center' },
  tokenRowCorner: { top: 3, right: 3, flexDirection: 'row' },
  tokenChip: {
    width: 13,
    height: 13,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0.5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  tokenChipMine: {
    borderColor: '#f43f5e',
    borderWidth: 1.5,
    transform: [{ scale: 1.12 }],
  },
  tokenChipEmoji: { fontSize: 8, lineHeight: 10 },
  snowLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  snowflake: { position: 'absolute' },
})
