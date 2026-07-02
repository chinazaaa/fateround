export function Avatar({ name }: { name: string }) {
  return <div className="avatar w-7 h-7 text-xs shrink-0">{name.charAt(0).toUpperCase()}</div>
}
