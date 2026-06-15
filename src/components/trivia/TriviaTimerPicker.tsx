'use client'

import { Chip } from '@/components/ui/PageShell'
import { TRIVIA_TIMER_OPTIONS } from '@/lib/trivia'

export function TriviaTimerPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (seconds: number) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {TRIVIA_TIMER_OPTIONS.map((n) => (
        <Chip key={n} active={value === n} onClick={() => onChange(n)} className="!px-0 w-full">
          {n}s
        </Chip>
      ))}
    </div>
  )
}
