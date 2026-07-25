import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { AppButton } from '@/components/ui/AppButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import {
  MAX_TEMPLATE_SLOTS,
  firstFreeSlot,
  formatTemplateSavedAt,
  slotLabel,
  summarizeTemplate,
  type GameTemplate,
  type TemplateSlots,
} from '@/lib/game-templates'

/**
 * Mobile parallel of web's TemplateQuickStart + SaveTemplateModal + UseTemplateConfirmModal (PR
 * #681), folded into one file — mobile's create screen doesn't split this many small pieces
 * across files the way the web page does. Renders:
 *  - `<TemplateQuickStart>` — the "you've done this before" row, shown only when saved templates
 *    exist for the current game type.
 *  - `<SaveTemplateButton>` — the "Save current settings as template" action + its modal, meant
 *    to sit near the create button.
 * Both share the same save-modal + confirm-dialog implementation underneath.
 */

// ---- Quick start row -------------------------------------------------------

type QuickStartProps = {
  slots: TemplateSlots
  onUse: (tpl: GameTemplate) => void
  onPrefill: (tpl: GameTemplate) => void
  onOverride: (slot: number) => void
  onDelete: (slot: number) => void
}

export function TemplateQuickStart({ slots, onUse, onPrefill, onOverride, onDelete }: QuickStartProps) {
  const styles = useThemedStyles(makeStyles)
  const [menuSlot, setMenuSlot] = useState<number | null>(null)
  const [confirmUse, setConfirmUse] = useState<GameTemplate | null>(null)
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<number | null>(null)

  const filled = slots.map((tpl, i) => ({ tpl, i })).filter((s): s is { tpl: GameTemplate; i: number } => !!s.tpl)

  if (filled.length === 0) return null

  return (
    <SurfaceCard style={styles.card}>
      <Text style={styles.label}>Quick start — use a saved template</Text>
      <View style={styles.list}>
        {filled.map(({ tpl, i }) => (
          <View key={i} style={styles.row}>
            <View style={styles.rowHeader}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {tpl.name}
                </Text>
                <Text style={styles.rowSummary} numberOfLines={2}>
                  {summarizeTemplate(tpl.values)} · saved {formatTemplateSavedAt(tpl.savedAt)}
                </Text>
              </View>
              <Pressable style={styles.menuBtn} onPress={() => setMenuSlot(menuSlot === i ? null : i)} hitSlop={8}>
                <Text style={styles.menuBtnText}>⋯</Text>
              </Pressable>
            </View>

            {menuSlot === i ? (
              <View style={styles.menu}>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuSlot(null)
                    onOverride(i)
                  }}
                >
                  <Text style={styles.menuItemText}>Override this slot</Text>
                </Pressable>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuSlot(null)
                    setConfirmDeleteSlot(i)
                  }}
                >
                  <Text style={styles.menuItemTextDanger}>Delete</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.actions}>
              <AppButton label="Use & create" onPress={() => setConfirmUse(tpl)} style={styles.actionBtn} />
              <AppButton
                label="Prefill only"
                variant="secondary"
                onPress={() => onPrefill(tpl)}
                style={styles.actionBtn}
              />
            </View>
          </View>
        ))}
      </View>

      <ConfirmDialog
        visible={!!confirmUse}
        title="Create with this template?"
        message="This creates the game immediately with these settings — you won't get a chance to review them first."
        confirmLabel="Create game"
        onCancel={() => setConfirmUse(null)}
        onConfirm={() => {
          const tpl = confirmUse
          setConfirmUse(null)
          if (tpl) onUse(tpl)
        }}
      />

      <ConfirmDialog
        visible={confirmDeleteSlot !== null}
        title={
          confirmDeleteSlot !== null && slots[confirmDeleteSlot]
            ? `Delete "${slots[confirmDeleteSlot]!.name}"?`
            : 'Delete this template?'
        }
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeleteSlot(null)}
        onConfirm={() => {
          const slot = confirmDeleteSlot
          setConfirmDeleteSlot(null)
          if (slot !== null) onDelete(slot)
        }}
      />
    </SurfaceCard>
  )
}

// ---- Save button + modal ---------------------------------------------------

type SaveTemplateButtonProps = {
  slots: TemplateSlots
  /** Set to pre-open on a specific slot (an "Override this slot" request from the quick-start
   *  row); consumed once by the modal and reset by the caller. */
  presetSlot: number | null
  onOpenChange: (open: boolean) => void
  open: boolean
  onConfirm: (slot: number, name: string) => void
}

export function SaveTemplateButton({ slots, presetSlot, open, onOpenChange, onConfirm }: SaveTemplateButtonProps) {
  return (
    <>
      <AppButton label="Save current settings as template" variant="secondary" onPress={() => onOpenChange(true)} />
      <SaveTemplateModal
        visible={open}
        slots={slots}
        presetSlot={presetSlot}
        onClose={() => onOpenChange(false)}
        onConfirm={(slot, name) => {
          onConfirm(slot, name)
          onOpenChange(false)
        }}
      />
    </>
  )
}

type SaveTemplateModalProps = {
  visible: boolean
  slots: TemplateSlots
  presetSlot: number | null
  onClose: () => void
  onConfirm: (slot: number, name: string) => void
}

/**
 * Shared save flow for both the quick-start row's "Override this slot" action and the "Save
 * current settings" button (auto-picks a free slot, or asks which one to replace when both are
 * full).
 */
export function SaveTemplateModal({ visible, slots, presetSlot, onClose, onConfirm }: SaveTemplateModalProps) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [chosenSlot, setChosenSlot] = useState<number | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [picking, setPicking] = useState(false)

  // Re-derive the initial slot/name whenever the modal opens (or the preset slot changes),
  // mirroring web's useEffect(open) hydration.
  useEffect(() => {
    if (!visible) return
    const target = presetSlot ?? firstFreeSlot(slots)
    setChosenSlot(target)
    setPicking(target === null)
    setNameInput(target !== null ? (slots[target]?.name ?? slotLabel(target)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, presetSlot])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>{picking ? 'Both slots are full' : 'Save as template'}</Text>

          {picking ? (
            <View style={styles.pickList}>
              <Text style={styles.modalHint}>Pick a slot to replace, or cancel.</Text>
              {Array.from({ length: MAX_TEMPLATE_SLOTS }, (_, i) => i).map((i) => (
                <Pressable
                  key={i}
                  style={styles.pickRow}
                  onPress={() => {
                    setChosenSlot(i)
                    setPicking(false)
                    setNameInput(slots[i]?.name ?? slotLabel(i))
                  }}
                >
                  <Text style={styles.pickRowTitle}>{slots[i]?.name ?? slotLabel(i)}</Text>
                  {slots[i] ? <Text style={styles.pickRowSummary}>{summarizeTemplate(slots[i]!.values)}</Text> : null}
                </Pressable>
              ))}
              <AppButton label="Cancel" variant="secondary" onPress={onClose} />
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.modalHint}>Template name (optional)</Text>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder={chosenSlot !== null ? slotLabel(chosenSlot) : ''}
                placeholderTextColor={theme.textFaint}
                maxLength={30}
                style={styles.input}
                autoFocus
              />
              <AppButton
                label={`Save to ${chosenSlot !== null ? slotLabel(chosenSlot) : ''}`}
                onPress={() => {
                  if (chosenSlot === null) return
                  onConfirm(chosenSlot, nameInput.trim() || slotLabel(chosenSlot))
                }}
              />
              <AppButton label="Cancel" variant="ghost" onPress={onClose} />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.space.sm },
    label: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    list: { gap: theme.space.sm },
    row: {
      backgroundColor: theme.surfaceHover,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    rowHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm },
    rowInfo: { flex: 1, gap: 2 },
    rowName: { color: theme.text, fontSize: 15, fontWeight: '700' },
    rowSummary: { color: theme.textFaint, fontSize: 12, lineHeight: 16 },
    menuBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: theme.radius.sm,
    },
    menuBtnText: { color: theme.textMuted, fontSize: 18, fontWeight: '700' },
    menu: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      overflow: 'hidden',
      alignSelf: 'flex-end',
      minWidth: 160,
    },
    menuItem: { paddingHorizontal: 14, paddingVertical: 10 },
    menuItemText: { color: theme.text, fontSize: 14, fontWeight: '600' },
    menuItemTextDanger: { color: theme.error, fontSize: 14, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: theme.space.sm },
    actionBtn: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.space.lg,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.lg,
      gap: theme.space.md,
    },
    modalTitle: { color: theme.text, fontSize: 19, fontWeight: '800' },
    modalHint: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    form: { gap: theme.space.sm },
    pickList: { gap: theme.space.sm },
    pickRow: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: 2,
    },
    pickRowTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    pickRowSummary: { color: theme.textFaint, fontSize: 12 },
    input: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 16,
      paddingHorizontal: theme.space.md,
      paddingVertical: 12,
    },
  })
