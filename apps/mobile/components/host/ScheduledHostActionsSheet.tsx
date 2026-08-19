/**
 * ScheduledHostActionsSheet — mobile host controls for scheduled games.
 *
 * Renders as a modal opened from the ScheduledGameScreen when the caller is
 * the host. Three actions:
 *   1. Reschedule — presets (Now / +5min / +15min / Custom).
 *   2. Cancel     — destructive; confirm dialog + "cancelled" push to RSVPers.
 *   3. Transfer   — hand off hosting to an RSVPer. Mints a fresh host_token
 *                    server-side; pushes the new host (bypass quiet hours)
 *                    and other RSVPers (informational).
 *
 * The "Now" reschedule preset compresses the schedule window and immediately
 * flips the game to waiting server-side (skipping the T-0 tick).
 */

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { DatePickerField, TimePickerField } from '@/components/ui/DateTimeFieldSheet'
import { cancelScheduled, fetchRsvpers, reschedule, transferScheduledHost, type Rsvper } from '@/lib/scheduled-host-api'
import { clearHostToken } from '@/lib/secure-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  visible: boolean
  onClose: () => void
  gameCode: string
  hostToken: string
  currentScheduledAt: string | null
}

function isoIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '20:00' }
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function combineIso(date: string, time: string): string | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const tm = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!dm || !tm) return null
  const local = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0, 0)
  return Number.isNaN(local.getTime()) ? null : local.toISOString()
}

export function ScheduledHostActionsSheet({ visible, onClose, gameCode, hostToken, currentScheduledAt }: Props) {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initial = splitIso(currentScheduledAt)
  const [customDate, setCustomDate] = useState(initial.date)
  const [customTime, setCustomTime] = useState(initial.time)
  const [transferOpen, setTransferOpen] = useState(false)
  const [rsvpers, setRsvpers] = useState<Rsvper[]>([])

  useEffect(() => {
    if (!transferOpen) return
    void fetchRsvpers(gameCode).then(setRsvpers)
  }, [transferOpen, gameCode])

  const onTransfer = useCallback(
    async (target: Rsvper) => {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Hand off hosting?',
          `${target.name} becomes the new host of this scheduled game. You’ll stop being the host.`,
          [
            { text: 'Keep it', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Hand off', style: 'destructive', onPress: () => resolve(true) },
          ],
          { onDismiss: () => resolve(false) }
        )
      })
      if (!confirmed) return
      setBusy(true)
      setError(null)
      try {
        await transferScheduledHost(gameCode, hostToken, target.deviceId, undefined, target.name)
        // The new host_token belongs to the recipient's device (delivered via
        // push metadata). This device no longer owns the game — drop the local
        // token so we stop rendering host controls.
        await clearHostToken(gameCode)
        setTransferOpen(false)
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not transfer host.')
      } finally {
        setBusy(false)
      }
    },
    [gameCode, hostToken, onClose]
  )

  const doReschedule = useCallback(
    async (iso: string) => {
      setBusy(true)
      setError(null)
      try {
        const r = await reschedule(gameCode, hostToken, iso)
        onClose()
        if (r.opened) {
          // Server already transitioned to waiting — the game screen will
          // reload with the new status on its next poll.
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reschedule.')
      } finally {
        setBusy(false)
      }
    },
    [gameCode, hostToken, onClose]
  )

  const onCancel = useCallback(() => {
    Alert.alert('Cancel this scheduled game?', 'Everyone who RSVP’d will be notified. This can’t be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel game',
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          setError(null)
          try {
            await cancelScheduled(gameCode, hostToken)
            onClose()
            router.replace('/browse' as never)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not cancel.')
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }, [gameCode, hostToken, onClose, router])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Manage scheduled game</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <SurfaceCard>
            <Text style={styles.section}>Reschedule</Text>
            <View style={styles.row}>
              <AppButton label="Now" onPress={() => void doReschedule(new Date().toISOString())} size="sm" />
              <AppButton label="+5 min" tone="secondary" onPress={() => void doReschedule(isoIn(5))} size="sm" />
              <AppButton label="+15 min" tone="secondary" onPress={() => void doReschedule(isoIn(15))} size="sm" />
            </View>
            <Text style={styles.subLabel}>Custom time</Text>
            <View style={styles.row}>
              <DatePickerField
                label="Date"
                value={customDate}
                placeholder="Pick a day"
                onChange={setCustomDate}
              />
              <TimePickerField
                label="Time"
                value={customTime}
                placeholder="Pick a time"
                onChange={setCustomTime}
              />
            </View>
            <AppButton
              label="Save custom time"
              tone="primary"
              size="md"
              onPress={() => {
                const iso = combineIso(customDate, customTime)
                if (!iso) {
                  setError('Enter a valid date + time.')
                  return
                }
                if (new Date(iso).getTime() <= Date.now()) {
                  setError('Pick a time in the future.')
                  return
                }
                void doReschedule(iso)
              }}
            />
          </SurfaceCard>

          <SurfaceCard>
            <Text style={styles.section}>Transfer host</Text>
            <Text style={styles.hint}>
              Hand off hosting to an RSVPer. They become the new host — you can still un-RSVP separately.
            </Text>
            {!transferOpen ? (
              <AppButton
                label="Pick an RSVPer to hand off to…"
                tone="secondary"
                onPress={() => setTransferOpen(true)}
                size="md"
              />
            ) : rsvpers.length === 0 ? (
              <>
                <Text style={styles.hint}>No RSVPers to hand off to yet.</Text>
                <AppButton label="Close" tone="ghost" onPress={() => setTransferOpen(false)} size="sm" />
              </>
            ) : (
              <ScrollView style={styles.rsvpList}>
                {rsvpers.map((r) => (
                  <Pressable key={r.deviceId} onPress={() => void onTransfer(r)} disabled={busy} style={styles.rsvpRow}>
                    <Text style={styles.rsvpName}>{r.name}</Text>
                    <Text style={styles.rsvpHint}>Hand off →</Text>
                  </Pressable>
                ))}
                <AppButton label="Cancel" tone="ghost" onPress={() => setTransferOpen(false)} size="sm" />
              </ScrollView>
            )}
          </SurfaceCard>

          <SurfaceCard>
            <Text style={styles.section}>Cancel game</Text>
            <Text style={styles.hint}>Notify every RSVPer that the game is off.</Text>
            <AppButton label="Cancel this scheduled game" tone="danger" onPress={onCancel} size="md" />
          </SurfaceCard>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {busy ? <ActivityIndicator /> : null}
        </View>
      </View>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: theme.space.md,
      gap: theme.space.md,
      paddingBottom: theme.space.xl,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800' },
    close: { color: theme.textMuted, fontSize: 28, paddingHorizontal: 4 },
    section: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    subLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    row: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
    input: {
      flex: 1,
      minWidth: 100,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
      paddingVertical: 8,
    },
    hint: { color: theme.textMuted, fontSize: 13 },
    error: { color: theme.error, fontSize: theme.type.label.size, textAlign: 'center' },
    rsvpList: { maxHeight: 240 },
    rsvpRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    rsvpName: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    rsvpHint: { color: theme.primary, fontSize: theme.type.caption.size, fontWeight: '800' },
  })
