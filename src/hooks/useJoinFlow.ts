'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
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
  } = deps
  const toast = useToast()
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const [nameInput, setNameInput] = useState(initialName ?? '')
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
  const [joinIdentityGender, setJoinIdentityGender] = useState<ParticipantGender>('female')
  const [voteBothGenders, setVoteBothGenders] = useState(false)
  const [joining, setJoining] = useState(false)
  const [editingJoin, setEditingJoin] = useState(false)
  const joinGenderTouchedRef = useRef(false)

  useRoomMemberNamePrefill(roomDisplayName, nameInput, setNameInput)

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
        game?.status === 'active'
          ? gameOffersLateJoinChoice(gameType)
            ? { joinAsViewer }
            : allowLatePlayers(game!)
              ? {}
              : { joinAsViewer: true }
          : {}

      const res = await fetch('/api/players', {
        method: editingJoin && myPlayerId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingJoin && myPlayerId
            ? { ...body, playerId: myPlayerId }
            : { ...body, ...activeJoinExtras, ...joinExtras }
        ),
      })
      const data = await res.json()
      if (data.playerId) {
        const [{ data: plrs }, { data: parts }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
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

  return {
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
