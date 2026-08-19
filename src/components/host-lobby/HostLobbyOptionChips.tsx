'use client'

import { Chip } from '@/components/ui/PageShell'

export type HostLobbyOption<T extends number | string = number> = {
  value: T
  label: React.ReactNode
}

export function HostLobbyOptionChips<T extends number | string = number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: HostLobbyOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : undefined}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Chip
            key={opt.value}
            active={value === opt.value}
            onClick={() => onChange(opt.value)}
            className="min-w-[2.25rem] px-2.5 py-1.5 text-xs font-semibold"
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
