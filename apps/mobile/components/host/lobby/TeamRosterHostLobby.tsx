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
  postWordRushShuffle,
  postWordRushTeamHost,
} from '@/lib/game-api'
import { uniqueTopic } from '@/lib/realtime'
import { theme } from '@/constants/theme'

const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308']

type TeamRow = { player_id: string; team: number }

type Config = {
  table: string
  select: string
  numTeams: number
  assign: (playerId: string, team: number) => Promise<unknown>
  autoAction: { label: string; run: () => Promise<unknown> } | null
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
      autoAction: { label: '🔀 Shuffle teams', run: () => postWordRushShuffle(gameCode, hostToken) },
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
  const config = useMemo(() => teamLobbyConfig(game, gameCode, hostToken), [game, gameCode, hostToken])
  const [rows, setRows] = useState<TeamRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [autoBusy, setAutoBusy] = useState(false)
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

  const runAuto = async () => {
    if (!config.autoAction || autoBusy) return
    setAutoBusy(true)
    setError(null)
    try {
      await config.autoAction.run()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update teams')
    } finally {
      setAutoBusy(false)
    }
  }

  const teams = Array.from({ length: config.numTeams }, (_, i) => i + 1)

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Teams</Text>
      <Text style={styles.hint}>Tap a team to move a player. Players can also pick their own.</Text>

      {active.length === 0 ? (
        <Text style={styles.empty}>Waiting for players to join…</Text>
      ) : (
        active.map((p) => {
          const current = teamFor(p.id)
          return (
            <View key={p.id} style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
              </Text>
              <View style={styles.chips}>
                {teams.map((t) => {
                  const on = current === t
                  const color = TEAM_COLORS[(t - 1) % TEAM_COLORS.length]
                  return (
                    <Pressable
                      key={t}
                      style={[styles.chip, on && { borderColor: color, backgroundColor: `${color}22` }]}
                      disabled={busyId === p.id}
                      onPress={() => void assign(p.id, t)}
                    >
                      <Text style={[styles.chipText, on && { color }]}>Team {t}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          )
        })
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {config.autoAction ? (
        <Pressable style={[styles.auto, autoBusy && styles.disabled]} disabled={autoBusy} onPress={() => void runAuto()}>
          <Text style={styles.autoText}>{autoBusy ? 'Updating…' : config.autoAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
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
  name: { color: theme.text, fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  chipText: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
  error: { color: theme.error, fontSize: 13 },
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
