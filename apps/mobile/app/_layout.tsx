import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import 'react-native-reanimated'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider, useTheme, useThemeMode } from '@/constants/theme-context'
import { PreferencesProvider } from '@/constants/preferences-context'

export { ErrorBoundary } from 'expo-router'

// Anchor the stack to the home screen. When a game/host screen is opened directly
// (deep link, cold start) or reached via router.replace, home is otherwise absent
// from the stack — swiping back then pops to nothing and strands the user on a
// loader. With `index` as the anchor, back/swipe-back always resolves to home.
export const unstable_settings = { initialRouteName: 'index' }

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
        <Stack.Screen name="index" options={{ title: 'FateRound' }} />
        <Stack.Screen name="create" options={{ title: 'Create game' }} />
        <Stack.Screen name="game/[code]" options={{ title: 'Game' }} />
        <Stack.Screen name="host/[code]" options={{ title: 'Host' }} />
        <Stack.Screen name="play-solo/whot" options={{ title: 'Whot — solo' }} />
        <Stack.Screen name="play-solo/ayo" options={{ title: 'Ayo — solo' }} />
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
        <PreferencesProvider>
          <ToastProvider>
            <ThemedStack />
          </ToastProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
