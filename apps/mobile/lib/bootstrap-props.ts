import type { Game, Player } from '@fateround/shared'

export type BootstrapLike = {
  code: string
  game: Game | null
  players: Player[]
  myPlayerId: string | null
  myResumeToken: string | null
  joinName: string
  setJoinName: (name: string) => void
  load: () => void | Promise<unknown>
}

export function lobbyPropsFromBootstrap(b: BootstrapLike) {
  if (!b.game) {
    throw new Error('lobbyPropsFromBootstrap requires game')
  }
  return {
    gameCode: b.code,
    game: b.game,
    players: b.players,
    myPlayerId: b.myPlayerId,
    myPlayerName: b.joinName,
    myResumeToken: b.myResumeToken,
    onReload: () => b.load(),
    onRenamed: (name: string) => b.setJoinName(name),
  }
}

export function shellPropsFromBootstrap(b: BootstrapLike) {
  return {
    gameCode: b.code,
    game: b.game,
    players: b.players,
    myPlayerId: b.myPlayerId,
    onPromoted: () => b.load(),
  }
}
