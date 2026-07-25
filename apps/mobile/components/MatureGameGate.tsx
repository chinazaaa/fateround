import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { GameType } from '@fateround/shared'
import {
  acknowledgeMature,
  hasAcknowledgedMature,
  isMatureGame,
  MATURE_NOTICE_BODY,
  MATURE_NOTICE_TITLE,
  matureGameReason,
} from '@/lib/game-maturity'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameType: GameType | string | null | undefined
}

/**
 * Content warning shown before a player sees a mature game.
 *
 * Rendered as a Modal overlay rather than an early-return guard on purpose: the
 * screen underneath stays mounted, so joining, realtime subscriptions and the
 * host's round timer all keep running while the notice is up. A blocking guard
 * would desync anyone who paused to read it.
 *
 * This is an acknowledgement, not age verification — see `lib/game-maturity.ts`
 * for why we do not collect a date of birth. Mount it on both the player game
 * screen and the host screen, since it covers hosts and joiners alike.
 */
export function MatureGameGate({ gameType }: Props) {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const mature = !!gameType && isMatureGame(gameType as GameType)
  // Start acknowledged so the notice never flashes before SecureStore is
  // readable; the effect below corrects it once the check resolves.
  const [acked, setAcked] = useState(true)

  useEffect(() => {
    if (!mature) return
    let cancelled = false
    void hasAcknowledgedMature().then((value) => {
      if (!cancelled) setAcked(value)
    })
    return () => {
      cancelled = true
    }
  }, [mature])

  if (!mature || acked) return null

  const accept = () => {
    setAcked(true)
    void acknowledgeMature()
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>🔞</Text>
          </View>
          <Text style={styles.title}>{MATURE_NOTICE_TITLE}</Text>
          <Text style={styles.reason}>{matureGameReason(gameType as GameType)}</Text>
          <Text style={styles.body}>{MATURE_NOTICE_BODY}</Text>

          <Pressable style={styles.acceptBtn} onPress={accept}>
            <Text style={styles.acceptText}>I&rsquo;m 18 or older — continue</Text>
          </Pressable>
          <Pressable style={styles.declineBtn} onPress={() => router.replace('/')}>
            <Text style={styles.declineText}>Take me back to the games</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.space.lg,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.lg,
      alignItems: 'center',
    },
    iconWrap: {
      height: 48,
      width: 48,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.space.sm,
    },
    icon: { fontSize: 22 },
    title: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 4,
    },
    reason: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: theme.space.sm,
    },
    body: {
      color: theme.textFaint,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: theme.space.sm,
    },
    acceptBtn: {
      width: '100%',
      height: 48,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.space.lg,
    },
    acceptText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
    },
    declineBtn: {
      width: '100%',
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.space.xs,
    },
    declineText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
  })
