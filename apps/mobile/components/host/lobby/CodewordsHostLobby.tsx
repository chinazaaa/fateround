import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { getSupabase } from '@/lib/supabase'
import { CODEWORDS_PLAYER_ROLE_SELECT } from '@/lib/supabase-selects'
import { deleteCodewordsHostRole, postCodewordsHostRole, postCodewordsRandomizeTeams } from '@/lib/game-api'
import { uniqueTopic } from '@/lib/realtime'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Team = 'red' | 'blue'
type Role = 'spymaster' | 'operative'
type RoleRow = { player_id: string; team: Team; role: Role }

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
}

const TEAM_COLOR: Record<Team, string> = { red: '#ef4444', blue: '#3b82f6' }
const otherTeam = (t: Team): Team => (t === 'red' ? 'blue' : 'red')

/** Host lobby team/role manager for Codewords (assign / bench / shuffle). */
export function CodewordsHostLobby({ gameCode, hostToken, game, players }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [shuffling, setShuffling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await getSupabase()
      .from('codewords_player_roles')
      .select(CODEWORDS_PLAYER_ROLE_SELECT)
      .eq('game_id', gameCode)
    if (!res.error) setRoles((res.data as RoleRow[]) ?? [])
  }, [gameCode])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`cw-host-roles-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'codewords_player_roles', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  const assign = async (playerId: string, team: Team, role: Role) => {
    if (busyId) return
    setBusyId(playerId)
    setError(null)
    try {
      await postCodewordsHostRole(gameCode, hostToken, playerId, team, role)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign')
    } finally {
      setBusyId(null)
    }
  }

  const bench = async (playerId: string) => {
    if (busyId) return
    setBusyId(playerId)
    setError(null)
    try {
      await deleteCodewordsHostRole(gameCode, hostToken, playerId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not bench')
    } finally {
      setBusyId(null)
    }
  }

  const shuffle = async () => {
    if (shuffling) return
    setShuffling(true)
    setError(null)
    try {
      await postCodewordsRandomizeTeams(gameCode, hostToken)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not shuffle')
    } finally {
      setShuffling(false)
    }
  }

  const roleFor = (playerId: string) => roles.find((r) => r.player_id === playerId)
  const active = players.filter((p) => !p.spectator)
  const unassigned = active.filter((p) => !roleFor(p.id))
  const randomize = game.codewords_randomize_teams === true
  const gameActive = game.status === 'active'

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Teams & roles</Text>
      <Text style={styles.hint}>
        {gameActive
          ? // Mid-game the shuffle button is hidden and the hint tells the host
            // WHY this panel exists in-play — a spymaster went AFK, a team-mate
            // needs promoting, someone should be benched.
            'Promote an operative to spymaster if one goes AFK, or bench a player.'
          : randomize
            ? 'Pick the two spymasters — operatives shuffle at start.'
            : 'Tap 🕵️/🎯 to set the role, the arrow to switch team, ✕ to bench.'}
      </Text>

      {active.length === 0 ? (
        <Text style={styles.empty}>Waiting for players to join…</Text>
      ) : (
        <>
          {/* Two red/blue columns (mirrors web CodewordsLobbyRoster): players
              grouped by team so the roster stays compact instead of one long row
              of chips per player. */}
          <View style={styles.grid}>
            {(['red', 'blue'] as Team[]).map((team) => {
              const members = active.filter((p) => roleFor(p.id)?.team === team)
              return (
                <View key={team} style={[styles.teamCard, { borderColor: TEAM_COLOR[team] }]}>
                  <View style={styles.teamHeader}>
                    <View style={[styles.teamBadge, { backgroundColor: TEAM_COLOR[team] }]}>
                      <Text style={styles.teamBadgeText}>{team === 'red' ? '🔴 Red' : '🔵 Blue'}</Text>
                    </View>
                    <Text style={styles.count}>{members.length}</Text>
                  </View>
                  <View style={styles.memberList}>
                    {members.length > 0 ? (
                      members.map((p) => {
                        const isSpy = roleFor(p.id)?.role === 'spymaster'
                        return (
                          <View key={p.id} style={styles.memberRow}>
                            <Text style={styles.memberName} numberOfLines={2}>
                              {isSpy ? '🕵️ ' : ''}
                              {p.name}
                            </Text>
                            <View style={styles.memberBtns}>
                              <Pressable
                                style={styles.miniBtn}
                                disabled={busyId === p.id}
                                onPress={() => void assign(p.id, team, isSpy ? 'operative' : 'spymaster')}
                              >
                                <Text style={styles.miniBtnText}>{isSpy ? '🎯' : '🕵️'}</Text>
                              </Pressable>
                              <Pressable
                                style={styles.miniBtn}
                                disabled={busyId === p.id}
                                onPress={() => void assign(p.id, otherTeam(team), isSpy ? 'spymaster' : 'operative')}
                              >
                                <Text style={styles.miniBtnText}>{team === 'red' ? '→' : '←'}</Text>
                              </Pressable>
                              <Pressable
                                style={styles.miniBtn}
                                disabled={busyId === p.id}
                                onPress={() => void bench(p.id)}
                              >
                                <Text style={styles.miniBtnText}>✕</Text>
                              </Pressable>
                            </View>
                          </View>
                        )
                      })
                    ) : (
                      <Text style={styles.membersMuted}>No players yet</Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>

          {unassigned.length > 0 ? (
            <View style={styles.unassignedBlock}>
              <Text style={styles.unassignedLabel}>Unassigned</Text>
              {unassigned.map((p) => (
                <View key={p.id} style={styles.memberRow}>
                  <Text style={styles.memberName} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <View style={styles.memberBtns}>
                    <Pressable
                      style={[styles.addBtn, { borderColor: TEAM_COLOR.red }]}
                      disabled={busyId === p.id}
                      onPress={() => void assign(p.id, 'red', 'operative')}
                    >
                      <Text style={[styles.addBtnText, { color: TEAM_COLOR.red }]}>🔴 Red</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.addBtn, { borderColor: TEAM_COLOR.blue }]}
                      disabled={busyId === p.id}
                      onPress={() => void assign(p.id, 'blue', 'operative')}
                    >
                      <Text style={[styles.addBtnText, { color: TEAM_COLOR.blue }]}>🔵 Blue</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {randomize && !gameActive ? (
        // Shuffle blows up the whole team layout, which only makes sense before
        // the round starts — hidden once the game is active.
        <Pressable
          style={[styles.shuffle, shuffling && styles.disabled]}
          disabled={shuffling}
          onPress={() => void shuffle()}
        >
          <Text style={styles.shuffleText}>{shuffling ? 'Shuffling…' : '🔀 Shuffle operatives'}</Text>
        </Pressable>
      ) : null}
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
    hint: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
    empty: { color: theme.textFaint, fontSize: 14, paddingVertical: theme.space.sm },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    teamCard: {
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: 0,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: 10,
      gap: 8,
    },
    teamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    teamBadge: { borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
    teamBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    count: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
    memberList: { gap: 8, minHeight: 22 },
    // Stack the name above its controls: in a narrow two-column card the name +
    // buttons don't fit on one row, so the name (esp. with the 🕵️ prefix) got
    // squeezed to nothing. The name now gets the full card width and can wrap.
    memberRow: { gap: 4 },
    memberName: { color: theme.text, fontSize: 14, fontWeight: '600' },
    memberBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    miniBtn: {
      minWidth: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      paddingHorizontal: 4,
    },
    miniBtnText: { color: theme.textSecondary, fontSize: 13, fontWeight: '800' },
    membersMuted: { color: theme.textFaint, fontSize: 12, fontStyle: 'italic' },
    unassignedBlock: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: theme.space.sm, gap: 6 },
    unassignedLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    addBtn: { borderWidth: 1, borderRadius: theme.radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
    addBtnText: { fontSize: 12, fontWeight: '800' },
    error: { color: theme.error, fontSize: 13 },
    shuffle: {
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: theme.space.xs,
    },
    shuffleText: { color: theme.textSecondary, fontWeight: '700', fontSize: 15 },
    disabled: { opacity: 0.5 },
  })
