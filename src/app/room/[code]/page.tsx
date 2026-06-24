import { RoomLobby } from '@/components/rooms/RoomLobby'

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <RoomLobby roomCode={code.toUpperCase()} />
}
