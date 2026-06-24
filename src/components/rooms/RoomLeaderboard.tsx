type Member = {
  id: string
  display_name: string
  games_played: number
}

export function RoomLeaderboard({ members }: { members: Member[] }) {
  const sorted = [...members].sort((a, b) => b.games_played - a.games_played)

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <p className="text-faint text-sm text-center">
          Stats will appear here after your first game.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-2 px-3 text-faint font-medium text-xs">Member</th>
            <th className="text-center py-2 px-3 text-faint font-medium text-xs">Games played</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => (
            <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <span className="text-faint text-xs w-4 shrink-0">{i + 1}</span>
                  <span className="font-medium text-body truncate max-w-[200px]">{m.display_name}</span>
                </div>
              </td>
              <td className="text-center py-2.5 px-3 text-body">
                {m.games_played > 0 ? m.games_played : <span className="text-faint">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
