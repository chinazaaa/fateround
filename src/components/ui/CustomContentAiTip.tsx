import type { CustomContentHint } from '@/lib/custom-content-hints'

type Props = {
  hint: CustomContentHint
  accent?: string
  className?: string
}

/**
 * Compact "Download sample CSV" link for custom-content uploads. The old version rendered
 * a full explainer card (headline + body + "ask your AI" prompt); that took a lot of vertical
 * space above every upload, so it's now just the sample-download link. The AI-prompt guidance
 * lives in the "Generate with AI" tab instead.
 */
export function CustomContentAiTip({ hint, className = '' }: Props) {
  if (!hint.sampleHref) return null
  return (
    <a
      href={hint.sampleHref}
      download={hint.sampleDownload}
      className={`inline-block text-xs font-semibold text-body hover:opacity-80 transition-opacity no-underline ${className}`}
    >
      Download sample CSV →
    </a>
  )
}
