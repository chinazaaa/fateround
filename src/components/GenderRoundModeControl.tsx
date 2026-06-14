'use client'
import { SegmentedControl } from '@/components/ui/CreateWizard'

interface GenderRoundModeControlProps {
  value: boolean
  onChange: (genderBased: boolean) => void
}

export function GenderRoundModeControl({ value, onChange }: GenderRoundModeControlProps) {
  return (
    <div className="space-y-2">
      <p className="text-muted text-xs uppercase tracking-wider">Who&apos;s in each round?</p>
      <SegmentedControl
        value={value ? 'gender' : 'names'}
        onChange={(v) => onChange(v === 'gender')}
        options={[
          {
            value: 'names',
            label: 'Names only',
            hint: 'Anyone can appear in any round — no gender needed.',
          },
          {
            value: 'gender',
            label: 'Gender-based',
            hint: 'Same-gender groups each round — players vote on the opposite gender (like Smash / Marry / Kill).',
          },
        ]}
      />
    </div>
  )
}
