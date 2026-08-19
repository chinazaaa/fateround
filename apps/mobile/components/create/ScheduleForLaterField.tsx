/**
 * ScheduleForLaterField — mobile "Schedule for later" toggle + inputs.
 *
 * Renders under the Visibility toggle on the create wizard. Works for both
 * Public and Private games — the server accepts either (Private = invite by
 * link). Uses plain date + time text inputs — a full native picker was scope
 * creep for one datetime pair. The client rejects past instants; the server
 * does a final "must be in the future" check.
 */

import { useCallback, useMemo } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { DatePickerField, TimePickerField } from '@/components/ui/DateTimeFieldSheet'

type Props = {
  isPublic: boolean
  scheduledAt: string | null
  onChange: (nextIso: string | null) => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { date, time }
}

function combineIso(date: string, time: string): string | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const tm = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!dm || !tm) return null
  const local = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0, 0)
  if (Number.isNaN(local.getTime())) return null
  return local.toISOString()
}

export function ScheduleForLaterField({ isPublic, scheduledAt, onChange }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const enabled = scheduledAt != null
  const { date, time } = useMemo(() => splitIso(scheduledAt), [scheduledAt])
  const inFuture = (iso: string): boolean => new Date(iso).getTime() > Date.now()
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return ''
    }
  }, [])

  const setDate = useCallback(
    (value: string) => {
      const next = combineIso(value, time || '20:00')
      if (next && inFuture(next)) onChange(next)
    },
    [time, onChange]
  )
  const setTime = useCallback(
    (value: string) => {
      const next = combineIso(date || todayIso(), value)
      if (next && inFuture(next)) onChange(next)
    },
    [date, onChange]
  )
  const setEnabled = useCallback(
    (next: boolean) => {
      if (!next) return onChange(null)
      const t = new Date()
      t.setHours(20, 0, 0, 0)
      t.setDate(t.getDate() + 1)
      onChange(t.toISOString())
    },
    [onChange]
  )

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Schedule for later</Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: theme.border, true: theme.primary }} />
      </View>
      {enabled ? (
        <>
          <View style={styles.row}>
            <DatePickerField label="Date" value={date} placeholder="Pick a day" onChange={setDate} />
            <TimePickerField label="Time" value={time} placeholder="Pick a time" onChange={setTime} />
          </View>
          <Text style={styles.hint}>
            {tz ? `Times are in your local zone (${tz}).` : 'Times use this device’s local zone.'}
          </Text>
          <Text style={styles.hint}>
            {isPublic
              ? 'Anyone browsing can RSVP. We’ll ping RSVPers 15 min before it opens.'
              : 'Only people you share the link with can RSVP. We’ll ping them 15 min before it opens.'}
          </Text>
        </>
      ) : (
        <Text style={styles.hint}>Off — the game opens right after you tap Create.</Text>
      )}
    </View>
  )
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
    subLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    row: { flexDirection: 'row', gap: theme.space.md },
    col: { flex: 1, gap: 4 },
    input: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
      paddingVertical: 10,
    },
    hint: { color: theme.textMuted, fontSize: 13 },
  })
