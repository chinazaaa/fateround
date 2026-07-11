import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT } from '@/lib/supabase-selects'
import { deletePlayerParticipant, postPlayerParticipant } from '@/lib/game-api'
import { uniqueTopic } from '@/lib/realtime'
import { theme } from '@/constants/theme'

type Row = { id: string; name: string; gender: 'male' | 'female'; submitted_by_player_id: string | null }

/** Voters-mode people-polls let players add candidate names in the lobby. */
export function lobbyAllowsPlayerNames(game: Pick<Game, 'participant_mode'>): boolean {
  return game.participant_mode === 'voters'
}

type Props = {
  gameCode: string
  playerId: string
  resumeToken: string
  genderBased: boolean
}

export function PlayerNameSubmit({ gameCode, playerId, resumeToken, genderBased }: Props) {
  const [mine, setMine] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('female')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await getSupabase()
      .from('participants')
      .select(PARTICIPANT_SELECT)
      .eq('game_id', gameCode)
      .eq('submitted_by_player_id', playerId)
    if (!res.error) setMine((res.data as unknown as Row[]) ?? [])
  }, [gameCode, playerId])

  useEffect(() => {
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`pp-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await postPlayerParticipant(gameCode, resumeToken, trimmed, genderBased ? gender : undefined)
      setName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add name')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deletePlayerParticipant(resumeToken, id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add names to vote on</Text>
      <Text style={styles.hint}>People you add join the pool for this game.</Text>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="words"
          maxLength={50}
        />
        {genderBased ? (
          <View style={styles.genderToggle}>
            {(['female', 'male'] as const).map((g) => (
              <Pressable
                key={g}
                style={[styles.genderPill, gender === g && styles.genderPillOn]}
                onPress={() => setGender(g)}
              >
                <Text style={[styles.genderText, gender === g && styles.genderTextOn]}>
                  {g === 'female' ? 'F' : 'M'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.submit, busy && styles.disabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.submitText}>{busy ? 'Adding…' : 'Add name'}</Text>
      </Pressable>

      {mine.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listLabel}>Your names ({mine.length})</Text>
          {mine.map((r) => (
            <View key={r.id} style={styles.qRow}>
              <Text style={styles.qText} numberOfLines={1}>
                {r.name}
              </Text>
              <Pressable onPress={() => void remove(r.id)} hitSlop={8}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
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
  },
  title: { color: theme.text, fontSize: 16, fontWeight: '800' },
  hint: { color: theme.textMuted, fontSize: 13 },
  row: { flexDirection: 'row', gap: theme.space.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  genderToggle: { flexDirection: 'row', borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  genderPill: { width: 34, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.bgElevated },
  genderPillOn: { backgroundColor: theme.primarySoft },
  genderText: { color: theme.textMuted, fontSize: 13, fontWeight: '800' },
  genderTextOn: { color: theme.primaryMuted },
  error: { color: theme.error, fontSize: 13 },
  submit: { backgroundColor: theme.primary, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center' },
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
