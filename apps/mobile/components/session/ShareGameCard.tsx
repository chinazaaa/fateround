import { StyleSheet } from 'react-native'
import { ShareGameInviteContent } from '@/components/session/ShareGameInviteContent'
import { SurfaceCard } from '@/components/ui/SurfaceCard'

type Props = {
  gameCode: string
  hostToken?: string | null
  resumeToken?: string | null
}

export function ShareGameCard({ gameCode, hostToken, resumeToken }: Props) {
  return (
    <SurfaceCard accent style={styles.card}>
      <ShareGameInviteContent gameCode={gameCode} hostToken={hostToken} resumeToken={resumeToken} />
    </SurfaceCard>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 0,
  },
})
