import { forwardRef } from 'react'
import { Platform, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native'

/**
 * Drop-in `<ScrollView>` for a game player view that contains a text input. It
 * keeps the focused field visible above the software keyboard.
 *
 * iOS: `automaticallyAdjustKeyboardInsets` lets the native scroll view add a
 * bottom inset the size of the keyboard and scroll the focused field into view.
 * This replaces a hand-rolled `KeyboardAvoidingView`, whose `padding` behavior
 * was miscomputed here — the scroll sits below the session header, so without an
 * exact `keyboardVerticalOffset` (the header height) the lift was too small and
 * low inputs stayed covered.
 *
 * Android: relies on `windowSoftInputMode=adjustResize` (Expo's default
 * `softwareKeyboardLayoutMode: "resize"`), which resizes the window so the scroll
 * area shrinks above the keyboard and the focused input scrolls into view.
 *
 * `keyboardShouldPersistTaps="handled"` keeps the submit button tappable on the
 * first tap while the keyboard is open. Forwards a ref to the ScrollView so
 * callers can also `scrollToEnd()` on focus for inputs at the very bottom.
 */
export const KeyboardAwareGameScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareGameScroll(
  { style, ...props },
  ref
) {
  return (
    <ScrollView
      ref={ref}
      style={[styles.flex, style]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      {...props}
    />
  )
})

const styles = StyleSheet.create({ flex: { flex: 1 } })
