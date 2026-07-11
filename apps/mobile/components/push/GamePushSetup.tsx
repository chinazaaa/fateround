import { useCallback } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useForegroundPushBanner, useGamePush } from '@/hooks/useGamePush'
import { usePreferences } from '@/constants/preferences-context'

type Props = {
  gameCode: string
}

/** Registers push tokens and surfaces foreground notification banners. */
export function GamePushSetup({ gameCode }: Props) {
  const { show } = useToast()
  const { notificationsEnabled } = usePreferences()

  useGamePush(gameCode, notificationsEnabled)

  const onMessage = useCallback(
    (title: string, body: string) => {
      const message = body ? `${title}: ${body}` : title
      show(message, 'info')
    },
    [show]
  )

  useForegroundPushBanner(onMessage)

  return null
}
