interface PageShellProps {
  children: React.ReactNode
  narrow?: boolean
  centered?: boolean
}

export function PageShell({ children, narrow, centered }: PageShellProps) {
  return (
    <div
      className={`page-wrap flex flex-col items-center px-4 py-10 overflow-y-auto ${
        centered ? 'justify-center min-h-screen py-16' : 'justify-start'
      }`}
    >
      <div className={`w-full space-y-6 ${narrow ? 'max-w-md' : 'max-w-lg'}`}>{children}</div>
    </div>
  )
}

export function BackBtn({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="btn-ghost -ml-2 text-sm">
      ← {label}
    </button>
  )
}

export function Field({
  label,
  children,
  action,
  htmlFor,
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div>
      <div className={`mb-2 ${action ? 'flex items-center justify-between gap-3' : ''}`}>
        <label htmlFor={htmlFor} className="text-muted text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  wide,
  className = '',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  wide?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${wide ? 'flex-1' : 'px-4'} chip ${active ? 'chip-active' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export function PrimaryBtn({
  onClick,
  disabled,
  children,
  className = '',
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`btn-primary ${className}`}>
      {children}
    </button>
  )
}

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      className="surface-inset flex items-center justify-between px-4 py-3 cursor-pointer hover:border-[var(--border-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      onClick={() => onChange(!value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange(!value)
        }
      }}
      role="switch"
      aria-checked={value}
      aria-label={label}
      tabIndex={0}
    >
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-faint text-xs mt-0.5">{description}</p>
      </div>
      <div
        className={`ml-3 shrink-0 w-11 h-6 rounded-full transition-colors relative ${
          value ? 'bg-[var(--primary-strong)]' : 'bg-[var(--border-strong)]'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </div>
    </div>
  )
}
