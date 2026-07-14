import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'
import { TimerBadge } from '@/components/ui/TimerBadge'

/**
 * Self-ticking wrapper around {@link TimerBadge}. It owns the 500ms countdown to
 * an absolute `deadlineAt`, so only this leaf re-renders each tick — not the
 * parent player view (M1: parents that called `useAbsoluteDeadline` themselves
 * re-rendered the whole heavy view twice a second). Renders nothing while
 * inactive or once the deadline has passed, matching the old
 * `seconds > 0 ? <TimerBadge/> : null` call sites.
 */
export function DeadlineTimerBadge({
  deadlineAt,
  active = true,
  urgentAt,
  enableAlerts,
}: {
  deadlineAt: string | null | undefined
  active?: boolean
  urgentAt?: number
  enableAlerts?: boolean
}) {
  const seconds = useAbsoluteDeadline(deadlineAt, active && !!deadlineAt)
  if (!active || seconds <= 0) return null
  return <TimerBadge seconds={seconds} urgentAt={urgentAt} enableAlerts={enableAlerts} />
}
