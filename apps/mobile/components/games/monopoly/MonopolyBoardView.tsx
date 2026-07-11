import { useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { MonopolyPlayerState, Player } from '@fateround/shared'
import {
  MONOPOLY_COLOR_HEX,
  MONOPOLY_GRID_SIZE,
  BOARD_SPACE_GRID,
  boardEdgeForSpace,
} from '@fateround/shared/monopoly-board-layout'
import { spaceAt } from '@fateround/shared/monopoly-board'
import { monopolyTokenEmoji } from '@fateround/shared/monopoly-tokens'
import { formatThemedMoney, getBoardPalette, themedSpaceIcon, themedSpaceName } from './monopoly-theme'

export const TOKEN_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']

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

export function MonopolyBoardView({
  states,
  players,
  propertyOwners,
  pendingSpace,
  myPlayerId,
  themeId,
  center,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  propertyOwners: Record<string, string>
  pendingSpace?: number | null
  myPlayerId?: string | null
  themeId?: string | null
  /** Content rendered inside the board's empty center (turn UI: cash, dice, actions). */
  center?: ReactNode
}) {
  const { width } = useWindowDimensions()
  const cellSize = Math.min(Math.floor((width - 12) / MONOPOLY_GRID_SIZE), 42)
  const boardPx = cellSize * MONOPOLY_GRID_SIZE
  const innerPx = cellSize * (MONOPOLY_GRID_SIZE - 2)
  const palette = getBoardPalette(themeId)

  const tokensBySpace = useMemo(() => {
    const map = new Map<number, { emoji: string; playerId: string }[]>()
    for (const state of states) {
      if (state.bankrupt) continue
      const pos = state.position
      const player = players.find((p) => p.id === state.player_id)
      const emoji = monopolyTokenEmoji(player?.monopoly_token, state.player_order)
      const list = map.get(pos) ?? []
      list.push({ emoji, playerId: state.player_id })
      map.set(pos, list)
    }
    return map
  }, [states, players])

  return (
    <View
      style={[
        styles.board,
        { width: boardPx, height: boardPx, backgroundColor: palette.boardBg, borderColor: palette.boardBorder },
      ]}
    >
      {Array.from({ length: MONOPOLY_GRID_SIZE }, (_, rowIndex) => {
        const row = rowIndex + 1
        return (
          <View key={row} style={styles.row}>
            {Array.from({ length: MONOPOLY_GRID_SIZE }, (_, colIndex) => {
              const col = colIndex + 1
              const isCenter = col > 1 && col < MONOPOLY_GRID_SIZE && row > 1 && row < MONOPOLY_GRID_SIZE
              if (isCenter) {
                return (
                  <View
                    key={col}
                    style={[{ width: cellSize, height: cellSize, backgroundColor: palette.centerBg }]}
                  />
                )
              }

              const spaceIndex = BOARD_SPACE_GRID.get(`${col},${row}`)
              if (spaceIndex == null) {
                return <View key={col} style={{ width: cellSize, height: cellSize }} />
              }

              const space = spaceAt(spaceIndex)
              const edge = boardEdgeForSpace(spaceIndex)
              const isCorner = edge === 'corner'
              const ownerId = propertyOwners[String(spaceIndex)]
              const ownerOrder = states.find((s) => s.player_id === ownerId)?.player_order ?? 0
              const tokens = tokensBySpace.get(spaceIndex) ?? []
              const highlighted = pendingSpace === spaceIndex
              const displayName = themedSpaceName(space.name, spaceIndex, themeId)
              const icon = themedSpaceIcon(space.type, themeId) || defaultSpaceIcon(space.type)

              return (
                <View
                  key={col}
                  style={[
                    styles.space,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: isCorner ? palette.cornerBg : palette.tileBg,
                    },
                    highlighted && { borderColor: palette.highlightBorder, borderWidth: 2 },
                  ]}
                >
                  {space.color ? (
                    <View
                      style={[
                        styles.colorBar,
                        edge === 'left' || edge === 'right'
                          ? styles.colorBarVertical
                          : styles.colorBarHorizontal,
                        { backgroundColor: MONOPOLY_COLOR_HEX[space.color] },
                      ]}
                    />
                  ) : null}
                  {space.price != null && !ownerId ? (
                    <Text style={[styles.spacePrice, { color: palette.tileText }]} numberOfLines={1}>
                      {formatThemedMoney(space.price, themeId)}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.spaceName, { color: palette.tileText }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {displayName}
                  </Text>
                  {space.price == null && space.type !== 'property' ? (
                    <Text style={styles.spaceIcon}>{icon}</Text>
                  ) : null}
                  {space.price != null ? (
                    <Text style={[styles.spaceRent, { color: palette.tileText }]} numberOfLines={1}>
                      {space.type === 'utility'
                        ? '4×/10×'
                        : space.rent != null
                          ? formatThemedMoney(space.rent, themeId)
                          : ''}
                    </Text>
                  ) : null}
                  {ownerId ? (
                    <View
                      style={[
                        styles.ownerDot,
                        { backgroundColor: TOKEN_COLORS[ownerOrder % TOKEN_COLORS.length] },
                      ]}
                    />
                  ) : null}
                  {tokens.length > 0 ? (
                    <View style={styles.tokenRow}>
                      {tokens.slice(0, 3).map((t) => (
                        <Text
                          key={t.playerId}
                          style={[
                            styles.tokenEmoji,
                            t.playerId === myPlayerId && styles.tokenEmojiMine,
                          ]}
                        >
                          {t.emoji}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        )
      })}

      {palette.decoration === 'arctic' ? (
        <View pointerEvents="none" style={styles.snowLayer}>
          {SNOWFLAKES.map((flake, i) => (
            <Text
              key={i}
              style={[
                styles.snowflake,
                { top: flake.top as `${number}%`, left: flake.left as `${number}%`, fontSize: flake.size, opacity: flake.opacity },
              ]}
            >
              ❄️
            </Text>
          ))}
        </View>
      ) : null}

      {center != null ? (
        <View
          style={[
            styles.centerSlot,
            { top: cellSize, left: cellSize, width: innerPx, height: innerPx },
          ]}
        >
          {center}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    marginVertical: 8,
  },
  row: { flexDirection: 'row' },
  space: {
    borderWidth: 0.5,
    borderColor: '#a3a3a3',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1,
  },
  colorBar: { position: 'absolute' },
  colorBarHorizontal: { top: 0, left: 0, right: 0, height: 4 },
  colorBarVertical: { top: 0, bottom: 0, left: 0, width: 4 },
  spaceName: {
    fontSize: 7,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 8,
  },
  spacePrice: {
    fontSize: 7,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 8,
    opacity: 0.95,
  },
  spaceRent: {
    fontSize: 6,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 7,
    opacity: 0.7,
  },
  spaceIcon: { fontSize: 8, marginTop: 1 },
  ownerDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tokenRow: {
    position: 'absolute',
    bottom: 1,
    left: 1,
    flexDirection: 'row',
  },
  tokenEmoji: { fontSize: 8, lineHeight: 9 },
  tokenEmojiMine: {
    textShadowColor: '#f43f5e',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 0 },
  },
  snowLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  snowflake: { position: 'absolute' },
  centerSlot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
})
