'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CodewordsEndGameStats } from '@/components/codewords/CodewordsEndGameStats'
import { CodewordsAchievementPosts } from '@/components/codewords/CodewordsAchievementPosts'
import { CodewordsFinalResultsShareBlock } from '@/components/codewords/CodewordsFinalResultsShareBlock'
import { CodewordsBoardGrid } from '@/components/codewords/CodewordsBoardGrid'
import { CodewordsLobbyRoster } from '@/components/codewords/CodewordsLobbyRoster'
import { CodewordsScoreboard } from '@/components/codewords/CodewordsScoreboard'
import { HostLobbyStartButton } from '@/components/host-lobby/HostLobbyStartButton'
import { HostVisibilityToggle } from '@/components/host-lobby/HostVisibilityToggle'
import { HostContentLabelField } from '@/components/host-lobby/HostContentLabelField'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbySettingsSection } from '@/components/host-lobby/HostLobbySettingsSection'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostLobbyOptionChips } from '@/components/host-lobby/HostLobbyOptionChips'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
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
  firstTeam = 'random' as 'random' | 'red' | 'blue',
  onFirstTeamChange,
  teamAssignment = 'players' as 'players' | 'host' | 'randomize',
  onTeamAssignmentChange,
  customWordCount = 0,
  onEditWordPool,
  savingWordPool = false,
  settingsBottom,
  hostPlayerId = null,
  hostPlays = false,
  embeddedInLobby = false,
  slot = 'all',
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
  firstTeam?: 'random' | 'red' | 'blue'
  onFirstTeamChange?: (team: 'random' | 'red' | 'blue') => void
  teamAssignment?: 'players' | 'host' | 'randomize'
  onTeamAssignmentChange?: (mode: 'players' | 'host' | 'randomize') => void
  customWordCount?: number
  onEditWordPool?: () => void
  savingWordPool?: boolean
  /** Rendered last inside the "Before you start" section (e.g. late-joiners). */
  settingsBottom?: React.ReactNode
  /** The host's own player id + whether they're playing — used to auto-post the
   *  host's role achievement to the community leaderboard when they win one. */
  hostPlayerId?: string | null
  hostPlays?: boolean
  /** When embedded inside the mobile-parity HostLobby, hide this panel's own players
   *  list + Start/End footer (HostLobby renders those); keep teams + settings. */
  embeddedInLobby?: boolean
  /** Which slice to render inside HostLobby: 'lobby-teams' = the team roster only (main
   *  screen); 'lobby-settings' = "Before you start" + Public game only (the ⚙ sheet).
   *  'all' (default) renders everything for the tabbed manage. */
  slot?: 'all' | 'lobby-teams' | 'lobby-settings'
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

  const handleSetSpymaster = (playerId: string, team: CodewordsTeam) => {
    const current = roles.find((r) => r.player_id === playerId)
    const makeSpymaster = current?.role !== 'spymaster'
    onSetSpymaster(playerId, team, makeSpymaster)
  }

  const startDisabled = starting || players.length < CODEWORDS_MIN_PLAYERS || !ready.ok
  const startDisabledHint =
    players.length < CODEWORDS_MIN_PLAYERS
      ? `Need at least ${CODEWORDS_MIN_PLAYERS} players to start (${players.length}/${CODEWORDS_MIN_PLAYERS})`
      : !ready.ok
        ? ready.error
        : null

  // HostLobby slots: teams roster on the main screen, settings ("Before you start" +
  // Public game) in the ⚙ sheet. 'all' (tabbed manage) shows both.
  const showTeams = slot !== 'lobby-settings'
  const showSettings = slot !== 'lobby-teams'

  const sessionEnded = game.status === 'finished'
  const roundWon = Boolean(board?.winner)
  const showWinnerResults = Boolean(board && roundWon && (sessionEnded || game.status === 'active'))
  const showSessionEndedResults = Boolean(board && sessionEnded && !board.winner)
  const playAgainButton = (
    <button type="button" onClick={onPlayAgain} disabled={playingAgain || ending} className="btn-primary w-full">
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
            winner={board.winner}
            playAgainButton={playAgainButton}
          />
          <div className="glass-card p-4 space-y-4">
            <p className="label-caps text-center">Final board</p>
            <CodewordsBoardGrid board={board} showKey cellAttribution={cellAttribution} />
            <CodewordsEndGameStats guesses={guesses} roles={roles} players={players} winner={board.winner} />
          </div>
          {hostPlays && hostPlayerId && (
            <CodewordsAchievementPosts
              guesses={guesses}
              roles={roles}
              players={players}
              winner={board.winner}
              myPlayerId={hostPlayerId}
              gameCode={gameCode}
              roundKey={board.id}
            />
          )}
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

      {/* Teams + Unassigned roster — the lineup, kept up top */}
      {showTeams && (inLobby || game.status === 'active' || game.status === 'finished') && (
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
        </div>
      )}

      {inLobby && players.length > 0 && !embeddedInLobby && (
        <HostLobbyPlayersSection players={players} highlightPlayerId={null} alwaysShowReady />
      )}

      {/* Before you start — every other setup option lives here, collapsed by default */}
      {showSettings && inLobby && (
        <HostLobbySettingsSection title="Before you start" status={savingMaxPlayers || savingTimers ? 'Saving…' : null}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
            <HostLobbySettingBlock title={`Max players · ${players.length} joined`}>
              <HostLobbyOptionChips
                value={lobbyMaxPlayers}
                options={maxPlayerOptions}
                onChange={onMaxPlayersChange}
                disabled={savingMaxPlayers}
              />
            </HostLobbySettingBlock>

            {onTeamAssignmentChange && (
              <HostLobbySettingBlock title="Team assignment">
                <div className="flex rounded-xl border border-[var(--border)] overflow-hidden text-sm">
                  {(['players', 'host', 'randomize'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onTeamAssignmentChange(opt)}
                      className={`flex-1 py-1.5 font-semibold transition-colors ${
                        teamAssignment === opt ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                      }`}
                    >
                      {opt === 'players' ? 'Players pick' : opt === 'host' ? 'Host assigns' : '🎲 Random'}
                    </button>
                  ))}
                </div>
              </HostLobbySettingBlock>
            )}

            {onFirstTeamChange && (
              <HostLobbySettingBlock title="Goes first">
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
              </HostLobbySettingBlock>
            )}

            <HostLobbySettingBlock title="Timers" className="sm:col-span-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 flex-1 min-w-[8rem]">
                  <span className="text-faint text-xs">Spymaster</span>
                  <select
                    value={spymasterTimer}
                    onChange={(e) => onSpymasterTimerChange(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {CODEWORDS_TIMER_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}s
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 flex-1 min-w-[8rem]">
                  <span className="text-faint text-xs">Operative</span>
                  <select
                    value={operativeTimer}
                    onChange={(e) => onOperativeTimerChange(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {CODEWORDS_TIMER_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}s
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onSaveTimers}
                  disabled={savingTimers}
                  className="btn-secondary btn-fit shrink-0"
                >
                  {savingTimers ? 'Saving…' : 'Save'}
                </button>
              </div>
            </HostLobbySettingBlock>

            {onEditWordPool && (
              <HostLobbySettingBlock title="Word list" className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-faint text-xs">
                    {customWordCount} word{customWordCount === 1 ? '' : 's'} in your library
                  </p>
                  <button
                    type="button"
                    onClick={onEditWordPool}
                    disabled={savingWordPool}
                    className="btn-secondary btn-fit shrink-0 text-sm"
                  >
                    {savingWordPool ? 'Saving…' : 'Change or upload CSV'}
                  </button>
                </div>
              </HostLobbySettingBlock>
            )}

            {settingsBottom && <div className="sm:col-span-2">{settingsBottom}</div>}
          </div>
        </HostLobbySettingsSection>
      )}

      {/* Start + close — actions. Hidden inside HostLobby (it owns the Start/End footer and
          the central Public-game toggle); shown only in the tabbed manage. */}
      {showSettings && inLobby && !embeddedInLobby && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-3 space-y-3">
            <HostVisibilityToggle gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
            <HostContentLabelField gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
          </div>
          {!embeddedInLobby && (
            <>
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
                icon={<ExitIcon size={16} />}
                confirmTitle="Close this lobby?"
                confirmMessage="Players will be disconnected. You can start a new game from Play again afterward."
                className="btn-danger-soft"
              />
            </>
          )}
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
              className="btn-danger-soft flex-1"
            >
              <ExitIcon size={16} />
              {ending ? 'Closing…' : 'Close session'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
