import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import 'react-native-reanimated'
import { ToastProvider } from '@/components/ui/Toast'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0b0b0f' },
            headerTintColor: '#fff',
            contentStyle: { backgroundColor: '#0b0b0f' },
            headerShown: false,
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Fate Round' }} />
          <Stack.Screen name="create" options={{ title: 'Create game' }} />
          <Stack.Screen name="game/[code]" options={{ title: 'Game' }} />
          <Stack.Screen name="host/[code]" options={{ title: 'Host' }} />
        </Stack>
      </ToastProvider>
    </SafeAreaProvider>
  )
}
