import { Stack, router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import 'react-native-reanimated'
import { ToastProvider } from '@/components/ui/Toast'
import { ThemeProvider, useTheme, useThemeMode } from '@/constants/theme-context'
import { PreferencesProvider } from '@/constants/preferences-context'

type NotificationData = {
  event?: string
  gameCode?: string
  url?: string
}

function routeFromNotification(data: NotificationData | null | undefined): string | null {
  if (!data) return null
  const code = typeof data.gameCode === 'string' ? data.gameCode.trim() : ''
  if (code) return `/game/${code}`
  // Fall back to a server-provided url like "/game/ABC123".
  if (typeof data.url === 'string' && data.url.startsWith('/')) return data.url
  return null
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const target = routeFromNotification(response.notification.request.content.data as NotificationData)
  if (target) router.push(target as never)
}

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
        <Stack.Screen name="play-solo/ludo" options={{ title: 'Ludo — solo' }} />
        <Stack.Screen name="play-solo/yahtzee" options={{ title: 'Five Dice — solo' }} />
        <Stack.Screen name="play-solo/uno" options={{ title: 'Match Up — solo' }} />
        <Stack.Screen name="play-solo/crazy-eights" options={{ title: 'Crazy Eights — solo' }} />
        <Stack.Screen name="community" options={{ title: 'Community' }} />
        <Stack.Screen name="browse" options={{ title: 'Browse' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="daily-challenges/index" options={{ title: 'Daily Challenges' }} />
        <Stack.Screen name="daily-challenges/[slug]" options={{ title: 'Daily Challenge' }} />
        <Stack.Screen name="daily-challenges/leaderboard/[slug]" options={{ title: 'Leaderboard' }} />
        <Stack.Screen name="leaderboard/index" options={{ title: 'Leaderboards' }} />
        <Stack.Screen name="leaderboard/daily" options={{ title: 'Daily Leaderboards' }} />
        <Stack.Screen name="leaderboard/trophies" options={{ title: 'Trophies' }} />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const coldStartHandledRef = useRef(false)

  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

  useEffect(() => {
    // Cold start: an OS-delivered tap that launched the app.
    if (!coldStartHandledRef.current) {
      coldStartHandledRef.current = true
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) handleNotificationResponse(response)
      })
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse)
    return () => subscription.remove()
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
