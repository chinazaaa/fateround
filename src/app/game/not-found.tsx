import { NotFoundPage } from '@/components/NotFoundPage'

export default function GameNotFound() {
  return (
    <NotFoundPage
      title="Game not found"
      message="That room code doesn't exist or the link is incomplete. Check the code and try again."
    />
  )
}
