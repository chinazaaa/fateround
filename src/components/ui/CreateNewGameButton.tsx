'use client'

import { useRouter } from 'next/navigation'

export function CreateNewGameButton({
  className = 'btn-primary w-full',
}: {
  className?: string
}) {
  const router = useRouter()

  return (
    <button type="button" onClick={() => router.push('/games')} className={className}>
      Create a new game
    </button>
  )
}
