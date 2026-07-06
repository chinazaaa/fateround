import { mahjongTileBase, mahjongTileLabel } from '@/lib/mahjong'

const CHINESE_NUMERALS: Record<number, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
}

const WIND_GLYPHS: Record<string, string> = {
  we: '東',
  ws: '南',
  ww: '西',
  wn: '北',
}

const DRAGON_GLYPHS: Record<string, string> = {
  dr: '中',
  dg: '發',
  dw: '白',
}

const dotPatterns: Record<number, Array<[number, number, 'red' | 'blue' | 'green']>> = {
  1: [[30, 45, 'red']],
  2: [
    [22, 35, 'blue'],
    [38, 55, 'blue'],
  ],
  3: [
    [22, 34, 'blue'],
    [30, 45, 'red'],
    [38, 56, 'blue'],
  ],
  4: [
    [22, 34, 'blue'],
    [38, 34, 'blue'],
    [22, 56, 'blue'],
    [38, 56, 'blue'],
  ],
  5: [
    [22, 34, 'blue'],
    [38, 34, 'blue'],
    [30, 45, 'red'],
    [22, 56, 'blue'],
    [38, 56, 'blue'],
  ],
  6: [
    [22, 31, 'green'],
    [38, 31, 'green'],
    [22, 45, 'green'],
    [38, 45, 'green'],
    [22, 59, 'green'],
    [38, 59, 'green'],
  ],
  7: [
    [22, 27, 'green'],
    [38, 27, 'green'],
    [30, 39, 'red'],
    [22, 51, 'green'],
    [38, 51, 'green'],
    [22, 63, 'green'],
    [38, 63, 'green'],
  ],
  8: [
    [22, 26, 'blue'],
    [38, 26, 'blue'],
    [22, 38, 'blue'],
    [38, 38, 'blue'],
    [22, 52, 'blue'],
    [38, 52, 'blue'],
    [22, 64, 'blue'],
    [38, 64, 'blue'],
  ],
  9: [
    [22, 25, 'blue'],
    [38, 25, 'blue'],
    [22, 37, 'blue'],
    [38, 37, 'blue'],
    [30, 45, 'red'],
    [22, 55, 'green'],
    [38, 55, 'green'],
    [22, 67, 'green'],
    [38, 67, 'green'],
  ],
}

const bambooPatterns: Record<number, Array<[number, number, 'red' | 'green']>> = {
  1: [[30, 45, 'green']],
  2: [
    [23, 44, 'green'],
    [37, 44, 'green'],
  ],
  3: [
    [21, 38, 'green'],
    [30, 52, 'red'],
    [39, 38, 'green'],
  ],
  4: [
    [22, 36, 'green'],
    [38, 36, 'green'],
    [22, 58, 'green'],
    [38, 58, 'green'],
  ],
  5: [
    [22, 34, 'green'],
    [38, 34, 'green'],
    [30, 47, 'red'],
    [22, 60, 'green'],
    [38, 60, 'green'],
  ],
  6: [
    [22, 31, 'green'],
    [38, 31, 'green'],
    [22, 45, 'green'],
    [38, 45, 'green'],
    [22, 59, 'green'],
    [38, 59, 'green'],
  ],
  7: [
    [22, 27, 'green'],
    [38, 27, 'green'],
    [30, 39, 'red'],
    [22, 51, 'green'],
    [38, 51, 'green'],
    [22, 63, 'green'],
    [38, 63, 'green'],
  ],
  8: [
    [22, 26, 'green'],
    [38, 26, 'green'],
    [22, 38, 'green'],
    [38, 38, 'green'],
    [22, 52, 'green'],
    [38, 52, 'green'],
    [22, 64, 'green'],
    [38, 64, 'green'],
  ],
  9: [
    [22, 25, 'green'],
    [38, 25, 'green'],
    [22, 37, 'green'],
    [38, 37, 'green'],
    [30, 45, 'red'],
    [22, 55, 'green'],
    [38, 55, 'green'],
    [22, 67, 'green'],
    [38, 67, 'green'],
  ],
}

function tileNumber(tile: string): number {
  return Number(tile.slice(1))
}

function suitColor(suit: string): string {
  if (suit === 'm') return '#d21f2b'
  if (suit === 'p') return '#2166c2'
  return '#168a45'
}

function DotMark({ x, y, tone }: { x: number; y: number; tone: 'red' | 'blue' | 'green' }) {
  const fill = tone === 'red' ? '#d21f2b' : tone === 'green' ? '#168a45' : '#2166c2'
  return (
    <g>
      <circle cx={x} cy={y} r="5.4" fill="#fffdf6" stroke={fill} strokeWidth="2" />
      <circle cx={x} cy={y} r="2.2" fill={fill} />
    </g>
  )
}

function BambooMark({ x, y, tone }: { x: number; y: number; tone: 'red' | 'green' }) {
  const fill = tone === 'red' ? '#d21f2b' : '#168a45'
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-2.8" y="-9" width="5.6" height="18" rx="2.8" fill={fill} />
      <path d="M-5 -4H5M-5 4H5" stroke="#fffdf6" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M0 -8C-5 -5 -5 5 0 8C5 5 5 -5 0 -8Z" fill="none" stroke="#0b5f31" strokeWidth="1" opacity="0.45" />
    </g>
  )
}

function DotsFace({ value }: { value: number }) {
  return (
    <>
      {(dotPatterns[value] ?? []).map(([x, y, tone], index) => (
        <DotMark key={`${x}-${y}-${index}`} x={x} y={y} tone={tone} />
      ))}
    </>
  )
}

function BambooFace({ value }: { value: number }) {
  return (
    <>
      {(bambooPatterns[value] ?? []).map(([x, y, tone], index) => (
        <BambooMark key={`${x}-${y}-${index}`} x={x} y={y} tone={tone} />
      ))}
    </>
  )
}

function CharactersFace({ value }: { value: number }) {
  return (
    <>
      <text
        x="30"
        y="43"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="serif"
        fontSize="24"
        fontWeight="900"
        fill="#d21f2b"
      >
        {CHINESE_NUMERALS[value]}
      </text>
      <text
        x="30"
        y="62"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="serif"
        fontSize="20"
        fontWeight="900"
        fill="#111827"
      >
        萬
      </text>
    </>
  )
}

function HonorFace({ tile }: { tile: string }) {
  const dragon = DRAGON_GLYPHS[tile]
  const wind = WIND_GLYPHS[tile]
  const fill = tile === 'dr' ? '#d21f2b' : tile === 'dg' ? '#168a45' : tile === 'dw' ? '#2166c2' : '#111827'

  if (tile === 'dw') {
    return (
      <>
        <rect x="20" y="33" width="20" height="28" rx="3" fill="none" stroke="#2166c2" strokeWidth="3" />
        <text
          x="30"
          y="47"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="serif"
          fontSize="15"
          fontWeight="900"
          fill="#2166c2"
        >
          {dragon}
        </text>
      </>
    )
  }

  return (
    <text
      x="30"
      y="48"
      textAnchor="middle"
      dominantBaseline="middle"
      fontFamily="serif"
      fontSize="30"
      fontWeight="900"
      fill={fill}
    >
      {dragon ?? wind ?? tile}
    </text>
  )
}

function FlowerFace({ tile }: { tile: string }) {
  const label = mahjongTileLabel(tile)
  const top = tile.startsWith('se') ? label.slice(0, 2) : label.slice(0, 5)
  const glyph = tile === 'f1' ? '梅' : tile === 'f2' ? '蘭' : tile === 'f3' ? '菊' : tile === 'f4' ? '竹' : '季'
  return (
    <>
      <text
        x="30"
        y="38"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="serif"
        fontSize="24"
        fontWeight="900"
        fill="#b45309"
      >
        {glyph}
      </text>
      <text
        x="30"
        y="59"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Arial, sans-serif"
        fontSize="8"
        fontWeight="900"
        fill="#168a45"
      >
        {top}
      </text>
    </>
  )
}

export function MahjongTileFace({ tile, compact = false }: { tile: string; compact?: boolean }) {
  const base = mahjongTileBase(tile)
  const suit = base[0] ?? ''
  const value = tileNumber(base)
  const isSuitTile = /^[mps][1-9]$/.test(base)
  const isFlower = /^f[1-4]$/.test(tile) || /^se[1-4]$/.test(tile)
  const color = isSuitTile ? suitColor(suit) : '#111827'
  const label = mahjongTileLabel(tile)

  return (
    <svg
      viewBox="0 0 60 84"
      role="img"
      aria-label={label}
      className={compact ? 'h-8 w-[1.45rem] shrink-0 drop-shadow-sm' : 'h-14 w-10 shrink-0 drop-shadow-md'}
    >
      <rect x="8" y="7" width="46" height="70" rx="7" fill="#c9b58e" />
      <rect x="5" y="4" width="46" height="70" rx="7" fill="#fbf4df" stroke="#8f7a55" strokeWidth="1.5" />
      <rect x="9" y="8" width="38" height="62" rx="5" fill="#fffaf0" stroke="#e2d1aa" strokeWidth="1" />
      {isSuitTile && (
        <>
          <text
            x="15"
            y="20"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
            fontSize="12"
            fontWeight="900"
            fill={color}
          >
            {value}
          </text>
          <text
            x="45"
            y="69"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
            fontSize="9"
            fontWeight="900"
            fill={color}
          >
            {suit === 'm' ? 'M' : suit === 'p' ? 'D' : 'B'}
          </text>
        </>
      )}
      {suit === 'p' && <DotsFace value={value} />}
      {suit === 's' && <BambooFace value={value} />}
      {suit === 'm' && <CharactersFace value={value} />}
      {tile !== base && <circle cx="43" cy="18" r="4" fill="#d21f2b" stroke="#fffdf6" strokeWidth="1.5" />}
      {isFlower ? <FlowerFace tile={tile} /> : !isSuitTile && <HonorFace tile={tile} />}
      <path d="M10 10H43" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
    </svg>
  )
}
