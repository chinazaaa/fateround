import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { WordRushSession } from '@fateround/shared'
import { currentTeamRoundNumber } from '@fateround/shared/word-rush'
import { postWordRushEndRound } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { WORD_RUSH_SESSION_SELECT } from '@/lib/supabase-selects'
import { uniqueTopic } from '@/lib/realtime'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  hostToken: string
  /** Called after the round is ended so the host surface can refresh. */
  onReload?: () => void | Promise<unknown>
}

/**
 * Host "End round early" control for an active Word Rush game. Mirrors the web
 * WordRushHostView game-controls button: only shown while a turn/prompt is live,
 * skipping the rest of the current round for everyone. Self-loads + subscribes to
 * the session so it can be dropped into the generic host controls sheet.
 */
export function WordRushHostRoundControl({ gameCode, hostToken, onReload }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [session, setSession] = useState<WordRushSession | null>(null)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const code = gameCode.toUpperCase()

  const load = useCallback(async () => {
    const res = await getSupabase()
      .from('word_rush_sessions')
      .select(WORD_RUSH_SESSION_SELECT)
      .eq('game_id', code)
      .maybeSingle()
    if (!res.error) setSession((res.data as WordRushSession | null) ?? null)
  }, [code])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`wr-host-round-${code}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'word_rush_sessions', filter: `game_id=eq.${code}` },
        () => void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [code, load])

  // End-round-early only applies mid-round (a live turn or a pending prompt);
  // during intermission / after finish there is nothing to skip.
  if (!session || (session.phase !== 'playing' && session.phase !== 'awaiting_prompt')) return null

  const roundLabel =
    session.mode === 'team'
      ? `Round ${currentTeamRoundNumber(session.turn_index, session.num_teams)}`
      : `Round ${session.current_round}`

  const endRound = async () => {
    if (ending) return
    setEnding(true)
    setError(null)
    try {
      await postWordRushEndRound(code, hostToken)
      await load()
      await onReload?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end round')
    } finally {
      setEnding(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>{roundLabel} in progress</Text>
      <Pressable
        style={[styles.btn, ending && styles.disabled]}
        disabled={ending}
        onPress={() => void endRound()}
      >
        {ending ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <Text style={styles.btnText}>End round early</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.xs },
    caption: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    btn: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnText: { color: theme.text, fontWeight: '700', fontSize: 15 },
    disabled: { opacity: 0.5 },
    error: { color: theme.error, fontSize: 13 },
  })
