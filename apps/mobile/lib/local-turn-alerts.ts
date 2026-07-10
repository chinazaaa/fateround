import { Vibration } from 'react-native'
import { areLocalTurnAlertsEnabled } from '@/lib/push-preferences'

export async function pulseTurnAlert(kind: 'turn' | 'urgent' | 'expired' = 'turn'): Promise<void> {
  if (!(await areLocalTurnAlertsEnabled())) return

  if (kind === 'turn') {
    Vibration.vibrate(120)
    return
  }
  if (kind === 'urgent') {
    Vibration.vibrate([0, 80, 60, 80])
    return
  }
  Vibration.vibrate([0, 120, 80, 120, 80, 160])
}
