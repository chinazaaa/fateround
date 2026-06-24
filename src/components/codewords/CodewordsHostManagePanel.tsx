'use client'

import { CodewordsEndGameStats } from '@/components/codewords/CodewordsEndGameStats'
import { CodewordsFinalResultsShareBlock } from '@/components/codewords/CodewordsFinalResultsShareBlock'
import { CodewordsBoardGrid } from '@/components/codewords/CodewordsBoardGrid'
import { CodewordsLobbyRoster } from '@/components/codewords/CodewordsLobbyRoster'
import { CodewordsScoreboard } from '@/components/codewords/CodewordsScoreboard'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyStartButton } from '@/components/host-lobby/HostLobbyStartButton'
import {
  CODEWORDS_MIN_PLAYERS,
  CODEWORDS_TIMER_OPTIONS,
  codewordsInLobby,
  codewordsLateJoin,
  codewordsMaxPlayers,
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  guessAttributionMap,
  lobbyReadyForGame,
  teamsNeedRandomization,
  teamLabel,
  waitingTurnMessage,
} from '@/lib/codewords'
import type { CodewordsBoard, CodewordsGuess, CodewordsPlayerRole, CodewordsTeam, Game, Player } from '@/types'

export function CodewordsHostManagePanel({
  game,
  gameCode,
  hostToken,
  playerLink,
  players,
  roles,
  board,
  guesses,
  spymasterTimer,
  operativeTimer,
  savingTimers,
  savingRoleFor,
  starting,
  playingAgain,
  ending,
  onSpymasterTimerChange,
  onOperativeTimerChange,
  onSaveTimers,
  onSetSpymaster,
  onMoveTeam,
  onStartGame,
  onRandomizeTeams,
  onPlayAgain,
  onEndSession,
  onReload,
  onBenchPlayer,
  onRemovePlayer,
  benchingPlayerId,
  removingPlayerId,
  randomizingTeams = false,
  showSpectatorBoard = true,
}: {
  game: Game
  gameCode: string
  hostToken: string
  playerLink: string
  players: Player[]
  roles: CodewordsPlayerRole[]
  board: CodewordsBoard | null
  guesses: CodewordsGuess[]
  spymasterTimer: number
  operativeTimer: number
  savingTimers: boolean
  savingRoleFor: string | null
  starting: boolean
  playingAgain: boolean
  ending: boolean
  onSpymasterTimerChange: (seconds: number) => void
  onOperativeTimerChange: (seconds: number) => void
  onSaveTimers: () => void
  onSetSpymaster: (playerId: string, team: CodewordsTeam, makeSpymaster: boolean) => void
  onMoveTeam: (playerId: string, team: CodewordsTeam) => void
  onStartGame: () => void
  onRandomizeTeams?: () => void
  onPlayAgain: () => void
  onEndSession: () => void
  onReload: () => void | Promise<unknown>
  onBenchPlayer?: (playerId: string) => void
  onRemovePlayer?: (playerId: string, playerName: string) => void | Promise<void | boolean>
  benchingPlayerId?: string | null
  removingPlayerId?: string | null
  randomizingTeams?: boolean
  showSpectatorBoard?: boolean
}) {
  const randomizeTeams = codewordsRandomizeTeams(game)
  const playerIds = players.map((p) => p.id)
  const ready = lobbyReadyForGame(roles, playerIds, randomizeTeams)
  const needsShuffle = randomizeTeams && teamsNeedRandomization(playerIds, roles)
  const inLobby = codewordsInLobby(game.status, board)
  const playersPickTeams = codewordsPlayerPicks(game)
  const lateJoin = codewordsLateJoin(game)
  const playerNameById = new Map(players.map((p) => [p.id, p.name]))
  const cellAttribution = board ? guessAttributionMap(guesses, playerNameById) : {}
  const turnStatus = board ? waitingTurnMessage(board, roles, playerNameById) : ''

  const handleSetSpymaster = (playerId: string, team: CodewordsTeam) => {
    const current = roles.find((r) => r.player_id === playerId)
    const makeSpymaster = current?.role !== 'spymaster'
    onSetSpymaster(playerId, team, makeSpymaster)
  }

  const startDisabled =
    starting || players.length < CODEWORDS_MIN_PLAYERS || !ready.ok
  const startDisabledHint =
    players.length < CODEWORDS_MIN_PLAYERS
      ? `Need at least ${CODEWORDS_MIN_PLAYERS} players to start (${players.length}/${CODEWORDS_MIN_PLAYERS})`
      : !ready.ok
        ? ready.error
        : null

  return (
    <div className="space-y-5">
      {inLobby && (
        <div className="glass-card p-5 space-y-3 border-[color-mix(in_srgb,var(--primary)_18%,var(--border))]">
          <p className="label-caps">Lobby</p>
          <p className="text-faint text-xs leading-relaxed">
            Assign teams below, then start when everyone is ready.
          </p>
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={onStartGame}
            onEnded={onReload}
            starting={starting}
            startDisabled={startDisabled}
            startDisabledHint={startDisabledHint}
          />
        </div>
      )}

      <div className="glass-card p-5 space-y-4">
        <p className="label-caps">Timers</p>
        {inLobby ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-faint text-xs">Spymaster timer</span>
                <select
                  value={spymasterTimer}
                  onChange={(e) => onSpymasterTimerChange(Number(e.target.value))}
                  className="input-field w-full"
                >
                  {CODEWORDS_TIMER_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-faint text-xs">Operative timer</span>
                <select
                  value={operativeTimer}
                  onChange={(e) => onOperativeTimerChange(Number(e.target.value))}
                  className="input-field w-full"
                >
                  {CODEWORDS_TIMER_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={onSaveTimers}
              disabled={savingTimers}
              className="btn-secondary w-full sm:w-auto"
            >
              {savingTimers ? 'Saving…' : 'Save timers'}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">
            Spymaster {spymasterTimer}s · Operative {operativeTimer}s
            <span className="block text-faint text-xs mt-1">Timer settings are locked once the game starts.</span>
          </p>
        )}
      </div>

      {(inLobby || game.status === 'active' || game.status === 'finished') && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="label-caps">
                Teams ({players.length}/{codewordsMaxPlayers(game)})
              </p>
              <p className="text-faint text-xs mt-1">
                {inLobby ? (
                  <>
                    {randomizeTeams ? (
                      <>
                        Pick one red and one blue spymaster, then shuffle to fill operatives. Use arrows to move anyone
                        afterward.
                        {lateJoin ? ' New players can join mid-game.' : ' Lobby locked once the game starts.'}
                      </>
                    ) : (
                      <>
                        Tap ☆ to pick each team&apos;s spymaster. Use arrows to move players between Red and Blue.
                        {playersPickTeams ? ' Players can also pick their own team.' : ' You assign everyone.'}
                        {lateJoin ? ' New players can join mid-game.' : ' Lobby locked once the game starts.'}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Team lineup for this round. Use arrows to move players, Waiting to unassign, or Remove to kick them
                    from the game.
                  </>
                )}
              </p>
            </div>
            {inLobby && players.length >= CODEWORDS_MIN_PLAYERS && (
              <span
                className={[
                  'text-xs font-semibold rounded-full px-2.5 py-1',
                  ready.ok
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                    : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                ].join(' ')}
              >
                {ready.ok ? 'Ready' : 'Not ready'}
              </span>
            )}
          </div>

          <CodewordsLobbyRoster
            players={players}
            roles={roles}
            savingRoleFor={savingRoleFor}
            benchingPlayerId={benchingPlayerId}
            removingPlayerId={removingPlayerId}
            readOnly={game.status === 'finished'}
            randomizeTeams={randomizeTeams && inLobby}
            onSetSpymaster={handleSetSpymaster}
            onMoveTeam={onMoveTeam}
            onBenchPlayer={onBenchPlayer}
            onRemovePlayer={onRemovePlayer}
          />

          {inLobby && needsShuffle && onRandomizeTeams && (
            <button
              type="button"
              onClick={onRandomizeTeams}
              disabled={randomizingTeams || !ready.ok}
              className="btn-secondary w-full"
            >
              {randomizingTeams ? 'Shuffling…' : 'Shuffle teams'}
            </button>
          )}

          {inLobby && (
            <HostLobbyStartButton
              onClick={onStartGame}
              disabled={startDisabled}
              starting={starting}
              disabledHint={startDisabledHint}
            />
          )}
        </div>
      )}

      {showSpectatorBoard && board && game.status === 'active' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
          <div className="glass-card p-4 space-y-3">
            <p className="label-caps">Live board (host view)</p>
            <p className="text-center text-sm text-muted">{turnStatus}</p>
            {board.current_clue_word && (
              <p className="text-center text-sm">
                Clue: <strong>{board.current_clue_word}</strong> {board.current_clue_number}
              </p>
            )}
            <CodewordsBoardGrid board={board} showKey cellAttribution={cellAttribution} />
          </div>
          <aside className="space-y-3">
            <CodewordsScoreboard board={board} players={players} roles={roles} />
          </aside>
        </div>
      )}

      {board && game.status === 'active' && board.winner && showSpectatorBoard && (
        <div className="space-y-4">
          <CodewordsFinalResultsShareBlock
            game={game}
            players={players}
            guesses={guesses}
            roles={roles}
            winnerLabel={`${teamLabel(board.winner)} team wins!`}
            playAgainButton={
              <button
                type="button"
                onClick={onPlayAgain}
                disabled={playingAgain || ending}
                className="btn-primary w-full"
              >
                {playingAgain ? 'Returning…' : 'Return to lobby'}
              </button>
            }
          />
          <div className="glass-card p-4 space-y-4">
            <p className="label-caps text-center">Final board</p>
            <CodewordsBoardGrid board={board} showKey cellAttribution={cellAttribution} />
            <CodewordsEndGameStats guesses={guesses} roles={roles} players={players} winner={board.winner} />
          </div>
        </div>
      )}

      {game.status === 'active' && board && !board.winner && (
        <div className="glass-card p-4 space-y-3">
          <p className="label-caps">End game</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onPlayAgain}
              disabled={playingAgain || ending}
              className="btn-primary flex-1"
            >
              {playingAgain ? 'Returning…' : 'Return to lobby'}
            </button>
            <button
              type="button"
              onClick={onEndSession}
              disabled={playingAgain || ending}
              className="btn-secondary flex-1"
            >
              {ending ? 'Closing…' : 'Close session'}
            </button>
          </div>
        </div>
      )}

      {board && game.status === 'finished' && !board.winner && showSpectatorBoard && (
        <div className="space-y-4">
          <CodewordsFinalResultsShareBlock
            game={game}
            players={players}
            guesses={guesses}
            roles={roles}
            winnerLabel="Session ended"
            subtitle="The game was closed before a team won."
            playAgainButton={
              <button type="button" onClick={onPlayAgain} disabled={playingAgain} className="btn-primary w-full">
                {playingAgain ? 'Resetting…' : 'Return to lobby'}
              </button>
            }
          />
          <div className="glass-card p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
              <CodewordsBoardGrid board={board} showKey cellAttribution={cellAttribution} />
              <CodewordsScoreboard board={board} players={players} roles={roles} />
            </div>
            <CodewordsEndGameStats guesses={guesses} roles={roles} players={players} />
          </div>
        </div>
      )}

      {board && game.status === 'finished' && board.winner && showSpectatorBoard && (
        <div className="space-y-4">
          <CodewordsFinalResultsShareBlock
            game={game}
            players={players}
            guesses={guesses}
            roles={roles}
            winnerLabel={`${teamLabel(board.winner)} team wins!`}
            playAgainButton={
              <button type="button" onClick={onPlayAgain} disabled={playingAgain} className="btn-primary w-full">
                {playingAgain ? 'Resetting…' : 'Return to lobby'}
              </button>
            }
          />
          <div className="glass-card p-4 space-y-4">
            <p className="label-caps text-center">Final board</p>
            <CodewordsBoardGrid board={board} showKey cellAttribution={cellAttribution} />
            <CodewordsEndGameStats guesses={guesses} roles={roles} players={players} winner={board.winner} />
          </div>
        </div>
      )}
    </div>
  )
}
