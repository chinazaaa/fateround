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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  children: ReactNode
  contentContainerStyle?: ViewStyle
  /** When false, children render without ScrollView (e.g. already inside one). */
  scroll?: boolean
}

/** Standard keyboard-safe layout for join/create/name forms. */
export function KeyboardFormScreen({ children, contentContainerStyle, scroll = true }: Props) {
  const insets = useSafeAreaInsets()
  const offset = Platform.OS === 'ios' ? insets.top + 12 : 0

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
})
