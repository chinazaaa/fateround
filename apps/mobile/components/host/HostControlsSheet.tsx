import { useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game, Player } from '@fateround/shared'
import { gameSupportsViewerSetting, lateJoinPolicyFromGame } from '@fateround/shared/viewers'
import { patchGameSettings, postFinishGame, postPlayAgain, removePlayerAsHost } from '@/lib/game-api'
import { SettingToggle } from '@/components/create/SettingToggle'
import { LateJoinPolicyPicker } from '@/components/create/LateJoinPolicyPicker'
import { WordRushHostRoundControl } from '@/components/games/WordRushHostRoundControl'
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
  onReload,
  onTransfer,
}: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activePlayers = players.filter((p) => !p.spectator)
  const finished = game.status === 'finished'
  const active = game.status === 'active'
  const showLateJoin = gameSupportsViewerSetting(game.game_type)

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
              return (
                <View key={p.id} style={styles.playerRow}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {p.name}
                    {isHost ? <Text style={styles.hostTag}>  · host</Text> : null}
                  </Text>
                  {!isHost ? (
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

          {active && game.game_type === 'word_rush' ? (
            <WordRushHostRoundControl gameCode={gameCode} hostToken={hostToken} onReload={onReload} />
          ) : null}

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
