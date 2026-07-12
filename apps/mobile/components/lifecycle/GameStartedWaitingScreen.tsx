import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { getSupabase, GAME_SELECT } from '@/lib/supabase'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  game: Pick<Game, 'title' | 'game_type' | 'status'> | null
  onLobbyOpen: () => void
}

export function GameStartedWaitingScreen({ gameCode, game, onLobbyOpen }: Props) {
  const styles = useThemedStyles(makeStyles)
  useEffect(() => {
    if (game?.status === 'waiting') onLobbyOpen()
  }, [game?.status, onLobbyOpen])

  useEffect(() => {
    if (game?.status === 'waiting') return

    const interval = setInterval(() => {
      void getSupabase()
        .from('games')
        .select(GAME_SELECT)
        .eq('id', gameCode.toUpperCase())
        .maybeSingle()
        .then((res) => {
          if (res.data?.status === 'waiting') onLobbyOpen()
        })
    }, 8000)

    return () => clearInterval(interval)
  }, [game?.status, gameCode, onLobbyOpen])

  const label = game ? gameLabel(game.game_type) : 'Game'

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>⏳</Text>
        {game?.title ? <Text style={styles.title}>{game.title}</Text> : null}
        <Text style={styles.badge}>{label}</Text>
        <Text style={styles.heading}>Game in progress</Text>
        <Text style={styles.body}>
          The host has started without you. Stay on this page — when the lobby opens again you can join the next round.
        </Text>
        <View style={styles.pulseRow}>
          <View style={styles.pulseDot} />
          <Text style={styles.pulseText}>Waiting for lobby…</Text>
        </View>
        <Text style={styles.codeLabel}>Game code</Text>
        <Text style={styles.code}>{gameCode.toUpperCase()}</Text>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 24,
      gap: 10,
      alignItems: 'center',
    },
    emoji: {
      fontSize: 40,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
    },
    badge: {
      color: theme.primaryMuted,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heading: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      marginTop: 4,
    },
    body: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    pulseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    pulseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.primary,
    },
    pulseText: {
      color: theme.textFaint,
      fontSize: 14,
    },
    codeLabel: {
      color: theme.textFaint,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 12,
    },
    code: {
      color: theme.text,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: 4,
    },
  })
