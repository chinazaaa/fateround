interface StepIndicatorProps {
  steps: string[]
  current: number
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const stepNum = i + 1
        const active = stepNum === current
        const done = stepNum < current
        return (
          <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  active
                    ? 'bg-[var(--primary)] text-white'
                    : done
                      ? 'bg-[var(--chip-active-bg)] text-[var(--chip-active-text)] border border-[var(--chip-active-border)]'
                      : 'bg-[var(--surface-inset-bg)] text-faint border border-[var(--border)]'
                }`}
              >
                {done ? '✓' : stepNum}
              </span>
              <span
                className={`text-xs font-medium truncate hidden sm:block ${
                  active ? 'text-[var(--foreground)]' : 'text-faint'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 min-w-3 ${done ? 'bg-[var(--primary)]/40' : 'bg-[var(--border)]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function SettingsGroup({
  title,
  description,
  children,
  defaultOpen = true,
  collapsible = false,
}: {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
  collapsible?: boolean
}) {
  if (!collapsible) {
    return (
      <div className="space-y-3">
        <div>
          <p className="font-semibold text-sm">{title}</p>
          {description && <p className="text-faint text-xs mt-0.5">{description}</p>}
        </div>
        {children}
      </div>
    )
  }

  return (
    <details className="group" open={defaultOpen}>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 py-1">
        <div>
          <p className="font-semibold text-sm">{title}</p>
          {description && <p className="text-faint text-xs mt-0.5">{description}</p>}
        </div>
        <span className="text-faint text-lg transition-transform group-open:rotate-45 shrink-0">+</span>
      </summary>
      <div className="pt-3 space-y-3">{children}</div>
    </details>
  )
}

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 px-4 py-4 mt-2 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/95 to-transparent">
      {children}
    </div>
  )
}

export function ChipGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-5 gap-1.5">{children}</div>
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
}) {
  const active = options.find((o) => o.value === value)
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 p-1 rounded-xl surface-inset">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold ${
              value === opt.value ? 'chip-active' : 'text-muted hover:text-[var(--foreground)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {active?.hint && <p className="text-faint text-xs px-1">{active.hint}</p>}
    </div>
  )
}
