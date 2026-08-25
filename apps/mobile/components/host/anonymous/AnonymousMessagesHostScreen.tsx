import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { AnonymousMessage, Game, Player } from '@fateround/shared'
import {
  anonymousSessionSecondsLeft,
  banSecondsLeft,
  formatBanCountdown,
  formatSessionCountdown,
  isPlayerBanned,
} from '@fateround/shared/anonymous-messages'
import {
  deleteAnonymousMessage,
  muteAnonymousPlayer,
  postFinishGame,
  postPlayAgain,
  removePlayerAsHost,
  unmuteAnonymousPlayer,
} from '@/lib/game-api'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { ANONYMOUS_MESSAGE_SELECT, ANONYMOUS_ROOM_BAN_SELECT } from '@/lib/supabase-selects'
import { uniqueTopic } from '@/lib/realtime'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { useToast } from '@/components/ui/Toast'
import {
  ANONYMOUS_ROOM_BAN_MINUTE_OPTIONS,
  ANONYMOUS_ROOM_DEFAULT_BAN_MINUTES,
  anonymousRoomMaxPlayers,
  countAnonymousRoomPresence,
} from '@/components/host/anonymous/anon-host-helpers'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type BanRow = { player_id: string; banned_until: string | null }

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function AnonymousMessagesHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const styles = useThemedStyles(makeStyles)
  const code = gameCode.toUpperCase()
  const { error: toastError, success } = useToast()

  const [messages, setMessages] = useState<AnonymousMessage[]>([])
  const [bans, setBans] = useState<BanRow[]>([])
  const [muteMinutes, setMuteMinutes] = useState<number>(ANONYMOUS_ROOM_DEFAULT_BAN_MINUTES)
  const [removingMessageId, setRemovingMessageId] = useState<string | null>(null)
  const [mutingPlayerId, setMutingPlayerId] = useState<string | null>(null)
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [, setTick] = useState(0)

  const active = game.status === 'active'
  const finished = game.status === 'finished'
  const lobbyActionsEnabled = game.status === 'waiting' || game.status === 'active'

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players])

  const loadMessages = useCallback(async () => {
    const res = await getSupabase()
      .from('anonymous_messages')
      .select(ANONYMOUS_MESSAGE_SELECT)
      .eq('game_id', code)
      .order('created_at', { ascending: true })
    if (res.error) return
    setMessages(
      ((res.data as AnonymousMessage[]) ?? []).map((row) => ({
        ...row,
        player_name: nameById.get(row.player_id) ?? 'Unknown',
      }))
    )
  }, [code, nameById])

  const loadBans = useCallback(async () => {
    const res = await getSupabase().from('anonymous_room_bans').select(ANONYMOUS_ROOM_BAN_SELECT).eq('game_id', code)
    if (res.error) return
    setBans((res.data as BanRow[]) ?? [])
  }, [code])

  useEffect(() => {
    void loadMessages()
    void loadBans()
  }, [loadMessages, loadBans])

  // Live message + ban feed while the session is running.
  useEffect(() => {
    if (!active) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`anon-host-${code}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'anonymous_messages', filter: `game_id=eq.${code}` },
        () => {
          void loadMessages()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'anonymous_room_bans', filter: `game_id=eq.${code}` },
        () => {
          void loadBans()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${code}` }, () => {
        onReload()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [active, code, loadMessages, loadBans, onReload])

  // 1s tick keeps mute + session countdowns fresh.
  useEffect(() => {
    if (!active && !bans.length) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [active, bans.length])

  const banForPlayer = useCallback((playerId: string) => bans.find((b) => b.player_id === playerId) ?? null, [bans])

  const onRemoveMessage = async (messageId: string) => {
    setRemovingMessageId(messageId)
    try {
      await deleteAnonymousMessage(code, messageId, hostToken)
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
      success('Message removed')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove message')
    } finally {
      setRemovingMessageId(null)
    }
  }

  const onMute = async (playerId: string) => {
    setMutingPlayerId(playerId)
    try {
      await muteAnonymousPlayer(code, playerId, hostToken, muteMinutes)
      await loadBans()
      success(`Muted for ${muteMinutes} min`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mute player')
    } finally {
      setMutingPlayerId(null)
    }
  }

  const onUnmute = async (playerId: string) => {
    setMutingPlayerId(playerId)
    try {
      await unmuteAnonymousPlayer(code, playerId, hostToken)
      await loadBans()
      success('Player unmuted')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to unmute player')
    } finally {
      setMutingPlayerId(null)
    }
  }

  const onRemovePlayer = (playerId: string, playerName: string) => {
    Alert.alert(`Remove ${playerName}?`, 'They’ll be kicked from the room.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemovingPlayerId(playerId)
          try {
            await removePlayerAsHost(code, playerId, hostToken)
            onReload()
          } catch (err) {
            toastError(err instanceof Error ? err.message : 'Failed to remove player')
          } finally {
            setRemovingPlayerId(null)
          }
        },
      },
    ])
  }

  const onEndSession = () => {
    Alert.alert('End session', 'End the session for everyone now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: async () => {
          setActing(true)
          try {
            await postFinishGame(code, hostToken)
            onReload()
          } catch (err) {
            toastError(err instanceof Error ? err.message : 'Could not end session')
          } finally {
            setActing(false)
          }
        },
      },
    ])
  }

  const onPlayAgain = async () => {
    setActing(true)
    try {
      await postPlayAgain(code, hostToken, true)
      onReload()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Play again failed')
    } finally {
      setActing(false)
    }
  }

  const presence = countAnonymousRoomPresence(players, game)
  const roomCapacity = anonymousRoomMaxPlayers(game)
  const sessionSeconds = anonymousSessionSecondsLeft(game.session_started_at)

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game} players={players} onReload={onReload}>
      {finished ? (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryEmoji}>🎭</Text>
            <Text style={styles.summaryTitle}>Anonymous Room</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Status</Text>
                <Text style={styles.summaryValue}>Finished</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Attended</Text>
                <Text style={styles.summaryValue}>
                  {players.length} {players.length === 1 ? 'person' : 'people'}
                </Text>
              </View>
              {game.session_started_at ? (
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryLabel}>Started</Text>
                  <Text style={styles.summaryValueSmall}>{formatDate(game.session_started_at)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.summaryFootnote}>Messages from this session are not stored in game history.</Text>
          </View>

          <Pressable
            style={[styles.primaryBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => void onPlayAgain()}
          >
            {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Play again</Text>}
          </Pressable>
          <GameFinishedActions gameCode={gameCode} gameType={game.game_type} gameTitle={game.title} />
        </>
      ) : (
        <>
          {active ? (
            <View style={styles.timerBar}>
              <Text style={styles.timerLabel}>Session</Text>
              <Text style={styles.timerValue}>
                {game.session_started_at ? formatSessionCountdown(sessionSeconds) : 'Live'}
              </Text>
            </View>
          ) : null}

          {/* Presence + player management */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{active ? 'In the room' : 'In the lobby'}</Text>
              <Text style={styles.cardCount}>
                {active
                  ? `${presence.participants} ${presence.participants === 1 ? 'player' : 'players'}${
                      presence.viewers > 0 ? ` · ${presence.viewers} viewing` : ''
                    }`
                  : `${players.length} / ${roomCapacity}`}
              </Text>
            </View>

            {lobbyActionsEnabled && players.length > 0 ? (
              <View style={styles.muteRow}>
                <Text style={styles.muteLabel}>Mute duration</Text>
                <View style={styles.muteOptions}>
                  {ANONYMOUS_ROOM_BAN_MINUTE_OPTIONS.map((m) => {
                    const selected = m === muteMinutes
                    return (
                      <Pressable
                        key={m}
                        style={[styles.muteChip, selected && styles.muteChipSelected]}
                        onPress={() => setMuteMinutes(m)}
                      >
                        <Text style={[styles.muteChipText, selected && styles.muteChipTextSelected]}>{m}m</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : null}

            {players.length === 0 ? (
              <Text style={styles.empty}>Waiting for players…</Text>
            ) : (
              players.map((player) => {
                const ban = banForPlayer(player.id)
                const muted = isPlayerBanned(ban?.banned_until)
                const mutedLabel =
                  muted && ban ? `Muted · ${formatBanCountdown(banSecondsLeft(ban.banned_until))}` : null
                return (
                  <View key={player.id} style={styles.playerRow}>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName} numberOfLines={1}>
                        {player.name}
                      </Text>
                      {mutedLabel ? <Text style={styles.mutedLabel}>{mutedLabel}</Text> : null}
                    </View>
                    {lobbyActionsEnabled ? (
                      <View style={styles.playerActions}>
                        {muted ? (
                          <Pressable
                            disabled={mutingPlayerId === player.id}
                            onPress={() => void onUnmute(player.id)}
                            hitSlop={6}
                          >
                            <Text style={styles.unmuteText}>{mutingPlayerId === player.id ? '…' : 'Unmute'}</Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            disabled={mutingPlayerId === player.id}
                            onPress={() => void onMute(player.id)}
                            hitSlop={6}
                          >
                            <Text style={styles.muteText}>{mutingPlayerId === player.id ? '…' : 'Mute'}</Text>
                          </Pressable>
                        )}
                        <Pressable
                          disabled={removingPlayerId === player.id}
                          onPress={() => onRemovePlayer(player.id, player.name ?? 'this player')}
                          hitSlop={6}
                        >
                          <Text style={styles.removeText}>{removingPlayerId === player.id ? '…' : 'Remove'}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                )
              })
            )}
          </View>

          {/* Live watch feed */}
          {active ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Live anonymous messages</Text>
              {messages.length === 0 ? (
                <Text style={styles.empty}>No messages yet.</Text>
              ) : (
                <FlatList
                  style={styles.messageList}
                  data={messages}
                  keyExtractor={(m) => m.id}
                  nestedScrollEnabled
                  renderItem={({ item: m }) => {
                    const isGif = m.message_type === 'gif' && !!m.media_url
                    return (
                      <View style={styles.messageRow}>
                        <View style={styles.messageBody}>
                          <Text style={styles.messageAuthor}>{m.player_name ?? 'Unknown'}</Text>
                          {m.reply_to_text ? (
                            <Text style={styles.replyQuote} numberOfLines={1}>
                              {m.reply_to_text}
                            </Text>
                          ) : null}
                          {isGif ? (
                            <Image source={{ uri: m.media_url! }} style={styles.gif} contentFit="cover" />
                          ) : (
                            <Text style={styles.messageText}>{m.text}</Text>
                          )}
                        </View>
                        <Pressable
                          disabled={removingMessageId === m.id}
                          onPress={() => void onRemoveMessage(m.id)}
                          hitSlop={6}
                        >
                          <Text style={styles.removeText}>{removingMessageId === m.id ? '…' : 'Remove'}</Text>
                        </Pressable>
                      </View>
                    )
                  }}
                />
              )}
            </View>
          ) : null}

          {active ? (
            <Pressable
              style={[styles.dangerBtn, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => void onEndSession()}
            >
              <Text style={styles.dangerBtnText}>End session</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </HostChrome>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    timerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.primarySoft,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    timerLabel: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    timerValue: { color: theme.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    cardCount: { color: theme.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
    muteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    muteLabel: {
      color: theme.textFaint,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    muteOptions: { flexDirection: 'row', gap: 6 },
    muteChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    muteChipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    muteChipText: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    muteChipTextSelected: { color: '#fff' },
    empty: { color: theme.textFaint, fontSize: 14, paddingVertical: 8 },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 6,
    },
    playerInfo: { flex: 1, minWidth: 0 },
    playerName: { color: theme.text, fontSize: 15, fontWeight: '600' },
    mutedLabel: { color: theme.error, fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
    playerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    muteText: { color: '#f59e0b', fontSize: 13, fontWeight: '700' },
    unmuteText: { color: '#34d399', fontSize: 13, fontWeight: '700' },
    removeText: { color: theme.error, fontSize: 13, fontWeight: '700' },
    // Bounded so the virtualized live feed scrolls within its own box (only
    // visible rows render) instead of growing the page scroll unboundedly.
    messageList: { maxHeight: 420 },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    messageBody: { flex: 1, minWidth: 0 },
    messageAuthor: { color: theme.textMuted, fontSize: 11, marginBottom: 2, fontWeight: '600' },
    replyQuote: {
      color: theme.textFaint,
      fontSize: 12,
      fontStyle: 'italic',
      marginBottom: 4,
      borderLeftWidth: 2,
      borderLeftColor: theme.primaryMuted,
      paddingLeft: 6,
    },
    messageText: { color: theme.text, fontSize: 15 },
    gif: { width: 160, height: 120, borderRadius: 8, backgroundColor: theme.bg },
    summaryCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      gap: 16,
      alignItems: 'center',
    },
    summaryEmoji: { fontSize: 40 },
    summaryTitle: { color: theme.textMuted, fontSize: 14 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
    summaryCell: { width: '50%', paddingVertical: 6 },
    summaryLabel: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    summaryValue: { color: theme.text, fontSize: 15, fontWeight: '600', marginTop: 2 },
    summaryValueSmall: { color: theme.text, fontSize: 13, marginTop: 2 },
    summaryFootnote: { color: theme.textFaint, fontSize: 12, textAlign: 'center', lineHeight: 18 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    // White on the solid rose button — intentional, correct in both schemes.
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    dangerBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.error,
      paddingVertical: 14,
      alignItems: 'center',
    },
    dangerBtnText: { color: theme.error, fontWeight: '700', fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
  })
