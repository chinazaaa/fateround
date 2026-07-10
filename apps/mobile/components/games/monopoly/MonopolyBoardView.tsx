import { useMemo } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { MonopolyPlayerState, Player } from '@fateround/shared'
import {
  MONOPOLY_COLOR_HEX,
  MONOPOLY_GRID_SIZE,
  BOARD_SPACE_GRID,
  boardEdgeForSpace,
  shortMonopolySpaceName,
} from '@fateround/shared/monopoly-board-layout'
import { spaceAt } from '@fateround/shared/monopoly-board'
import { monopolyTokenEmoji } from '@fateround/shared/monopoly-tokens'

const TOKEN_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']

function spaceIcon(type: string): string {
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

export function MonopolyBoardView({
  states,
  players,
  propertyOwners,
  pendingSpace,
  myPlayerId,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  propertyOwners: Record<string, string>
  pendingSpace?: number | null
  myPlayerId?: string | null
}) {
  const { width } = useWindowDimensions()
  const cellSize = Math.min(Math.floor((width - 24) / MONOPOLY_GRID_SIZE), 34)
  const boardPx = cellSize * MONOPOLY_GRID_SIZE

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
    <View style={[styles.board, { width: boardPx, height: boardPx }]}>
      {Array.from({ length: MONOPOLY_GRID_SIZE }, (_, rowIndex) => {
        const row = rowIndex + 1
        return (
          <View key={row} style={styles.row}>
            {Array.from({ length: MONOPOLY_GRID_SIZE }, (_, colIndex) => {
              const col = colIndex + 1
              const isCenter = col > 1 && col < MONOPOLY_GRID_SIZE && row > 1 && row < MONOPOLY_GRID_SIZE
              if (isCenter) {
                return (
                  <View key={col} style={[styles.centerCell, { width: cellSize, height: cellSize }]} />
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

              return (
                <View
                  key={col}
                  style={[
                    styles.space,
                    { width: cellSize, height: cellSize },
                    highlighted && styles.spaceHighlight,
                    isCorner && styles.cornerSpace,
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
                  <Text style={styles.spaceName} numberOfLines={2}>
                    {shortMonopolySpaceName(space.name, isCorner ? 6 : 7)}
                  </Text>
                  {space.type !== 'property' ? (
                    <Text style={styles.spaceIcon}>{spaceIcon(space.type)}</Text>
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
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    backgroundColor: '#14532d',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#166534',
    overflow: 'hidden',
    marginVertical: 8,
  },
  row: { flexDirection: 'row' },
  centerCell: { backgroundColor: '#166534' },
  space: {
    backgroundColor: '#f5f5dc',
    borderWidth: 0.5,
    borderColor: '#a3a3a3',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1,
  },
  cornerSpace: { backgroundColor: '#fef9c3' },
  spaceHighlight: { borderColor: '#f43f5e', borderWidth: 2 },
  colorBar: { position: 'absolute' },
  colorBarHorizontal: { top: 0, left: 0, right: 0, height: 4 },
  colorBarVertical: { top: 0, bottom: 0, left: 0, width: 4 },
  spaceName: {
    fontSize: 6,
    fontWeight: '800',
    color: '#171717',
    textAlign: 'center',
    lineHeight: 7,
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
})
