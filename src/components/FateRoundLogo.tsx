'use client'

type FateRoundLogoProps = {
  className?: string
}

/** Horizontal wordmark — swaps with `data-theme` (no hydration flash). */
export function FateRoundLogo({ className = 'h-9 w-auto' }: FateRoundLogoProps) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/fateround-logo-horizontal.svg"
        alt="Fate Round"
        className={`logo-theme-light ${className}`}
        width={640}
        height={160}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/fateround-logo-mono-dark.svg"
        alt=""
        aria-hidden
        className={`logo-theme-dark ${className}`}
        width={640}
        height={160}
      />
    </>
  )
}
