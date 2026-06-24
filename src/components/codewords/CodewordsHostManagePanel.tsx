'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CodewordsEndGameStats } from '@/components/codewords/CodewordsEndGameStats'
import { CodewordsFinalResultsShareBlock } from '@/components/codewords/CodewordsFinalResultsShareBlock'
import { CodewordsBoardGrid } from '@/components/codewords/CodewordsBoardGrid'
import { CodewordsLobbyRoster } from '@/components/codewords/CodewordsLobbyRoster'
import { CodewordsScoreboard } from '@/components/codewords/CodewordsScoreboard'
import { HostLobbyStartButton } from '@/components/host-lobby/HostLobbyStartButton'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { useToast } from '@/components/ui/Toast'
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
import { lobbyMaxPlayersFromGame, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
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
  onGameUpdate,
  onBenchPlayer,
  onRemovePlayer,
  benchingPlayerId,
  removingPlayerId,
  randomizingTeams = false,
  showSpectatorBoard = true,
  firstTeam = 'random' as 'random' | 'red' | 'blue',
  onFirstTeamChange,
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
  onGameUpdate: (game: Game) => void
  onBenchPlayer?: (playerId: string) => void
  onRemovePlayer?: (playerId: string, playerName: string) => void | Promise<void | boolean>
  benchingPlayerId?: string | null
  removingPlayerId?: string | null
  randomizingTeams?: boolean
  showSpectatorBoard?: boolean
  firstTeam?: 'random' | 'red' | 'blue'
  onFirstTeamChange?: (team: 'random' | 'red' | 'blue') => void
}) {
  const { error: toastError } = useToast()
  const [limits, setLimits] = useState<GamePlayerLimitsMap | null>(null)
  const [lobbyMaxPlayers, setLobbyMaxPlayers] = useState(codewordsMaxPlayers(game))
  const [savingMaxPlayers, setSavingMaxPlayers] = useState(false)

  useEffect(() => {
    void fetch('/api/game-limits')
      .then((res) => res.json())
      .then((data: { limits?: GamePlayerLimitsMap }) => {
        if (data.limits) setLimits(data.limits)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!limits) {
      setLobbyMaxPlayers(codewordsMaxPlayers(game))
      return
    }
    setLobbyMaxPlayers(lobbyMaxPlayersFromGame('codewords', game, limits))
  }, [game, limits])

  const limitCfg = limits?.codewords
  const minPlayers = limitCfg?.min ?? CODEWORDS_MIN_PLAYERS
  const maxCap = limitCfg?.max ?? codewordsMaxPlayers(game)

  const maxPlayerOptions = useMemo(
    () =>
      playerCountOptions(minPlayers, maxCap).map((n) => ({
        value: n,
        label: String(n),
      })),
    [maxCap, minPlayers]
  )

  const saveMaxPlayers = useCallback(
    async (next: number) => {
      setSavingMaxPlayers(true)
      try {
        const res = await fetch('/api/codewords/timers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, hostToken, max_players: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save max players')
        if (data.game) onGameUpdate(data.game)
      } catch (err) {
        setLobbyMaxPlayers(codewordsMaxPlayers(game))
        toastError(err instanceof Error ? err.message : 'Failed to save max players')
      } finally {
        setSavingMaxPlayers(false)
      }
    },
    [game, gameCode, hostToken, onGameUpdate, toastError]
  )

  const onMaxPlayersChange = (next: number) => {
    if (next < players.length) {
      toastError(`Already have ${players.length} players — remove someone first`)
      return
    }
    setLobbyMaxPlayers(next)
    void saveMaxPlayers(next)
  }

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

  const sessionEnded = game.status === 'finished'
  const roundWon = Boolean(board?.winner)
  const showWinnerResults = Boolean(board && roundWon && (sessionEnded || game.status === 'active'))
  const showSessionEndedResults = Boolean(board && sessionEnded && !board.winner)
  const playAgainButton = (
    <button
      type="button"
      onClick={onPlayAgain}
      disabled={playingAgain || ending}
      className="btn-primary w-full"
    >
      {playingAgain ? 'Returning…' : 'Return to lobby'}
    </button>
  )

  return (
    <div className="space-y-5">
      {showWinnerResults && board && (
        <div className="space-y-4">
          <CodewordsFinalResultsShareBlock
            game={game}
            players={players}
            guesses={guesses}
            roles={roles}
            winnerLabel={`${teamLabel(board.winner!)} team wins!`}
            playAgainButton={playAgainButton}
          />
          <div className="glass-card p-4 space-y-4">
            <p className="label-caps text-center">Final board</p>
            <CodewordsBoardGrid board={board} showKey cellAttribution={cellAttribution} />
            <CodewordsEndGameStats guesses={guesses} roles={roles} players={players} winner={board.winner} />
          </div>
        </div>
      )}

      {showSessionEndedResults && board && (
        <div className="space-y-4">
          <CodewordsFinalResultsShareBlock
            game={game}
            players={players}
            guesses={guesses}
            roles={roles}
            winnerLabel="Session ended"
            subtitle="The game was closed before a team won."
            playAgainButton={playAgainButton}
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

      {sessionEnded && !board && (
        <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Game over</p>
          <p className="text-muted text-sm">Return to the lobby to start another round with this group.</p>
          {playAgainButton}
        </div>
      )}

      {inLobby && (
        <div className="glass-card p-5 space-y-3 border-[color-mix(in_srgb,var(--primary)_18%,var(--border))]">
          <p className="label-caps">Lobby</p>
          <p className="text-faint text-xs leading-relaxed">
            Assign teams below, then start when everyone is ready.
          </p>
          <HostLobbySettingBlock title={`Max players · ${players.length} joined`}>
            <HostLobbyOptionChips
              value={lobbyMaxPlayers}
              options={maxPlayerOptions}
              onChange={onMaxPlayersChange}
              disabled={savingMaxPlayers}
            />
          </HostLobbySettingBlock>
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
                Teams ({players.length}/{lobbyMaxPlayers})
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
            <>
              {onFirstTeamChange && (
                <div className="space-y-1.5">
                  <p className="label-caps">Goes first</p>
                  <div className="flex rounded-xl border border-[var(--border)] overflow-hidden text-sm">
                    {(['random', 'red', 'blue'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onFirstTeamChange(opt)}
                        className={`flex-1 py-1.5 font-semibold capitalize transition-colors ${
                          firstTeam === opt ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                        }`}
                      >
                        {opt === 'random' ? '🎲 Random' : opt === 'red' ? '🔴 Red' : '🔵 Blue'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <HostLobbyStartButton
                onClick={onStartGame}
                disabled={startDisabled}
                starting={starting}
                disabledHint={startDisabledHint}
              />
              <HostEndGameButton
                gameCode={gameCode}
                hostToken={hostToken}
                onEnded={onReload}
                label="End lobby"
                confirmTitle="Close this lobby?"
                confirmMessage="Players will be disconnected. You can start a new game from Play again afterward."
                className="btn-secondary w-full"
              />
            </>
          )}
        </div>
      )}

      {showSpectatorBoard && board && game.status === 'active' && !board.winner && (
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
    </div>
  )
}
