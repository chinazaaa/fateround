import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import 'react-native-reanimated'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider, useTheme, useThemeMode } from '@/constants/theme-context'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync()

function ThemedStack() {
  const theme = useTheme()
  const { scheme } = useThemeMode()

  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.bg },
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Fate Round' }} />
        <Stack.Screen name="create" options={{ title: 'Create game' }} />
        <Stack.Screen name="game/[code]" options={{ title: 'Game' }} />
        <Stack.Screen name="host/[code]" options={{ title: 'Host' }} />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <ThemedStack />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
