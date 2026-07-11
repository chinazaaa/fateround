type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

function keyFor(gameCode: string): string {
  return gameCode.toUpperCase()
}

export function subscribePlayerSession(gameCode: string, listener: Listener): () => void {
  const key = keyFor(gameCode)
  const set = listeners.get(key) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(key, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(key)
  }
}

export function notifyPlayerSessionChanged(gameCode: string): void {
  const set = listeners.get(keyFor(gameCode))
  if (!set) return
  for (const listener of set) listener()
}
