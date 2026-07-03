'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { currentTournamentPlayerToken } from '@/lib/tournament-player-token'
import { parseGameType, isNameOnlyPlayerJoin } from '@/lib/game-types'
import {
  genderLabel,
  parsePlayerGenderFromDb,
  parseParticipantGenderFromDb,
  playerGenderFromJoin,
  playerVoteGenderForRound,
} from '@/lib/participants'
import { isImportClaimMode, isVoterOnlyMode } from '@/lib/participant-mode'
import { isGameGenderBased } from '@/lib/gender-based'
import { gameOffersLateJoinChoice, allowLatePlayers } from '@/lib/viewers'
import { unlockAudio } from '@/lib/sounds'
import { PLAYER_SELECT } from '@/lib/supabase-selects'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { useToast } from '@/components/ui/Toast'
import type { Game, Participant, Player, Round, ParticipantGender, PlayerGender } from '@/types'

import type { View } from '@/hooks/useGameSession'

export interface JoinFlowDeps {
  gameCode: string
  game: Game | null
  players: Player[]
  participants: Participant[]
  myPlayerId: string | null
  myPlayerName: string | null
  view: View
  setView: (v: View) => void
  setMyPlayerId: (id: string | null) => void
  setMyPlayerName: (name: string | null) => void
  setMyPlayerGender: (g: PlayerGender | null) => void
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  applyActiveRound: (round: Round) => void
  initialName?: string
  /** When true, the initialName auto-join joins as a viewer (spectator) — used by
   *  tournament "Watch live" links so people can follow a game without playing. */
  autoJoinAsViewer?: boolean
}

export function useJoinFlow(deps: JoinFlowDeps) {
  const {
    gameCode,
    game,
    players,
    participants,
    myPlayerId,
    myPlayerName,
    view,
    setView,
    setMyPlayerId,
    setMyPlayerName,
    setMyPlayerGender,
    setPlayers,
    setParticipants,
    applyActiveRound,
    initialName,
    autoJoinAsViewer,
  } = deps
  const toast = useToast()
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  // Tournament rooms are reached via a ?tournament= link; the player's secret token
  // (saved at tournament join) rides along so the server can seat/reclaim only them.
  const tournamentToken = currentTournamentPlayerToken()

  const [nameInput, setNameInput] = useState(initialName ?? '')
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
  const [joinIdentityGender, setJoinIdentityGender] = useState<ParticipantGender>('female')
  const [voteBothGenders, setVoteBothGenders] = useState(false)
  const [joining, setJoining] = useState(false)
  const [editingJoin, setEditingJoin] = useState(false)
  // Set once the name-based auto-join has been attempted (success or failure), so
  // a stuck/failed auto-join falls back to showing the join form.
  const [nameAutoJoinDone, setNameAutoJoinDone] = useState(false)
  const joinGenderTouchedRef = useRef(false)

  useRoomMemberNamePrefill(roomDisplayName, nameInput, setNameInput)

  // `initialName` (from tournament links) is resolved client-side, so on the first
  // render it can be empty while `nameInput` was seeded from that empty value. Sync
  // it in once it's available so the name-based auto-join isn't blocked by an empty
  // field — otherwise the player has to re-open the link for the join to fire.
  const initialNameSyncedRef = useRef(false)
  useEffect(() => {
    if (initialNameSyncedRef.current) return
    if (initialName?.trim() && !nameInput.trim() && !myPlayerId && !editingJoin) {
      initialNameSyncedRef.current = true
      setNameInput(initialName)
    }
  }, [initialName, nameInput, myPlayerId, editingJoin])

  const isJoinersMode = game?.participant_mode === 'joiners'
  const isVoterOnly = game ? isVoterOnlyMode(game) : false
  const isImportClaim = game ? isImportClaimMode(game) : false
  const isNameOnlyJoin = isNameOnlyPlayerJoin(game?.game_type)
  const joinNeedsGender = game ? isGameGenderBased(game) : false
  const useFreeNameJoin = isJoinersMode || isVoterOnly
  const joinPlayerGender: PlayerGender =
    isNameOnlyJoin || !joinNeedsGender ? 'both' : playerGenderFromJoin(joinIdentityGender, voteBothGenders)
  const canSubmitJoin = useFreeNameJoin ? nameInput.trim().length > 0 : selectedParticipantId !== null

  const setJoinIdentity = (gender: ParticipantGender) => {
    joinGenderTouchedRef.current = true
    setJoinIdentityGender(gender)
  }

  const namePickerOptions = useMemo(() => {
    if (isJoinersMode || isVoterOnly) return []
    const claimedParticipantIds = new Set(
      players.filter((p) => p.id !== myPlayerId && p.participant_id).map((p) => p.participant_id as string)
    )
    const takenNames = new Set(players.filter((p) => p.id !== myPlayerId).map((p) => p.name.toLowerCase()))
    return participants
      .filter((p) => !claimedParticipantIds.has(p.id) && !takenNames.has(p.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((p) => ({
        id: p.id,
        name: p.name,
        ...(joinNeedsGender ? { subtitle: genderLabel(p.gender) } : {}),
      }))
  }, [isJoinersMode, isVoterOnly, participants, players, myPlayerId, joinNeedsGender])

  const handleSelectParticipant = (id: string, name: string) => {
    const changed = id !== selectedParticipantId
    setSelectedParticipantId(id)
    setNameInput(name)
    const p = participants.find((x) => x.id === id)
    if (p && !isJoinersMode && changed && !joinGenderTouchedRef.current) {
      setJoinIdentityGender(p.gender)
      setVoteBothGenders(false)
    }
  }

  // If someone else claims this name while you're still on the join screen, clear your pick
  useEffect(() => {
    if (useFreeNameJoin || view !== 'join' || !selectedParticipantId) return
    const stillAvailable = namePickerOptions.some((o) => o.id === selectedParticipantId)
    if (!stillAvailable) {
      setSelectedParticipantId(null)
      setNameInput('')
      joinGenderTouchedRef.current = false
    }
  }, [namePickerOptions, selectedParticipantId, useFreeNameJoin, view])

  // Match room display name to a host-imported participant when joining from a game room.
  useEffect(() => {
    if (!roomDisplayName || useFreeNameJoin || view !== 'join' || editingJoin) return
    const match = namePickerOptions.find((o) => o.name.toLowerCase() === roomDisplayName.toLowerCase())
    if (!match || selectedParticipantId === match.id) return
    handleSelectParticipant(match.id, match.name)
  }, [roomDisplayName, useFreeNameJoin, view, editingJoin, namePickerOptions, selectedParticipantId])

  const joinGame = async (joinAsViewer?: boolean, nameOverride?: string) => {
    if (joining) return
    const resolvedName = (nameOverride ?? nameInput).trim()
    if (useFreeNameJoin ? !resolvedName : !selectedParticipantId) return
    unlockAudio()
    setJoining(true)
    try {
      const body =
        isNameOnlyJoin || ((isJoinersMode || isVoterOnly) && !joinNeedsGender)
          ? { gameCode, playerName: resolvedName }
          : !joinNeedsGender && isImportClaim
            ? { gameCode, participantId: selectedParticipantId! }
            : isJoinersMode || isVoterOnly
              ? {
                  gameCode,
                  playerName: resolvedName,
                  gender: joinPlayerGender,
                  identityGender: joinIdentityGender,
                  ...(voteBothGenders ? { pollGender: joinIdentityGender } : {}),
                }
              : {
                  gameCode,
                  gender: joinPlayerGender,
                  identityGender: joinIdentityGender,
                  participantId: selectedParticipantId!,
                }

      const gameType = parseGameType(game?.game_type)
      const activeJoinExtras =
        // An explicit viewer join must mark spectator even before the game is active
        // (tournament watchers arrive while the game is still in the lobby).
        joinAsViewer === true
          ? { joinAsViewer: true }
          : game?.status === 'active'
            ? gameOffersLateJoinChoice(gameType)
              ? { joinAsViewer }
              : allowLatePlayers(game!)
                ? {}
                : { joinAsViewer: true }
            : {}

      const isSelfEdit = Boolean(editingJoin && myPlayerId)
      let editResumeToken: string | null = null
      if (isSelfEdit) {
        editResumeToken = getPlayerSession(gameCode)?.resumeToken ?? null
        if (!editResumeToken) {
          toast.error('Your player session expired — rejoin to continue')
          return
        }
      }

      const res = await fetch('/api/players', {
        method: isSelfEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isSelfEdit
            ? { ...body, playerId: myPlayerId, resumeToken: editResumeToken }
            : { ...body, ...activeJoinExtras, ...joinExtras, ...(tournamentToken ? { tournamentToken } : {}) }
        ),
      })
      const data = await res.json()
      if (data.playerId) {
        const [{ data: plrs }, { data: parts }] = await Promise.all([
          supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
          supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        ])
        setPlayers(plrs || [])
        setParticipants(parts || [])
        const me = plrs?.find((p) => p.id === data.playerId)
        const voteGender = me ? playerVoteGenderForRound(me, parts || []) : parsePlayerGenderFromDb(data.playerGender)
        if (voteGender) {
          setPlayerSession(gameCode, data.playerId, data.playerName, voteGender, data.resumeToken)
          setMyPlayerGender(voteGender)
        }
        setMyPlayerId(data.playerId)
        setMyPlayerName(data.playerName)
        setEditingJoin(false)
        if (game?.status === 'active') {
          const { data: activeRound } = await supabase
            .from('rounds')
            .select('*')
            .eq('game_id', gameCode)
            .eq('status', 'active')
            .maybeSingle()
          if (activeRound) {
            applyActiveRound(activeRound)
          } else {
            setView('waiting')
          }
        } else {
          setView('waiting')
        }
      } else {
        const msg = data.error ?? 'Failed to join'
        toast.error(msg.toLowerCase().includes('taken') ? 'That name was just taken — pick another' : msg)
      }
    } finally {
      setJoining(false)
    }
  }

  const openEditJoin = () => {
    const me = players.find((p) => p.id === myPlayerId)
    const votePref = me
      ? parsePlayerGenderFromDb(me.gender)
      : parsePlayerGenderFromDb(getPlayerSession(gameCode)?.playerGender ?? '')
    const voteBoth = votePref === 'both'
    setNameInput(myPlayerName ?? '')
    const part =
      participants.find((p) => p.id === me?.participant_id) ?? participants.find((p) => p.name === myPlayerName)
    setSelectedParticipantId(part?.id ?? null)
    setJoinIdentityGender(
      me?.identity_gender ? (parseParticipantGenderFromDb(me.identity_gender) ?? 'female') : (part?.gender ?? 'female')
    )
    setVoteBothGenders(voteBoth)
    joinGenderTouchedRef.current = true
    setEditingJoin(true)
    setView('join')
  }

  const cancelEditJoin = () => {
    setEditingJoin(false)
    if (myPlayerId) setView('waiting')
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName(null)
    setMyPlayerGender(null)
    setNameInput('')
    setSelectedParticipantId(null)
    setJoinIdentityGender('female')
    setVoteBothGenders(false)
    joinGenderTouchedRef.current = false
    setEditingJoin(false)
    setView('join')
  }

  const handlePlayerRenamed = (name: string) => {
    setMyPlayerName(name)
    const existing = getPlayerSession(gameCode)
    if (existing)
      setPlayerSession(gameCode, existing.playerId, name, existing.playerGender ?? 'both', existing.resumeToken)
  }

  function resetJoinState() {
    setNameInput('')
    setSelectedParticipantId(null)
    setJoinIdentityGender('female')
    setVoteBothGenders(false)
    setJoining(false)
    setEditingJoin(false)
    joinGenderTouchedRef.current = false
  }

  useRoomMemberAutoJoin({
    gameCode,
    enabled: useFreeNameJoin && !editingJoin,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen: view,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (roomName) => joinGame(undefined, roomName),
  })

  const participantAutoJoinRef = useRef(false)
  useEffect(() => {
    if (
      participantAutoJoinRef.current ||
      !roomDisplayName ||
      useFreeNameJoin ||
      joinNeedsGender ||
      view !== 'join' ||
      game?.status !== 'waiting' ||
      myPlayerId ||
      joining ||
      editingJoin ||
      resolvingRoomMember ||
      !selectedParticipantId
    ) {
      return
    }
    const match = namePickerOptions.find((o) => o.id === selectedParticipantId)
    if (!match || match.name.toLowerCase() !== roomDisplayName.toLowerCase()) return
    participantAutoJoinRef.current = true
    void joinGame()
  }, [
    roomDisplayName,
    useFreeNameJoin,
    joinNeedsGender,
    view,
    game?.status,
    myPlayerId,
    joining,
    editingJoin,
    resolvingRoomMember,
    selectedParticipantId,
    namePickerOptions,
  ])

  useEffect(() => {
    if (view !== 'join') participantAutoJoinRef.current = false
  }, [view])

  // Auto-join when arriving with a name already chosen (e.g. from a tournament
  // lobby's "Join Game" link) so the player isn't asked to re-enter it — including
  // when they arrive after the host already started the game. joinGame() still
  // honors the late-join policy (it joins as a viewer when late play isn't allowed),
  // so this doesn't force player-join where it shouldn't. The ?name= param is only
  // produced by the tournament flow, so this never affects ordinary share links.
  const nameAutoJoinRef = useRef(false)
  useEffect(() => {
    if (
      nameAutoJoinRef.current ||
      !initialName?.trim() ||
      !useFreeNameJoin ||
      joinNeedsGender ||
      view !== 'join' ||
      !game ||
      myPlayerId ||
      joining ||
      editingJoin ||
      !nameInput.trim()
    ) {
      return
    }
    nameAutoJoinRef.current = true
    void joinGame(autoJoinAsViewer === true).finally(() => setNameAutoJoinDone(true))
  }, [
    initialName,
    autoJoinAsViewer,
    useFreeNameJoin,
    joinNeedsGender,
    view,
    game,
    myPlayerId,
    joining,
    editingJoin,
    nameInput,
  ])

  // True while a tournament auto-join is expected but hasn't resolved — the caller
  // shows a "joining…" state instead of the name form to avoid a flash of the join
  // screen. Holds while the game is still loading, then (once loaded) only for a
  // free-name game until the attempt finishes — so a non-free-name game or a failed
  // join falls back to the form rather than hanging on the loader.
  const wantsAutoJoin = Boolean(initialName?.trim()) && !editingJoin && !myPlayerId && !nameAutoJoinDone
  const autoJoinPending = wantsAutoJoin && (!game || (useFreeNameJoin && !joinNeedsGender))

  // Safety net: never strand the caller on the "joining…" loader if the auto-join
  // can't complete (e.g. the name is taken) — reveal the normal UI after a beat.
  useEffect(() => {
    if (nameAutoJoinDone || !initialName?.trim()) return
    const t = setTimeout(() => setNameAutoJoinDone(true), 5000)
    return () => clearTimeout(t)
  }, [nameAutoJoinDone, initialName])

  return {
    autoJoinPending,
    nameInput,
    selectedParticipantId,
    joinIdentityGender,
    voteBothGenders,
    joining,
    editingJoin,
    canSubmitJoin,
    useFreeNameJoin,
    joinPlayerGender,
    namePickerOptions,
    joinNeedsGender,
    setNameInput,
    setJoinIdentityGender: setJoinIdentity,
    setVoteBothGenders,
    joinGame,
    openEditJoin,
    cancelEditJoin,
    handlePlayerLeft,
    handlePlayerRenamed,
    handleSelectParticipant,
    resetJoinState,
    resolvingRoomMember,
  }
}

export type JoinFlowState = ReturnType<typeof useJoinFlow>
