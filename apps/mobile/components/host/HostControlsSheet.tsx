import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game, Player } from '@fateround/shared'
import { gameAllowsLatePlayerJoin, gameSupportsViewerSetting, lateJoinPolicyFromGame } from '@fateround/shared/viewers'
import { patchGameSettings, patchPlayerName, postFinishGame, postPlayAgain, removePlayerAsHost } from '@/lib/game-api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { SettingToggle } from '@/components/create/SettingToggle'
import { LateJoinPolicyPicker } from '@/components/create/LateJoinPolicyPicker'
import { WordRushHostRoundControl } from '@/components/games/WordRushHostRoundControl'
import { QuickDrawHostAdvanceControl } from '@/components/games/QuickDrawHostAdvanceControl'
import { AddGameTimeControl } from '@/components/host/AddGameTimeControl'
import { RotatePlayerCodeRow } from '@/components/session/RotatePlayerCodeRow'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  visible: boolean
  onClose: () => void
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  hostPlayerId: string | null
  /** Host's own resume token — enables renaming their seated player. */
  hostResumeToken: string | null
  onReload: () => void | Promise<unknown>
  /** Opens the host-transfer flow (pick a player to take over). */
  onTransfer: () => void
}

/**
 * The host's in-game control surface, opened from the ⚙ Host button. Keeps the
 * host on the game (Play view) while exposing player management and session
 * controls in an overlay rather than a separate tab.
 */
export function HostControlsSheet({
  visible,
  onClose,
  gameCode,
  hostToken,
  game,
  players,
  hostPlayerId,
  hostResumeToken,
  onReload,
  onTransfer,
}: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  // Drop any in-progress rename when the sheet is dismissed.
  useEffect(() => {
    if (!visible) setEditingName(false)
  }, [visible])

  const activePlayers = players.filter((p) => !p.spectator)
  const finished = game.status === 'finished'
  const active = game.status === 'active'
  // View-only games have no view-vs-play choice — hide the late-join line entirely.
  const showLateJoin = gameSupportsViewerSetting(game.game_type) && gameAllowsLatePlayerJoin(game.game_type)

  // Visibility + late-join are live-editable mid-game (server allows these two
  // via the game PATCH route). Other settings (rounds/time) stay lobby-only.
  const saveSetting = (key: string, patch: Parameters<typeof patchGameSettings>[2]) =>
    run(`setting-${key}`, () => patchGameSettings(gameCode, hostToken, patch))

  const run = async (key: string, fn: () => Promise<unknown>, close = false) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await onReload()
      if (close) onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const confirmRemove = (player: Player) => {
    Alert.alert('Remove player', `Remove ${player.name} from the game?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void run(`remove-${player.id}`, () => removePlayerAsHost(gameCode, player.id, hostToken)),
      },
    ])
  }

  const startEditName = (currentName: string) => {
    setError(null)
    setNameDraft(currentName)
    setEditingName(true)
  }

  const saveName = () => {
    const trimmed = nameDraft.trim()
    if (!trimmed || !hostPlayerId || !hostResumeToken || busy) return
    void run('rename', async () => {
      await patchPlayerName(gameCode, hostPlayerId, trimmed, hostResumeToken)
      // Keep the on-device session name in sync so it persists across reloads.
      const s = await getPlayerSession(gameCode)
      if (s) await setPlayerSession(gameCode, s.playerId, trimmed, s.playerGender, s.resumeToken)
      setEditingName(false)
    })
  }

  const confirmEndGame = () => {
    Alert.alert('End game', 'End the game for everyone now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End game',
        style: 'destructive',
        onPress: () => void run('finish', () => postFinishGame(gameCode, hostToken), true),
      },
    ])
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Host settings</Text>
          <Pressable hitSlop={12} onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>Players · {activePlayers.length}</Text>
          {activePlayers.length === 0 ? (
            <Text style={styles.muted}>No players yet.</Text>
          ) : (
            activePlayers.map((p) => {
              const isHost = p.id === hostPlayerId
              const canEditSelf = isHost && !!hostResumeToken
              if (isHost && editingName) {
                return (
                  <View key={p.id} style={styles.playerRow}>
                    <TextInput
                      style={styles.nameInput}
                      value={nameDraft}
                      onChangeText={setNameDraft}
                      placeholder="Your name"
                      placeholderTextColor={theme.textFaint}
                      autoCapitalize="words"
                      autoFocus
                      maxLength={24}
                      returnKeyType="done"
                      onSubmitEditing={saveName}
                    />
                    <Pressable onPress={saveName} disabled={busy === 'rename' || !nameDraft.trim()} hitSlop={8}>
                      {busy === 'rename' ? (
                        <ActivityIndicator color={theme.primaryMuted} />
                      ) : (
                        <Text style={[styles.editText, !nameDraft.trim() && styles.editDisabled]}>Save</Text>
                      )}
                    </Pressable>
                    <Pressable onPress={() => setEditingName(false)} disabled={busy === 'rename'} hitSlop={8}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                  </View>
                )
              }
              return (
                <View key={p.id} style={styles.playerRow}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {p.name}
                    {isHost ? <Text style={styles.hostTag}> · you</Text> : null}
                  </Text>
                  {canEditSelf ? (
                    <Pressable onPress={() => startEditName(p.name)} hitSlop={8}>
                      <Text style={styles.editText}>Edit name</Text>
                    </Pressable>
                  ) : !isHost ? (
                    <Pressable onPress={() => confirmRemove(p)} disabled={busy === `remove-${p.id}`}>
                      {busy === `remove-${p.id}` ? (
                        <ActivityIndicator color={theme.error} />
                      ) : (
                        <Text style={styles.removeText}>Remove</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              )
            })
          )}

          <Text style={[styles.sectionLabel, styles.sectionSpacer]}>Game settings</Text>
          <SettingToggle
            label="Public game"
            description="Listed in Browse for anyone to find and join"
            value={!!game.is_public}
            onChange={(v) => void saveSetting('public', { is_public: v })}
            disabled={busy === 'setting-public'}
          />
          {showLateJoin ? (
            <View style={styles.settingBlock}>
              <Text style={styles.settingTitle}>Late join</Text>
              <LateJoinPolicyPicker
                gameType={game.game_type}
                value={lateJoinPolicyFromGame(game)}
                onChange={(v) => void saveSetting('late', { late_join_policy: v })}
              />
            </View>
          ) : null}
          <Text style={styles.note}>Rounds & timing can only be changed from the lobby.</Text>

          <Text style={[styles.sectionLabel, styles.sectionSpacer]}>Session</Text>

          {finished ? (
            <>
              <Pressable
                style={[styles.primaryBtn, busy === 'replay' && styles.btnDisabled]}
                disabled={!!busy}
                onPress={() => void run('replay', () => postPlayAgain(gameCode, hostToken, true, hostPlayerId), true)}
              >
                {busy === 'replay' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Play again · same settings</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, busy === 'lobby' && styles.btnDisabled]}
                disabled={!!busy}
                onPress={() => void run('lobby', () => postPlayAgain(gameCode, hostToken, false, hostPlayerId), true)}
              >
                {busy === 'lobby' ? (
                  <ActivityIndicator color={theme.text} />
                ) : (
                  <Text style={styles.secondaryBtnText}>Return to lobby</Text>
                )}
              </Pressable>
            </>
          ) : null}

          <Pressable style={styles.secondaryBtn} onPress={onTransfer}>
            <Text style={styles.secondaryBtnText}>Transfer host to another player</Text>
          </Pressable>

          {hostResumeToken ? (
            <RotatePlayerCodeRow
              gameCode={gameCode}
              style={styles.secondaryBtn}
              textStyle={styles.secondaryBtnText}
              spinnerColor={theme.text}
            />
          ) : null}

          {active && game.game_type === 'word_rush' ? (
            <WordRushHostRoundControl gameCode={gameCode} hostToken={hostToken} onReload={onReload} />
          ) : null}

          {active && game.game_type === 'quick_draw' ? (
            <QuickDrawHostAdvanceControl gameCode={gameCode} hostToken={hostToken} game={game} onReload={onReload} />
          ) : null}

          <AddGameTimeControl gameCode={gameCode} hostToken={hostToken} game={game} onExtended={onReload} />

          {active ? (
            <Pressable
              style={[styles.dangerBtn, busy === 'finish' && styles.btnDisabled]}
              disabled={!!busy}
              onPress={confirmEndGame}
            >
              <Text style={styles.dangerBtnText}>End game</Text>
            </Pressable>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.lg,
      paddingVertical: theme.space.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    title: { color: theme.text, fontSize: 20, fontWeight: '800' },
    close: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
    body: { padding: theme.space.lg, gap: theme.space.sm, paddingBottom: 40 },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    sectionSpacer: { marginTop: theme.space.md },
    muted: { color: theme.textMuted, fontSize: 14 },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.md,
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: theme.space.md,
      paddingVertical: 12,
    },
    playerName: { color: theme.text, fontSize: 16, fontWeight: '600', flex: 1 },
    hostTag: { color: theme.textFaint, fontSize: 13, fontWeight: '700' },
    removeText: { color: theme.error, fontSize: 14, fontWeight: '700' },
    editText: { color: theme.primaryMuted, fontSize: 14, fontWeight: '700' },
    editDisabled: { opacity: 0.5 },
    cancelText: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
    nameInput: {
      flex: 1,
      color: theme.text,
      fontSize: 16,
      fontWeight: '600',
      paddingVertical: 0,
    },
    settingBlock: { gap: theme.space.xs },
    settingTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
    note: { color: theme.textFaint, fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondaryBtn: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: { color: theme.text, fontWeight: '700', fontSize: 15 },
    dangerBtn: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.error,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: theme.space.sm,
    },
    dangerBtnText: { color: theme.error, fontWeight: '700', fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
    error: { color: theme.error, fontSize: 14, textAlign: 'center', marginTop: theme.space.sm },
  })
