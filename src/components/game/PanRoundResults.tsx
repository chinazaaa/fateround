'use client'

interface PanRoundResultsProps {
  pickerName: string
  pickedNumber?: number | null
  question: string
}

export function PanRoundResults({ pickerName, pickedNumber, question }: PanRoundResultsProps) {
  return (
    <div className="glass-card border-2 border-violet-500/35 rounded-2xl p-5 space-y-4">
      <div className="text-center">
        <p className="text-violet-600 dark:text-violet-400 text-xs uppercase tracking-wider mb-1">Pick a Number</p>
        {pickedNumber ? (
          <p className="text-muted text-sm">
            <span className="font-semibold text-body">{pickerName}</span> picked{' '}
            <span className="font-black text-violet-700 dark:text-violet-300 text-lg">#{pickedNumber}</span>
          </p>
        ) : (
          <p className="text-muted text-sm">
            <span className="font-semibold text-body">{pickerName}</span> revealed a question
          </p>
        )}
      </div>
      <div className="rounded-xl border border-theme surface-inset p-4">
        <p className="text-muted text-xs uppercase tracking-wider text-center mb-2">Revealed question</p>
        <p className="text-lg font-semibold text-body text-center leading-snug">{question}</p>
      </div>
    </div>
  )
}
