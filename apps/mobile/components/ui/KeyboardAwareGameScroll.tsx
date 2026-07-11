import { forwardRef } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native'

/**
 * Drop-in replacement for the `<ScrollView>` that wraps a game's player view when
 * it contains a text input. It lifts the content above the software keyboard so
 * the focused field stays visible (the keyboard used to cover inputs that sit
 * low on the screen — e.g. the Quick Draw guess box, Text Charades description).
 *
 * - `KeyboardAvoidingView` shrinks the scroll area above the keyboard (iOS).
 * - `keyboardShouldPersistTaps="handled"` keeps the submit button tappable on the
 *   first tap while the keyboard is open (otherwise the first tap only dismisses it).
 *
 * Forwards a ref to the inner ScrollView so callers can `scrollToEnd()` on focus
 * when the input sits at the bottom of the content.
 */
export const KeyboardAwareGameScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareGameScroll(
  { style, ...props },
  ref
) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={ref} style={[styles.flex, style]} keyboardShouldPersistTaps="handled" {...props} />
    </KeyboardAvoidingView>
  )
})

const styles = StyleSheet.create({ flex: { flex: 1 } })
