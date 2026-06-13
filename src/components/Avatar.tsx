'use client'

import { getInitial } from '@/lib/utils'

const sizeMap = {
  sm: { container: 'w-8 h-8 text-sm', px: 32 },
  md: { container: 'w-10 h-10 text-lg', px: 40 },
  lg: { container: 'w-14 h-14 text-xl', px: 56 },
} as const

export interface AvatarProps {
  name: string
  photoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ name, photoUrl, size = 'md', className = '' }: AvatarProps) {
  const s = sizeMap[size]

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        width={s.px}
        height={s.px}
        className={`${s.container} rounded-full object-cover shrink-0 ${className}`}
      />
    )
  }

  return <div className={`avatar ${s.container} shrink-0 ${className}`}>{getInitial(name)}</div>
}
