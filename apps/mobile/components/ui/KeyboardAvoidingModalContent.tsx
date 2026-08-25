/**
 * KeyboardAvoidingModalContent — drop-in wrapper for a `<Modal>`'s children so a
 * bottom-anchored TextInput lifts above the on-screen keyboard.
 *
 * React Native's `<Modal>` renders into its own window on iOS; on iOS 15+
 * `presentationStyle="pageSheet"` doesn't lift for the keyboard, and neither
 * do transparent bottom-sheet Modals. Wrap the modal children in this so every
 * modal-based sheet gets the same lift as `ProfileChip` did.
 *
 * Usage:
 *   <Modal ...>
 *     <KeyboardAvoidingModalContent>
 *       …existing tree…
 *     </KeyboardAvoidingModalContent>
 *   </Modal>
 */

import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'

export function KeyboardAvoidingModalContent({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({ flex: { flex: 1 } })
