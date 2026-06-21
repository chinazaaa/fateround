'use client'

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  joining?: boolean
  submitLabel?: string
  joiningLabel?: string
  placeholder?: string
  label?: string
  hint?: React.ReactNode
  footer?: React.ReactNode
  disabled?: boolean
}

export function NameJoinForm({
  value,
  onChange,
  onSubmit,
  joining = false,
  submitLabel = 'Join game',
  joiningLabel = 'Joining…',
  placeholder = 'Your name',
  label = 'Your name',
  hint,
  footer,
  disabled = false,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        {label ? <label className="label-caps block mb-2">{label}</label> : null}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && !joining && value.trim() && onSubmit()}
          placeholder={placeholder}
          className="input-field w-full"
          maxLength={40}
          autoComplete="name"
        />
      </div>
      {hint ? <div className="text-faint text-xs leading-relaxed">{hint}</div> : null}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || joining || !value.trim()}
        className="btn-primary w-full"
      >
        {joining ? joiningLabel : submitLabel}
      </button>
      {footer}
    </div>
  )
}
