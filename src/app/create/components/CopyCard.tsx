import { CopyLinkButton } from '@/components/ui/CopyLinkButton'

export function CopyCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string
  value: string
  accent?: boolean
  hint?: string
}) {
  return (
    <div className={`glass-card p-4 space-y-2 ${accent ? 'border-[var(--primary)]/35' : ''}`}>
      <p className={`label-caps ${accent ? 'text-[var(--primary)]' : ''}`}>{label}</p>
      <p className="font-mono text-xs break-all text-muted">{value}</p>
      <CopyLinkButton value={value} successMessage={accent ? 'Host link copied' : 'Player link copied'} />
      {hint ? <p className="text-faint text-xs">{hint}</p> : null}
    </div>
  )
}
