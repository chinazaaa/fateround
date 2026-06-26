'use client'

import { useState } from 'react'
import { CodewordsEndGameStats } from '@/components/codewords/CodewordsEndGameStats'
import { CodewordsFinalResultsShareBlock } from '@/components/codewords/CodewordsFinalResultsShareBlock'
import { CodewordsTeamChat } from '@/components/codewords/CodewordsTeamChat'
import { CodewordsBoardGrid, CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import { CodewordsCurrentClueCard } from '@/components/codewords/CodewordsCurrentClueCard'
import { CodewordsScoreboard, CodewordsTimerBar } from '@/components/codewords/CodewordsScoreboard'
import { effectiveTurnPhase, guessAttributionMap, roleLabel, teamLabel, waitingTurnMessage } from '@/lib/codewords'
import { useCodewordsTurnTimer } from '@/hooks/useCodewordsTurnTimer'
import { useCodewordsNotifications, useCodewordsTimerAlerts } from '@/hooks/useCodewordsNotifications'
import type { CodewordsBoard, CodewordsGuess, CodewordsPlayerRole, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'

export function CodewordsActiveRound({
  gameCode,
  game,
  board,
  myPlayerId,
  myPlayerName,
  myRole,
  players,
  roles,
  guesses,
  onBoardChange,
  onReload,
  hideKey = false,
  compactHeader = false,
}: {
  gameCode: string
  game: Game
  board: CodewordsBoard
  myPlayerId: string
  myPlayerName: string
  myRole: CodewordsPlayerRole
  players: Player[]
  roles: CodewordsPlayerRole[]
  guesses: CodewordsGuess[]
  onBoardChange: (board: CodewordsBoard) => void
  onReload: () => void | Promise<void>
  hideKey?: boolean
  compactHeader?: boolean
}) {
  const { success, error: toastError } = useToast()
  const [clueWord, setClueWord] = useState('')
  const [clueNumberInput, setClueNumberInput] = useState('')
  const [submittingClue, setSubmittingClue] = useState(false)
  const [guessing, setGuessing] = useState(false)
  const [endingTurn, setEndingTurn] = useState(false)

  const isSpymaster = myRole.role === 'spymaster'
  const isOperative = myRole.role === 'operative'
  const myTeam = myRole.team
  const turnPhase = effectiveTurnPhase(board)
  const isMyTurn = board.current_turn === myTeam && !board.winner
  const canGiveClue = isMyTurn && isSpymaster && turnPhase === 'clue' && !board.current_clue_word
  const canGuess = isMyTurn && isOperative && turnPhase === 'guess' && !!board.current_clue_word
  const gameOver = Boolean(board.winner) || game.status === 'finished'
  const showKey = gameOver || (!hideKey && isSpymaster)
  const active = game.status === 'active' && !board.winner

  const { secondsLeft, urgent } = useCodewordsTurnTimer(gameCode, board, active)
  useCodewordsNotifications({ game, board, myRole, enabled: active || game.status === 'finished' })
  useCodewordsTimerAlerts(secondsLeft, active && (canGiveClue || canGuess))
  const playerNameById = new Map(players.map((p) => [p.id, p.name]))
  const cellAttribution = guessAttributionMap(guesses, playerNameById)

  const turnStatusMessage = () => {
    if (!isMyTurn) return waitingTurnMessage(board, roles, playerNameById)
    if (turnPhase === 'clue') {
      if (isSpymaster) return 'Your turn — give a one-word clue'
      const spymaster = roles.find((r) => r.team === myTeam && r.role === 'spymaster')
      const name = spymaster ? playerNameById.get(spymaster.player_id) : null
      return name ? `Waiting for ${name} (your spymaster) to give a clue` : 'Waiting for your spymaster to give a clue'
    }
    if (isOperative) return 'Your turn — tap words to guess'
    return 'Your operatives are guessing…'
  }

  const timerLabel =
    turnPhase === 'clue'
      ? isMyTurn && isSpymaster
        ? 'Spymaster timer'
        : 'Waiting for clue'
      : isMyTurn && isOperative
        ? 'Operative timer'
        : 'Operatives guessing'

  const parseClueNumber = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const n = Number.parseInt(trimmed, 10)
    if (Number.isNaN(n) || n < 0 || n > 9) return null
    return n
  }

  const submitClue = async () => {
    if (!clueWord.trim()) return
    const clueNumber = parseClueNumber(clueNumberInput)
    if (clueNumber === null) {
      toastError('Enter a clue number from 0 to 9')
      return
    }
    setSubmittingClue(true)
    try {
      const res = await fetch('/api/codewords/clue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId: myPlayerId,
          clueWord: clueWord.trim(),
          clueNumber,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to give clue')
      onBoardChange(data.board)
      setClueWord('')
      setClueNumberInput('')
      success('Clue sent!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to give clue')
    } finally {
      setSubmittingClue(false)
    }
  }

  const guessCell = async (index: number) => {
    if (guessing) return
    setGuessing(true)
    try {
      const res = await fetch('/api/codewords/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, cellIndex: index }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to guess')
      onBoardChange(data.board)
      await onReload()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to guess')
    } finally {
      setGuessing(false)
    }
  }

  const endTurn = async () => {
    if (endingTurn) return
    setEndingTurn(true)
    try {
      const res = await fetch('/api/codewords/end-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end turn')
      onBoardChange(data.board)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end turn')
    } finally {
      setEndingTurn(false)
    }
  }

  return (
    <div className={compactHeader ? 'space-y-4' : 'space-y-5'}>
      {!compactHeader && (
        <div className="text-center space-y-1">
          <h2 className="text-xl font-black gradient-title">{game.title}</h2>
          <p className="text-muted text-sm">
            {myPlayerName} · <CodewordsTeamBadge team={myRole.team} /> {roleLabel(myRole.role)}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          {secondsLeft > 0 && active && (
            <CodewordsTimerBar label={timerLabel} secondsLeft={secondsLeft} urgent={urgent} />
          )}

          <div
            className={[
              'glass-card p-4 text-center text-sm font-medium',
              isMyTurn && active ? 'border-blue-400/30' : 'text-muted',
            ].join(' ')}
          >
            {isMyTurn && active && <CodewordsTeamBadge team={board.current_turn} />}{' '}
            {active ? turnStatusMessage() : `${teamLabel(board.winner ?? board.current_turn)} team wins`}
          </div>

          {board.current_clue_word && <CodewordsCurrentClueCard board={board} showGuessesRemaining={canGuess} />}

          {canGiveClue && (
            <div className="glass-card p-4 space-y-3">
              <p className="label-caps">Give a clue</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={clueWord}
                  onChange={(e) => setClueWord(e.target.value.replace(/\s/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === ' ') e.preventDefault()
                  }}
                  placeholder="One word (no spaces)"
                  className="input-field flex-1 min-w-[8rem]"
                  maxLength={40}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={clueNumberInput}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 1)
                    setClueNumberInput(next)
                  }}
                  placeholder="#"
                  className="input-field w-20"
                  aria-label="Clue number"
                />
              </div>
              <button
                type="button"
                onClick={submitClue}
                disabled={!clueWord.trim() || submittingClue || parseClueNumber(clueNumberInput) === null}
                className="btn-primary w-full"
              >
                {submittingClue ? 'Sending…' : 'Send clue'}
              </button>
            </div>
          )}

          <div className="glass-card p-4">
            <CodewordsBoardGrid
              board={board}
              showKey={showKey}
              guessable={!!canGuess}
              onGuess={guessCell}
              disabled={guessing}
              cellAttribution={cellAttribution}
            />
          </div>

          {canGuess && (
            <button type="button" onClick={endTurn} disabled={endingTurn} className="btn-secondary w-full">
              {endingTurn ? 'Ending…' : 'End turn early'}
            </button>
          )}
        </div>

        <aside className={['space-y-4', active ? 'lg:sticky lg:top-4 lg:self-start' : ''].join(' ')}>
          <CodewordsScoreboard board={board} players={players} roles={roles} highlightPlayerId={myPlayerId} />
          {gameOver && (
            <CodewordsFinalResultsShareBlock
              game={game}
              players={players}
              guesses={guesses}
              roles={roles}
              winnerLabel={
                board.winner
                  ? myRole.team === board.winner
                    ? 'Your team wins!'
                    : `${teamLabel(board.winner)} team wins!`
                  : 'Session ended'
              }
              highlightPlayerId={myPlayerId}
              winner={board.winner}
              showCreateNewGame={false}
              showBackHome={false}
            />
          )}
          {gameOver && (
            <CodewordsEndGameStats
              guesses={guesses}
              roles={roles}
              players={players}
              highlightPlayerId={myPlayerId}
              winner={board.winner}
            />
          )}
          {!gameOver && (
            <>
              {isOperative && (
                <CodewordsTeamChat
                  gameCode={gameCode}
                  playerId={myPlayerId}
                  team={myTeam}
                  players={players}
                  enabled={active}
                />
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
