import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { clearPlayerSession } from '@/lib/secure-session'
import { lobbyPropsFromBootstrap, type BootstrapLike } from '@/lib/bootstrap-props'

export function usePlayerSessionActions(bootstrap: BootstrapLike) {
  const router = useRouter()

  const onLeft = useCallback(async () => {
    await clearPlayerSession(bootstrap.code)
    router.replace('/')
  }, [bootstrap.code, router])

  const lobbyProps = bootstrap.game ? lobbyPropsFromBootstrap(bootstrap) : null

  return { onLeft, lobbyProps }
}
