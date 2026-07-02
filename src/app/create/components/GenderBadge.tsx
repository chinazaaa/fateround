import type { ParticipantGender } from '@/types'
import { genderLabel } from '@/lib/participants'

export function GenderBadge({ gender }: { gender: ParticipantGender }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shrink-0 ${
        gender === 'male'
          ? 'bg-sky-500/15 text-sky-600 border border-sky-400/25 dark:text-sky-300'
          : 'bg-pink-500/15 text-pink-600 border border-pink-400/25 dark:text-pink-300'
      }`}
    >
      {genderLabel(gender)}
    </span>
  )
}
