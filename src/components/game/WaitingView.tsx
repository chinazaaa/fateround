'use client'

import React from 'react'
import { Avatar } from '@/components/Avatar'
import { ParticipantGallery } from '@/components/ParticipantGallery'
import { NameSearchPicker } from '@/components/NameSearchPicker'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { isWouldYouRather, isMostLikelyTo, isNeverHaveIEver, isWhoSaidThis } from '@/lib/game-types'
import { playerIdentityLabel } from '@/lib/participants'
import { wstVoteTargets } from '@/lib/who-said-this'
import type { Game, Participant, Player, WstQuotePoolEntry } from '@/types'
import type { PlayerQuestion } from '@/hooks/queries/usePlayerQuestions'
import type { UseMutationResult } from '@tanstack/react-query'
import { leaveButtonClassName } from '@/components/ui/LeaveGameButton'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'

interface WaitingViewProps {
  game: Game | null
  participants: Participant[]
  players: Player[]
  myPlayerId: string | null
  myPlayerName: string | null
  gameCode: string
  isWyrGame: boolean
  joinNeedsGender: boolean
  isNameOnlyJoin: boolean
  wstPool: WstQuotePoolEntry[]
  quoteInput: string
  setQuoteInput: (v: string) => void
  quoteAuthorParticipantId: string | null
  setQuoteAuthorParticipantId: (v: string | null) => void
  editingQuoteId: string | null
  setEditingQuoteId: (v: string | null) => void
  quoteSubmitting: boolean
  handleSubmitPoolQuote: () => void
  handleDeletePoolQuote: (quoteId: string) => void
  pqList: PlayerQuestion[]
  pqWyrA: string
  setPqWyrA: (v: string) => void
  pqWyrB: string
  setPqWyrB: (v: string) => void
  pqMltText: string
  setPqMltText: (v: string) => void
  pqSubmitting: boolean
  setPqSubmitting: (v: boolean) => void
  pqOpen: boolean
  setPqOpen: (v: boolean) => void
  submitPQ: UseMutationResult<unknown, Error, Record<string, unknown>>
  deletePQ: UseMutationResult<unknown, Error, { questionId: string; playerId: string }>
  photoInputRef: React.RefObject<HTMLInputElement | null>
  photoUploading: boolean
  setPhotoUploading: (v: boolean) => void
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  openEditJoin: () => void
  leaveGame: () => void
  joining: boolean
  toast: { error: (msg: string) => void }
}

export function WaitingView({
  game,
  participants,
  players,
  myPlayerId,
  myPlayerName,
  gameCode,
  isWyrGame,
  joinNeedsGender,
  isNameOnlyJoin,
  wstPool,
  quoteInput,
  setQuoteInput,
  quoteAuthorParticipantId,
  setQuoteAuthorParticipantId,
  editingQuoteId,
  setEditingQuoteId,
  quoteSubmitting,
  handleSubmitPoolQuote,
  handleDeletePoolQuote,
  pqList,
  pqWyrA,
  setPqWyrA,
  pqWyrB,
  setPqWyrB,
  pqMltText,
  setPqMltText,
  pqSubmitting,
  setPqSubmitting,
  pqOpen,
  setPqOpen,
  submitPQ,
  deletePQ,
  photoInputRef,
  photoUploading,
  setPhotoUploading,
  setParticipants,
  openEditJoin,
  leaveGame,
  joining,
  toast,
}: WaitingViewProps) {
  const isWst = isWhoSaidThis(game?.game_type)
  const wstTargets = isWst ? wstVoteTargets(participants) : []
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : null
  const myQuotes =
    isWst && myPlayerId
      ? wstPool.filter((e) => e.player_id === myPlayerId).sort((a, b) => a.created_at.localeCompare(b.created_at))
      : []
  const canSubmitPoolQuote = !!me?.participant_id
  const isPeopleMode = !isWouldYouRather(game?.game_type) && !isNeverHaveIEver(game?.game_type) && !isMostLikelyTo(game?.game_type) && !isWst
  const myParticipant = me?.participant_id ? participants.find((p) => p.id === me.participant_id) : null
  const canUploadPhoto = isPeopleMode && !!me?.participant_id

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !me?.participant_id || photoUploading) return
    e.target.value = ''

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Photo must be under 2MB')
      return
    }

    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('gameId', gameCode)
      fd.append('participantId', me.participant_id)
      fd.append('playerId', me.id)

      const res = await fetch('/api/photos', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to upload photo')
        return
      }
      const url = data.photoUrl + '?t=' + Date.now()
      setParticipants((prev) => prev.map((p) => (p.id === me.participant_id ? { ...p, photo_url: url } : p)))
    } catch {
      toast.error('Upload failed — try again')
    } finally {
      setPhotoUploading(false)
    }
  }

  const handlePhotoDelete = async () => {
    if (!me?.participant_id || photoUploading) return
    setPhotoUploading(true)
    try {
      const res = await fetch('/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          participantId: me.participant_id,
          playerId: me.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove photo')
        return
      }
      setParticipants((prev) => prev.map((p) => (p.id === me.participant_id ? { ...p, photo_url: null } : p)))
    } catch {
      toast.error('Could not remove photo — try again')
    } finally {
      setPhotoUploading(false)
    }
  }

  return (
    <CenteredCard>
      <PlayerNameBar name={myPlayerName} />
      <div className="text-center space-y-1">
        <div className="text-4xl">⏳</div>
        <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
        <GameTypeBadge gameType={game?.game_type} />
        <p className="text-muted">Waiting for the host to start...</p>
      </div>

      {isWst &&
        (game?.wst_quote_source === 'anime' ? (
          <div className="glass-card px-4 py-8 text-center space-y-2">
            <p className="text-body text-lg font-semibold">Anime Quote Mode</p>
            <p className="text-muted text-sm">The host is loading anime quotes — sit tight!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="surface-inset border border-theme rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-muted text-xs uppercase tracking-wider">Quote pool</p>
                <span className="text-sm font-bold text-body">{wstPool.length} submitted</span>
              </div>
              <p className="text-faint text-xs">
                Add as many quotes as you like — each one becomes a round. Pick who said each quote before the host
                starts.
              </p>
            </div>

            {canSubmitPoolQuote ? (
              <div className="glass-card p-5 space-y-4">
                {myQuotes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-faint text-[10px] uppercase tracking-wider">Your quotes ({myQuotes.length})</p>
                    {myQuotes.map((entry) => {
                      const authorName =
                        participants.find((p) => p.id === entry.author_participant_id)?.name ?? 'Unknown'
                      return (
                        <div key={entry.id} className="flex items-start gap-2 rounded-xl border border-theme px-3 py-2">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-sm text-body-muted line-clamp-2">&ldquo;{entry.quote_text}&rdquo;</p>
                            <p className="text-faint text-[10px]">— {authorName}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              className="text-faint hover:text-body text-xs px-1"
                              disabled={quoteSubmitting}
                              onClick={() => {
                                setEditingQuoteId(entry.id)
                                setQuoteInput(entry.quote_text)
                                setQuoteAuthorParticipantId(entry.author_participant_id)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-faint hover:text-red-400 text-xs px-1"
                              disabled={quoteSubmitting}
                              onClick={() => handleDeletePoolQuote(entry.id)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p className="font-semibold text-body text-center">
                  {editingQuoteId
                    ? 'Edit quote'
                    : myQuotes.length > 0
                      ? 'Add another quote'
                      : 'Add your quote to the pool'}
                </p>
                <textarea
                  value={quoteInput}
                  onChange={(e) => setQuoteInput(e.target.value)}
                  placeholder="e.g. Roses are red"
                  maxLength={500}
                  rows={3}
                  className="input-field resize-none"
                  disabled={quoteSubmitting}
                />
                <div className="space-y-2">
                  <p className="text-faint text-xs uppercase tracking-wider text-center">Who said this?</p>
                  <NameSearchPicker
                    options={wstTargets.map((p) => ({ id: p.id, name: p.name }))}
                    valueId={quoteAuthorParticipantId}
                    onChange={setQuoteAuthorParticipantId}
                    searchPlaceholder="Search names…"
                    emptyMessage="No names match"
                    disabled={quoteSubmitting}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSubmitPoolQuote}
                    disabled={!quoteInput.trim() || !quoteAuthorParticipantId || quoteSubmitting}
                    className={
                      quoteInput.trim() && quoteAuthorParticipantId
                        ? 'btn-primary w-full'
                        : 'btn-secondary w-full opacity-60 cursor-not-allowed'
                    }
                  >
                    {quoteSubmitting ? 'Saving…' : editingQuoteId ? 'Save changes' : 'Add to Pool →'}
                  </button>
                  {editingQuoteId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingQuoteId(null)
                        setQuoteInput('')
                        setQuoteAuthorParticipantId(null)
                      }}
                      className="btn-secondary text-sm w-full"
                      disabled={quoteSubmitting}
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-faint text-xs text-center">Claim your name when joining to submit a quote.</p>
            )}
          </div>
        ))}

      {canUploadPhoto && (
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handlePhotoUpload}
        />
      )}

      <div className="surface-inset border border-theme rounded-2xl p-4 space-y-2">
        <p className="text-muted text-xs uppercase tracking-wider">Players Joined ({players.length})</p>
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {players.map((p) => {
            const isMe = p.name === myPlayerName
            const myPart = isMe ? myParticipant : null
            const hasPhoto = isMe && !!myPart?.photo_url

            return (
              <div key={p.id} className="flex items-center gap-2">
                {isMe && canUploadPhoto ? (
                  photoUploading ? (
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : hasPhoto ? (
                    <div className="relative shrink-0">
                      <button type="button" onClick={() => photoInputRef.current?.click()} className="block">
                        <Avatar name={p.name} photoUrl={myPart!.photo_url} size="sm" />
                      </button>
                      <button
                        type="button"
                        onClick={handlePhotoDelete}
                        className="absolute -top-1 -right-1 w-4 h-4 min-w-[24px] min-h-[24px] flex items-center justify-center rounded-full bg-red-500/90 text-white text-[10px] leading-none hover:bg-red-400 transition-colors"
                        style={{ padding: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-[var(--surface-inset)] border border-dashed border-[var(--border-strong)] text-faint hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )
                ) : (
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${isMe ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'}`}
                  />
                )}
                <span
                  className={`text-sm flex-1 min-w-0 truncate ${isMe ? 'text-[var(--primary)] font-semibold' : 'text-body-muted'}`}
                >
                  {p.name}
                  {isMe ? ' (you)' : ''}
                </span>
                {!joinNeedsGender ? null : (
                  <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
                    {playerIdentityLabel(p, participants, game?.game_type)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {/* Player question submission for WYR / MLT */}
      {(isWyrGame || isNeverHaveIEver(game?.game_type) || isMostLikelyTo(game?.game_type)) && myPlayerId && (
        <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
          <button type="button" onClick={() => setPqOpen(!pqOpen)} className="w-full flex items-center justify-between">
            <p className="text-muted text-xs uppercase tracking-wider">
              Submit a Question {pqList.length > 0 ? `(${pqList.length})` : ''}
            </p>
            <span className="text-faint text-xs">{pqOpen ? '−' : '+'}</span>
          </button>
          {pqOpen && (
            <div className="space-y-3">
              {isWyrGame ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Option A"
                    value={pqWyrA}
                    onChange={(e) => setPqWyrA(e.target.value)}
                    maxLength={200}
                    className="input-field text-sm"
                    disabled={pqSubmitting}
                  />
                  <input
                    type="text"
                    placeholder="Option B"
                    value={pqWyrB}
                    onChange={(e) => setPqWyrB(e.target.value)}
                    maxLength={200}
                    className="input-field text-sm"
                    disabled={pqSubmitting}
                  />
                  <button
                    type="button"
                    disabled={!pqWyrA.trim() || !pqWyrB.trim() || pqSubmitting}
                    onClick={() => {
                      setPqSubmitting(true)
                      submitPQ.mutate(
                        {
                          gameId: gameCode,
                          playerId: myPlayerId,
                          questionType: 'wyr',
                          optionA: pqWyrA.trim(),
                          optionB: pqWyrB.trim(),
                        },
                        {
                          onSuccess: () => {
                            setPqWyrA('')
                            setPqWyrB('')
                          },
                          onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to submit'),
                          onSettled: () => setPqSubmitting(false),
                        }
                      )
                    }}
                    className={
                      pqWyrA.trim() && pqWyrB.trim()
                        ? 'btn-primary text-sm w-full'
                        : 'btn-secondary text-sm w-full opacity-60 cursor-not-allowed'
                    }
                  >
                    {pqSubmitting ? 'Submitting...' : 'Add Question'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Most likely to..."
                    value={pqMltText}
                    onChange={(e) => setPqMltText(e.target.value)}
                    maxLength={200}
                    className="input-field text-sm"
                    disabled={pqSubmitting}
                  />
                  <button
                    type="button"
                    disabled={!pqMltText.trim() || pqSubmitting}
                    onClick={() => {
                      setPqSubmitting(true)
                      submitPQ.mutate(
                        {
                          gameId: gameCode,
                          playerId: myPlayerId,
                          questionType: 'mlt',
                          questionText: pqMltText.trim(),
                        },
                        {
                          onSuccess: () => setPqMltText(''),
                          onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to submit'),
                          onSettled: () => setPqSubmitting(false),
                        }
                      )
                    }}
                    className={
                      pqMltText.trim()
                        ? 'btn-primary text-sm w-full'
                        : 'btn-secondary text-sm w-full opacity-60 cursor-not-allowed'
                    }
                  >
                    {pqSubmitting ? 'Submitting...' : 'Add Question'}
                  </button>
                </div>
              )}
              {pqList.filter((q) => q.player_id === myPlayerId).length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-theme">
                  <p className="text-faint text-[10px] uppercase tracking-wider">Your questions</p>
                  {pqList
                    .filter((q) => q.player_id === myPlayerId)
                    .map((q) => (
                      <div key={q.id} className="flex items-start gap-2 text-sm">
                        <span className="flex-1 min-w-0 text-body-muted">
                          {q.question_type === 'wyr' ? `${q.option_a} vs ${q.option_b}` : q.question_text}
                        </span>
                        <button
                          type="button"
                          className="text-faint hover:text-red-400 text-xs shrink-0"
                          onClick={() => deletePQ.mutate({ questionId: q.id, playerId: myPlayerId! })}
                        >
                          x
                        </button>
                      </div>
                    ))}
                </div>
              )}
              {pqList.length > 0 && (
                <p className="text-faint text-[10px] text-center">
                  {pqList.length} question{pqList.length === 1 ? '' : 's'} submitted by all players
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Participant gallery for games with photo cards */}
      {participants.length > 0 && !isWyrGame && !isNeverHaveIEver(game?.game_type) && !isMostLikelyTo(game?.game_type) && !isWst && (
        <ParticipantGallery participants={participants} />
      )}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={openEditJoin} className="btn-secondary text-sm py-2.5">
          {isNameOnlyJoin || !joinNeedsGender ? 'Change name' : 'Change name or gender'}
        </button>
        <button
          type="button"
          onClick={leaveGame}
          disabled={joining}
          className={leaveButtonClassName}
        >
          Leave game
        </button>
      </div>
      <div className="flex flex-col items-center gap-2">
        <WhatsAppChannelLink />
        <p className="text-faint text-xs text-center">Keep this tab open</p>
      </div>
    </CenteredCard>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wrap flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm glass-card-strong p-6 space-y-6">{children}</div>
    </div>
  )
}

function PlayerNameBar({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/8 mb-4">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-faint leading-none">Playing as</p>
        <p className="text-sm font-semibold truncate">{name}</p>
      </div>
    </div>
  )
}
