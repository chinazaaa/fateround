import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { getSupabase } from '@/lib/supabase'
import { CODEWORDS_PLAYER_ROLE_SELECT } from '@/lib/supabase-selects'
import {
  deleteCodewordsHostRole,
  postCodewordsHostRole,
  postCodewordsRandomizeTeams,
} from '@/lib/game-api'
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
const ASSIGN: { team: Team; role: Role; label: string }[] = [
  { team: 'red', role: 'spymaster', label: '🔴 Spy' },
  { team: 'red', role: 'operative', label: '🔴 Op' },
  { team: 'blue', role: 'spymaster', label: '🔵 Spy' },
  { team: 'blue', role: 'operative', label: '🔵 Op' },
]

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
  const randomize = game.codewords_randomize_teams === true

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Teams & roles</Text>
      <Text style={styles.hint}>
        {randomize
          ? 'Pick the two spymasters — operatives shuffle at start.'
          : 'Assign each player to a team and role.'}
      </Text>

      {active.length === 0 ? (
        <Text style={styles.empty}>Waiting for players to join…</Text>
      ) : (
        active.map((p) => {
          const current = roleFor(p.id)
          return (
            <View key={p.id} style={styles.row}>
              <View style={styles.nameCol}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                {current ? (
                  <Text style={[styles.badge, { color: TEAM_COLOR[current.team] }]}>
                    {current.team === 'red' ? '🔴' : '🔵'} {current.role === 'spymaster' ? 'Spymaster' : 'Operative'}
                  </Text>
                ) : (
                  <Text style={styles.unassigned}>Unassigned</Text>
                )}
              </View>
              <View style={styles.chips}>
                {ASSIGN.map((a) => {
                  const on = current?.team === a.team && current?.role === a.role
                  return (
                    <Pressable
                      key={`${a.team}-${a.role}`}
                      style={[styles.chip, on && { borderColor: TEAM_COLOR[a.team], backgroundColor: `${TEAM_COLOR[a.team]}22` }]}
                      disabled={busyId === p.id}
                      onPress={() => void assign(p.id, a.team, a.role)}
                    >
                      <Text style={[styles.chipText, on && { color: TEAM_COLOR[a.team] }]}>{a.label}</Text>
                    </Pressable>
                  )
                })}
                {current ? (
                  <Pressable style={styles.bench} disabled={busyId === p.id} onPress={() => void bench(p.id)}>
                    <Text style={styles.benchText}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )
        })
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {randomize ? (
        <Pressable style={[styles.shuffle, shuffling && styles.disabled]} disabled={shuffling} onPress={() => void shuffle()}>
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
  row: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: theme.space.sm,
    gap: 6,
  },
  nameCol: { gap: 2 },
  name: { color: theme.text, fontSize: 15, fontWeight: '700' },
  badge: { fontSize: 12, fontWeight: '800' },
  unassigned: { color: theme.textFaint, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  chipText: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
  bench: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  benchText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
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
