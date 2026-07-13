import { ReactNode } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  ViewStyle,
} from 'react-native'
import type { RefreshControlProps } from 'react-native'

type Props = {
  children: ReactNode
  contentContainerStyle?: ViewStyle
  /** When false, children render without ScrollView (e.g. already inside one). */
  scroll?: boolean
  /** Optional pull-to-refresh control for the scroll view. */
  refreshControl?: React.ReactElement<RefreshControlProps>
  /** Pinned below the scroll area (e.g. a primary CTA); rises with the keyboard. */
  footer?: ReactNode
}

/** Standard keyboard-safe layout for join/create/name forms. */
export function KeyboardFormScreen({ children, contentContainerStyle, scroll = true, refreshControl, footer }: Props) {
  // No keyboardVerticalOffset: the KeyboardAvoidingView already fills from the safe-area top, and
  // its `padding` behavior measures the view's own frame — so any extra offset just lifts the
  // footer/inputs above the keyboard, leaving a floating gap. 0 docks the footer snug on the
  // keyboard's top edge (the footer's own padding keeps a little breathing room).
  const offset = 0

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    children
  )

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        {body}
      </TouchableWithoutFeedback>
      {footer}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
})
