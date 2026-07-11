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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
  const insets = useSafeAreaInsets()
  const offset = Platform.OS === 'ios' ? insets.top + 12 : 0

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
