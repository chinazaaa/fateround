import type { WhotShape } from '@/types'

export const WHOT_SHAPE_COLORS: Record<WhotShape, string> = {
  circle: '#60a5fa',
  cross: '#4ade80',
  triangle: '#fbbf24',
  square: '#f87171',
  star: '#a78bfa',
  whot: '#e879f9',
}

const SIZE_PX = { sm: 16, md: 20, lg: 24 } as const

function ShapeGraphic({ shape, color }: { shape: WhotShape; color: string }) {
  switch (shape) {
    case 'circle':
      return <circle cx="12" cy="12" r="9" fill={color} />
    case 'cross':
      return (
        <>
          <rect x="9.5" y="3" width="5" height="18" rx="1.5" fill={color} />
          <rect x="3" y="9.5" width="18" height="5" rx="1.5" fill={color} />
        </>
      )
    case 'triangle':
      return <polygon points="12,2 22,21 2,21" fill={color} strokeLinejoin="round" />
    case 'square':
      return <rect x="3" y="3" width="18" height="18" rx="2.5" fill={color} />
    case 'star':
      return (
        <polygon
          points="12,2.25 14.6,9.4 22.1,9.4 16.4,13.9 18.5,21 12,16.7 5.6,21 7.7,13.9 1.9,9.4 9.4,9.4"
          fill={color}
          strokeLinejoin="round"
        />
      )
    case 'whot':
      return <polygon points="12,2 22,12 12,22 2,12" fill={color} strokeLinejoin="round" />
  }
}

export function WhotShapeIcon({
  shape,
  size = 'md',
  variant = 'default',
  className = '',
}: {
  shape: WhotShape
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'on-card'
  className?: string
}) {
  const px = SIZE_PX[size]
  const color = variant === 'on-card' ? '#ffffff' : WHOT_SHAPE_COLORS[shape]

  return (
    <svg viewBox="0 0 24 24" width={px} height={px} className={`shrink-0 ${className}`} aria-hidden>
      <ShapeGraphic shape={shape} color={color} />
    </svg>
  )
}
