import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Game, GameType } from '@fateround/shared'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
} from '@fateround/shared/poll-games'
import { getSupabase } from '@/lib/supabase'
import {
  deletePlayerQuestion,
  postPlayerQuestionMlt,
  postPlayerQuestionWyr,
} from '@/lib/game-api'
import { uniqueTopic } from '@/lib/realtime'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type QuestionRow = {
  id: string
  question_type: 'wyr' | 'mlt'
  option_a: string | null
  option_b: string | null
  question_text: string | null
}

const SELECT = 'id,player_id,question_type,option_a,option_b,question_text'

/** Games that accept player-submitted questions in the lobby. Mirrors web `lobbyAllowsPlayerQuestions`. */
export function lobbyAllowsPlayerQuestions(game: Pick<Game, 'game_type' | 'player_questions_enabled'>): boolean {
  const t = game.game_type
  if (!isBinaryChoiceGame(t) && !isMostLikelyTo(t) && !isNeverHaveIEver(t) && !isPickANumber(t)) return false
  return game.player_questions_enabled !== false
}

type Props = {
  gameCode: string
  gameType: GameType
  playerId: string
  resumeToken: string
}

export function PlayerQuestionSubmit({ gameCode, gameType, playerId, resumeToken }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const isBinary = isBinaryChoiceGame(gameType)
  const [mine, setMine] = useState<QuestionRow[]>([])
  const [optionA, setOptionA] = useState('')
  const [optionB, setOptionB] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await getSupabase()
      .from('player_questions')
      .select(SELECT)
      .eq('game_id', gameCode)
      .eq('player_id', playerId)
    if (!res.error) setMine((res.data as unknown as QuestionRow[]) ?? [])
  }, [gameCode, playerId])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`pq-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_questions', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  const submit = async () => {
    if (busy) return
    setError(null)
    if (isBinary) {
      const a = optionA.trim()
      const b = optionB.trim()
      if (!a || !b) return setError('Enter both options')
      setBusy(true)
      try {
        await postPlayerQuestionWyr(gameCode, resumeToken, a, b)
        setOptionA('')
        setOptionB('')
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not submit')
      } finally {
        setBusy(false)
      }
    } else {
      const t = text.trim()
      if (!t) return setError('Enter a question')
      setBusy(true)
      try {
        await postPlayerQuestionMlt(gameCode, resumeToken, t)
        setText('')
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not submit')
      } finally {
        setBusy(false)
      }
    }
  }

  const remove = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deletePlayerQuestion(resumeToken, id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove')
    } finally {
      setBusy(false)
    }
  }

  const summarize = (q: QuestionRow) =>
    q.question_type === 'wyr' ? `${q.option_a} · ${q.option_b}` : (q.question_text ?? '')

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add a question</Text>
      <Text style={styles.hint}>Your questions join the pool for this game.</Text>

      {isBinary ? (
        <>
          <TextInput
            style={styles.input}
            value={optionA}
            onChangeText={setOptionA}
            placeholder="Option A"
            placeholderTextColor={theme.textFaint}
            maxLength={200}
          />
          <TextInput
            style={styles.input}
            value={optionB}
            onChangeText={setOptionB}
            placeholder="Option B"
            placeholderTextColor={theme.textFaint}
            maxLength={200}
          />
        </>
      ) : (
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={isNeverHaveIEver(gameType) ? 'been skydiving' : 'Your question'}
          placeholderTextColor={theme.textFaint}
          maxLength={200}
          autoCapitalize="sentences"
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.submit, busy && styles.disabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Saving…' : 'Submit'}</Text>
      </Pressable>

      {mine.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listLabel}>Your questions ({mine.length})</Text>
          {mine.map((q) => (
            <View key={q.id} style={styles.qRow}>
              <Text style={styles.qText} numberOfLines={2}>
                {summarize(q)}
              </Text>
              <Pressable onPress={() => void remove(q.id)} hitSlop={8}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
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
  },
  title: { color: theme.text, fontSize: 16, fontWeight: '800' },
  hint: { color: theme.textMuted, fontSize: 13 },
  input: {
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  error: { color: theme.error, fontSize: 13 },
  submit: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  list: { gap: 6, marginTop: 4 },
  listLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  qText: { color: theme.textSecondary, fontSize: 14, flex: 1 },
  remove: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
})
