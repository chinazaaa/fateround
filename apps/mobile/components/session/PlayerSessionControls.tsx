import { EditNameInline } from '@/components/session/EditNameInline'
import { LeaveGameButton } from '@/components/session/LeaveGameButton'
import { PlayerResumeCard } from '@/components/session/PlayerResumeCard'
import { StyleSheet, View } from 'react-native'

type Props = {
  gameCode: string
  playerId: string
  currentName: string
  resumeToken?: string | null
  onRenamed: (newName: string) => void
  onLeft: () => void
  inLobby?: boolean
  spectating?: boolean
}

export function PlayerSessionControls({
  gameCode,
  playerId,
  currentName,
  resumeToken,
  onRenamed,
  onLeft,
  inLobby = false,
  spectating = false,
}: Props) {
  return (
    <View style={styles.wrap}>
      <EditNameInline
        gameCode={gameCode}
        playerId={playerId}
        currentName={currentName}
        onRenamed={onRenamed}
        spectating={spectating}
      />
      <PlayerResumeCard gameCode={gameCode} resumeToken={resumeToken} compact={!inLobby} />
      <LeaveGameButton gameCode={gameCode} playerId={playerId} onLeft={onLeft} inLobby={inLobby} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2a2a35' },
})
