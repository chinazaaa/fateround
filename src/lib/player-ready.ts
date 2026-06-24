export async function markPlayerReady(gameId: string, playerId: string): Promise<void> {
  const res = await fetch('/api/players/ready', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, playerId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to mark ready')
  }
}
