import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { clampDescribeItTeams } from '@fateround/shared/describe-it'
import { clampWordRushTeams } from '@fateround/shared/word-rush'
import { clampQuickDrawNumTeams } from '@fateround/shared/quick-draw-guess'
import { getSupabase } from '@/lib/supabase'
import {
  DESCRIBE_IT_PLAYER_SELECT,
  QUICK_DRAW_GUESS_PLAYER_SELECT,
  WORD_RUSH_PLAYER_SELECT,
} from '@/lib/supabase-selects'
import {
  postDescribeItBalance,
  postDescribeItTeamHost,
  postQuickDrawGuessTeamHost,
  postWordRushBalance,
  postWordRushShuffle,
  postWordRushTeamHost,
} from '@/lib/game-api'
import { uniqueTopic } from '@/lib/realtime'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308']

type TeamRow = { player_id: string; team: number }

type AutoAction = { label: string; run: () => Promise<unknown> }

type Config = {
  table: string
  select: string
  numTeams: number
  assign: (playerId: string, team: number) => Promise<unknown>
  autoAction: AutoAction | null
  /** Extra one-tap team actions rendered alongside the primary auto-action. */
  autoActions?: AutoAction[]
}

function teamLobbyConfig(game: Game, gameCode: string, hostToken: string): Config | null {
  const gt = game.game_type
  if (gt === 'describe_it' && game.describe_it_mode !== 'individual') {
    return {
      table: 'describe_it_players',
      select: DESCRIBE_IT_PLAYER_SELECT,
      numTeams: clampDescribeItTeams(game.describe_it_num_teams),
      assign: (playerId, team) => postDescribeItTeamHost(gameCode, hostToken, playerId, team),
      autoAction: { label: '⚖️ Auto-balance', run: () => postDescribeItBalance(gameCode, hostToken) },
    }
  }
  if (gt === 'word_rush' && game.word_rush_mode !== 'individual') {
    return {
      table: 'word_rush_players',
      select: WORD_RUSH_PLAYER_SELECT,
      numTeams: clampWordRushTeams(game.word_rush_num_teams),
      assign: (playerId, team) => postWordRushTeamHost(gameCode, hostToken, playerId, team),
      autoAction: null,
      // Word Rush mirrors web: both even auto-balance and a full random shuffle.
      autoActions: [
        { label: '⚖️ Auto-balance', run: () => postWordRushBalance(gameCode, hostToken) },
        { label: '🔀 Shuffle teams', run: () => postWordRushShuffle(gameCode, hostToken) },
      ],
    }
  }
  if (gt === 'quick_draw' && game.quick_draw_variant === 'guess' && game.quick_draw_play_mode !== 'individual') {
    return {
      table: 'quick_draw_guess_players',
      select: QUICK_DRAW_GUESS_PLAYER_SELECT,
      numTeams: clampQuickDrawNumTeams(game.quick_draw_num_teams),
      assign: (playerId, team) => postQuickDrawGuessTeamHost(gameCode, hostToken, playerId, team),
      autoAction: null,
    }
  }
  return null
}

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
}

/** Host lobby N-team roster for Describe It / Word Rush / Quick Draw (guess). */
export function TeamRosterHostLobby({ gameCode, hostToken, game, players }: Props) {
  const styles = useThemedStyles(makeStyles)
  const config = useMemo(() => teamLobbyConfig(game, gameCode, hostToken), [game, gameCode, hostToken])
  const [rows, setRows] = useState<TeamRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [autoBusy, setAutoBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const table = config?.table
  const select = config?.select

  const load = useCallback(async () => {
    if (!table || !select) return
    const res = await getSupabase().from(table).select(select).eq('game_id', gameCode)
    if (!res.error) setRows((res.data as unknown as TeamRow[]) ?? [])
  }, [table, select, gameCode])

  useEffect(() => {
    if (!table) return
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`team-host-${gameCode}`))
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `game_id=eq.${gameCode}` }, () =>
        void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, gameCode, load])

  if (!config) return null

  const teamFor = (playerId: string) => rows.find((r) => r.player_id === playerId)?.team
  const active = players.filter((p) => !p.spectator)

  const assign = async (playerId: string, team: number) => {
    if (busyId) return
    setBusyId(playerId)
    setError(null)
    try {
      await config.assign(playerId, team)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign')
    } finally {
      setBusyId(null)
    }
  }

  const runAuto = async (action: AutoAction) => {
    if (autoBusy) return
    setAutoBusy(action.label)
    setError(null)
    try {
      await action.run()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update teams')
    } finally {
      setAutoBusy(null)
    }
  }

  const autoActions: AutoAction[] = config.autoActions ?? (config.autoAction ? [config.autoAction] : [])
  const teams = Array.from({ length: config.numTeams }, (_, i) => i + 1)

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Teams</Text>
      <Text style={styles.hint}>Tap a team to move a player. Players can also pick their own.</Text>

      {active.length === 0 ? (
        <Text style={styles.empty}>Waiting for players to join…</Text>
      ) : (
        <>
          {/* Two-column team cards (mirrors web): players grouped by team so the
              roster stays compact instead of one row per player. The small number
              buttons beside each name move that player to another team. */}
          <View style={styles.grid}>
            {teams.map((team) => {
              const color = TEAM_COLORS[(team - 1) % TEAM_COLORS.length]
              const members = active.filter((p) => teamFor(p.id) === team)
              return (
                <View key={team} style={[styles.teamCard, { borderColor: color }]}>
                  <View style={styles.teamHeader}>
                    <View style={[styles.badge, { backgroundColor: color }]}>
                      <Text style={styles.badgeText}>Team {team}</Text>
                    </View>
                    <Text style={styles.count}>{members.length}</Text>
                  </View>
                  <View style={styles.memberList}>
                    {members.length > 0 ? (
                      members.map((p) => (
                        <View key={p.id} style={styles.memberRow}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <View style={styles.moveBtns}>
                            {teams
                              .filter((t) => t !== team)
                              .map((t) => (
                                <Pressable
                                  key={t}
                                  style={styles.moveBtn}
                                  disabled={busyId === p.id}
                                  onPress={() => void assign(p.id, t)}
                                >
                                  <Text style={styles.moveBtnText}>{t}</Text>
                                </Pressable>
                              ))}
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.membersMuted}>No players yet</Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>

          {active.filter((p) => teamFor(p.id) == null).length > 0 ? (
            <View style={styles.unassigned}>
              <Text style={styles.unassignedLabel}>Unassigned</Text>
              {active
                .filter((p) => teamFor(p.id) == null)
                .map((p) => (
                  <View key={p.id} style={styles.memberRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View style={styles.moveBtns}>
                      {teams.map((t) => (
                        <Pressable
                          key={t}
                          style={styles.moveBtn}
                          disabled={busyId === p.id}
                          onPress={() => void assign(p.id, t)}
                        >
                          <Text style={styles.moveBtnText}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {autoActions.length > 0 ? (
        <View style={styles.autoRow}>
          {autoActions.map((action) => (
            <Pressable
              key={action.label}
              style={[styles.auto, styles.autoFlex, autoBusy != null && styles.disabled]}
              disabled={autoBusy != null}
              onPress={() => void runAuto(action)}
            >
              <Text style={styles.autoText}>{autoBusy === action.label ? 'Updating…' : action.label}</Text>
            </Pressable>
          ))}
        </View>
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
    minWidth: 150,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 10,
    gap: 8,
  },
  teamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  count: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
  memberList: { gap: 6, minHeight: 22 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  memberName: { color: theme.text, fontSize: 14, flexShrink: 1 },
  moveBtns: { flexDirection: 'row', gap: 4 },
  moveBtn: {
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
    paddingHorizontal: 6,
  },
  moveBtnText: { color: theme.textSecondary, fontSize: 12, fontWeight: '800' },
  membersMuted: { color: theme.textFaint, fontSize: 12, fontStyle: 'italic' },
  unassigned: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: theme.space.sm, gap: 6 },
  unassignedLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  error: { color: theme.error, fontSize: 13 },
  autoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: theme.space.xs },
  autoFlex: { flexGrow: 1, flexBasis: 0, marginTop: 0 },
  auto: {
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.space.xs,
  },
  autoText: { color: theme.textSecondary, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
})
