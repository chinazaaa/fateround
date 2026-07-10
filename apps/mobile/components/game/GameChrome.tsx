import { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

export function GameLoading() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color="#f43f5e" size="large" />
    </View>
  )
}

export function GameNotFound({ gameCode }: { gameCode: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Game not found</Text>
      <Text style={styles.body}>No game with code {gameCode.toUpperCase()}.</Text>
    </View>
  )
}

export function GameShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.shell}>
      <Text style={styles.shellTitle}>{title}</Text>
      {subtitle ? <Text style={styles.shellSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  )
}

export function WaitingPanel({ message }: { message: string }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelText}>{message}</Text>
    </View>
  )
}

export function FinishedPanel({
  title,
  detail,
}: {
  title: string
  detail?: string | null
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.finishedTitle}>{title}</Text>
      {detail ? <Text style={styles.panelText}>{detail}</Text> : null}
    </View>
  )
}

export function TurnBanner({ text, isMyTurn }: { text: string; isMyTurn: boolean }) {
  return (
    <View style={[styles.turnBanner, isMyTurn && styles.turnBannerActive]}>
      <Text style={styles.turnText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
  },
  shell: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    padding: 16,
    gap: 12,
  },
  shellTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  shellSubtitle: {
    color: '#9ca3af',
    fontSize: 15,
  },
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  panelText: {
    color: '#d1d5db',
    fontSize: 15,
    lineHeight: 22,
  },
  finishedTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  turnBanner: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    padding: 12,
  },
  turnBannerActive: {
    backgroundColor: '#3f1d2b',
    borderWidth: 1,
    borderColor: '#f43f5e',
  },
  turnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
})
