export async function markPlayerReady(gameId: string, resumeToken: string): Promise<void> {
  const res = await fetch('/api/players/ready', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, resumeToken }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to mark ready')
  }
}
