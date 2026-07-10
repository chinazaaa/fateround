import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import 'react-native-reanimated'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0b0b0f' },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: '#0b0b0f' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Fate Round' }} />
      <Stack.Screen name="game/[code]" options={{ title: 'Game' }} />
    </Stack>
  )
}
