import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { GameType, Player } from '@fateround/shared'
import { MONOPOLY_PLAYER_TOKENS, takenMonopolyTokens } from '@fateround/shared/monopoly-tokens'
import { joinGame } from '@/lib/api'
import { patchPlayerName, leaveGame } from '@/lib/game-api'
import { getRememberedName, rememberName } from '@/lib/identity-local'
import { clearPlayerSession, setPlayerSession, type PlayerSession } from '@/lib/secure-session'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  gameType: GameType
  players: Player[]
  session: PlayerSession | null
  onSessionChange: (session: PlayerSession | null) => void
  onReload: () => void
  /** Opens the host-transfer flow — shown beside Rename/Stop playing when seated. */
  onTransfer?: () => void
}

/**
 * Host "play along" from the lobby — join as a player while keeping the host
 * token (spectator ↔ player), rename in place, or drop the seat. Batch 23.
 */
export function HostLobbyPlayCard({
  gameCode,
  gameType,
  players,
  session,
  onSessionChange,
  onReload,
  onTransfer,
}: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [name, setName] = useState(session?.playerName ?? '')
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  // Prefill the host's name from the same "remembered name" store the JoinScreen
  // uses, so a host who's already told the app their name doesn't have to retype
  // it on the Play-along card. Weakest source by design: never overrides a name
  // already provided (existing session, or typed).
  const nameRef = useRef(name)
  nameRef.current = name
  const prefilledRef = useRef(false)
  useEffect(() => {
    if (prefilledRef.current) return
    prefilledRef.current = true
    if (session?.playerName?.trim()) return
    let cancelled = false
    void getRememberedName().then((remembered) => {
      if (cancelled || !remembered || nameRef.current.trim()) return
      setName(remembered)
    })
    return () => {
      cancelled = true
    }
    // Mount-only: a prefill that fired later would fight the host's own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isMonopoly = gameType === 'monopoly'
  const taken = isMonopoly ? takenMonopolyTokens(players) : new Set<string>()
  const needsToken = isMonopoly && !token

  const onJoin = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy || needsToken) return
    setBusy(true)
    setError(null)
    try {
      const data = await joinGame({ gameCode, playerName: trimmed, monopolyToken: token })
      const next: PlayerSession = {
        playerId: data.playerId,
        playerName: data.playerName,
        playerGender: data.playerGender ?? 'both',
        resumeToken: data.resumeToken ?? null,
      }
      await setPlayerSession(gameCode, next.playerId, next.playerName, next.playerGender, next.resumeToken)
      // Persist the name for the next Join / Create prefill.
      void rememberName(trimmed)
      onSessionChange(next)
      onReload()
    } catch (err) {
      const full = (err as { full?: boolean })?.full === true
      setError(
        full
          ? 'Game is full — remove a player to free a seat, then Play as yourself.'
          : err instanceof Error
            ? err.message
            : 'Could not join'
      )
    } finally {
      setBusy(false)
    }
  }

  const onRename = async () => {
    const trimmed = name.trim()
    if (!session?.resumeToken || !trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await patchPlayerName(gameCode, session.playerId, trimmed, session.resumeToken)
      const next: PlayerSession = { ...session, playerName: trimmed }
      await setPlayerSession(gameCode, next.playerId, next.playerName, next.playerGender, next.resumeToken)
      // Keep the remembered name in sync with the rename.
      void rememberName(trimmed)
      onSessionChange(next)
      setRenaming(false)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename')
    } finally {
      setBusy(false)
    }
  }

  const onStop = async () => {
    if (!session?.resumeToken || busy) return
    setBusy(true)
    setError(null)
    try {
      await leaveGame(gameCode, session.playerId, session.resumeToken)
      await clearPlayerSession(gameCode)
      onSessionChange(null)
      setRenaming(false)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop playing')
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Play along</Text>
        <Text style={styles.hint}>
          Take a seat in your own game. Your host controls stay on this device — switch back any time.
        </Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="words"
        />
        {isMonopoly ? (
          <View style={styles.tokens}>
            <Text style={styles.tokenLabel}>Pick your token</Text>
            <View style={styles.tokenGrid}>
              {MONOPOLY_PLAYER_TOKENS.map((t) => {
                const isTaken = taken.has(t.id)
                const selected = token === t.id
                return (
                  <Pressable
                    key={t.id}
                    style={[styles.token, selected && styles.tokenOn, isTaken && styles.tokenTaken]}
                    disabled={isTaken}
                    onPress={() => setToken(t.id)}
                  >
                    <Text style={styles.tokenEmoji}>{t.emoji}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.primary, (!name.trim() || busy || needsToken) && styles.disabled]}
          disabled={!name.trim() || busy || needsToken}
          onPress={() => void onJoin()}
        >
          <Text style={styles.primaryText}>{busy ? 'Joining…' : 'Play as yourself'}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>You’re playing</Text>
      {renaming ? (
        <>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="words"
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.primary, styles.flex, (!name.trim() || busy) && styles.disabled]}
              disabled={!name.trim() || busy}
              onPress={() => void onRename()}
            >
              <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save name'}</Text>
            </Pressable>
            <Pressable
              style={[styles.secondary, styles.flex]}
              onPress={() => {
                setName(session.playerName)
                setRenaming(false)
                setError(null)
              }}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.seatName}>{session.playerName}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.secondary, styles.flex, busy && styles.disabled]}
              disabled={busy}
              onPress={() => {
                setName(session.playerName)
                setRenaming(true)
              }}
            >
              <Text style={styles.secondaryText}>Rename</Text>
            </Pressable>
            <Pressable
              style={[styles.secondary, styles.flex, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void onStop()}
            >
              <Text style={styles.secondaryText} numberOfLines={1}>
                {busy ? '…' : 'Stop playing'}
              </Text>
            </Pressable>
          </View>
          {onTransfer ? (
            <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={onTransfer}>
              <Text style={styles.secondaryText} numberOfLines={1}>
                Transfer host
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: theme.space.sm,
      marginTop: theme.space.md,
    },
    title: { color: theme.text, fontSize: 17, fontWeight: '800' },
    hint: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
    seatName: { color: theme.primaryMuted, fontSize: 18, fontWeight: '800' },
    tokens: { gap: 6 },
    tokenLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    tokenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
    token: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tokenOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    tokenTaken: { opacity: 0.3 },
    tokenEmoji: { fontSize: 22 },
    input: {
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.sm,
      color: theme.text,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
    },
    error: { color: theme.error, fontSize: 13 },
    row: { flexDirection: 'row', gap: theme.space.sm },
    flex: { flex: 1 },
    primary: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondary: {
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryText: { color: theme.textSecondary, fontWeight: '700', fontSize: 15 },
    disabled: { opacity: 0.5 },
  })
