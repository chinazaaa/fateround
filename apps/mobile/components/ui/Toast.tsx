import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type ToastKind = 'success' | 'error' | 'info'

type ToastState = {
  message: string
  kind: ToastKind
} | null

type ToastContextValue = {
  show: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<ToastState>(null)

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3200)
  }, [])

  const value = useMemo(
    () => ({
      show,
      success: (message: string) => show(message, 'success'),
      error: (message: string) => show(message, 'error'),
    }),
    [show]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            style={[styles.toast, toast.kind === 'error' && styles.toastError, toast.kind === 'success' && styles.toastSuccess]}
            onPress={() => setToast(null)}
          >
            <Text style={styles.text}>{toast.message}</Text>
          </Pressable>
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      show: () => {},
      success: () => {},
      error: () => {},
    }
  }
  return ctx
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  toast: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toastError: {
    borderColor: '#f87171',
    backgroundColor: '#3f1d2b',
  },
  toastSuccess: {
    borderColor: '#4ade80',
    backgroundColor: '#14532d',
  },
  text: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
})
