/** Room member code from game URL (?member=CODE) for linking game players to room stats. */
export function roomMemberCodeFromSearch(search: string): string | undefined {
  const code = new URLSearchParams(search).get('member')?.trim().toUpperCase()
  return code || undefined
}

export function gamePathWithRoomMember(gameId: string, memberCode?: string | null): string {
  const base = `/game/${gameId}`
  if (!memberCode) return base
  return `${base}?member=${encodeURIComponent(memberCode)}`
}
