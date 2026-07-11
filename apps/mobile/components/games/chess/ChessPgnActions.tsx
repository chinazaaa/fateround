import { useState } from 'react'
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { Game, Player, ChessSession } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useToast } from '@/components/ui/Toast'
import { buildChessPgn } from './chess-pgn'

/**
 * "Share PGN" (the full game as PGN via the native share sheet — the mobile
 * analog of web's file download) and "Copy moves" (movetext to clipboard) for a
 * finished chess game. Both derive from the PGN already stored on the session.
 * Mirrors src/components/chess/ChessPgnActions.tsx.
 */
export function ChessPgnActions({
  game,
  players,
  session,
}: {
  game: Game
  players: Player[]
  session: ChessSession
}) {
  const styles = useThemedStyles(makeStyles)
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const { pgn } = buildChessPgn(session, players, game)
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message: pgn }
          : { message: pgn, title: 'Chess game (PGN)' }
      )
    } catch {
      toast.error('Could not share the PGN')
    }
  }

  const handleCopy = async () => {
    const { moves } = buildChessPgn(session, players, game)
    try {
      await Clipboard.setStringAsync(moves)
      toast.success('Moves copied')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — try again')
    }
  }

  return (
    <View style={styles.row}>
      <Pressable style={styles.btn} onPress={() => void handleShare()}>
        <Text style={styles.btnText}>Share PGN</Text>
      </Pressable>
      <Pressable style={styles.btn} onPress={() => void handleCopy()}>
        <Text style={styles.btnText}>{copied ? 'Copied ✓' : 'Copy moves'}</Text>
      </Pressable>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    btn: {
      flex: 1,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    btnText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  })
