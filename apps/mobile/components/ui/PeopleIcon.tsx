import Svg, { Circle, Path } from 'react-native-svg'

/** Two-person outline for the roster/players affordance. Mirrors GearIcon. */
export function PeopleIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7} r={3.25} stroke={color} strokeWidth={2} />
      <Path
        d="M3.5 20v-1a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v1"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 4.2a3.25 3.25 0 0 1 0 6.1M18 14.2a5 5 0 0 1 3.5 4.8v1"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
