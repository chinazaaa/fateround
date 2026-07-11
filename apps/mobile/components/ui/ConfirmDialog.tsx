import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  visible: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as a destructive (red) action. */
  destructive?: boolean
  /** Show a spinner and block input on the confirm button. */
  confirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * App-styled confirmation dialog — replaces the native `Alert.alert` so
 * confirm/cancel prompts match the rest of the app (and the web build)
 * instead of the OS default sheet.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  confirming = false,
  onConfirm,
  onCancel,
}: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={confirming ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.cancelBtn, confirming && styles.btnDisabled]}
              onPress={onCancel}
              disabled={confirming}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.confirmBtn, confirming && styles.btnDisabled]}
              onPress={onConfirm}
              disabled={confirming}
            >
              {confirming ? (
                <ActivityIndicator color={destructive ? theme.primary : theme.text} />
              ) : (
                <Text style={[styles.confirmText, destructive && styles.confirmTextDestructive]}>
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.lg,
    gap: theme.space.sm,
  },
  title: {
    color: theme.text,
    fontSize: 19,
    fontWeight: '800',
  },
  message: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginTop: theme.space.md,
  },
  btn: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  cancelBtn: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cancelText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  confirmBtn: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  confirmText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  confirmTextDestructive: {
    color: theme.primary,
  },
})
