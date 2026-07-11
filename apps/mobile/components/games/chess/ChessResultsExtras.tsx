import { StyleSheet, Text, View } from 'react-native'
import type { Game, Player, ChessSession } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { ChessReadOnlyBoard } from './ChessReadOnlyBoard'
import { ChessPgnActions } from './ChessPgnActions'
import { KingGlyph } from './ChessCapturedTray'

/**
 * Extra content under the chess finish standings: the final-position board
 * snapshot (with White vs Black names) plus PGN export actions. Mirrors the web
 * ChessFinalResultsShareBlock's ReadOnlyBoard + ChessPgnActions.
 */
export function ChessResultsExtras({
  game,
  players,
  session,
  highlightPlayerId,
}: {
  game: Game
  players: Player[]
  session: ChessSession
  highlightPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const white = players.find((p) => p.id === session.player_white_id)
  const black = players.find((p) => p.id === session.player_black_id)

  return (
    <View style={styles.wrap}>
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>
          <KingGlyph color="w" /> {white?.name ?? 'White'}
          {white?.id === highlightPlayerId ? ' (you)' : ''}
        </Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.name, styles.nameRight]} numberOfLines={1}>
          <KingGlyph color="b" /> {black?.name ?? 'Black'}
          {black?.id === highlightPlayerId ? ' (you)' : ''}
        </Text>
      </View>

      <ChessReadOnlyBoard
        fen={session.fen}
        defaults={{ boardTheme: game.chess_board_theme, pieceSet: game.chess_piece_set }}
      />

      {session.pgn ? <ChessPgnActions game={game} players={players} session={session} /> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 12 },
    names: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
    name: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '700' },
    nameRight: { textAlign: 'right' },
    vs: { color: theme.textFaint, fontSize: 13, flexShrink: 0 },
  })
