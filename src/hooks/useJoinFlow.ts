'use client'

import { hostHref, takeOverHosting } from '@/lib/take-over-hosting'
import { useState, useRef, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { getRememberedName, rememberName, subscribeLocalIdentity } from '@/lib/identity-local'
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
import { PARTICIPANT_SELECT, PLAYER_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { useToast } from '@/components/ui/Toast'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'
import { authHeaders } from '@/lib/auth-headers'
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
  const {
    displayName: roomDisplayName,
    joinExtras,
    resolving: resolvingRoomMember,
    memberCode: roomMemberCode,
  } = useRoomMemberJoin(gameCode)
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
  // True while `nameInput` holds a name we prefilled from this device's remembered
  // identity rather than one the player typed or a link supplied. A remembered name
  // is the weakest source, so anything more specific is allowed to overwrite it —
  // without this flag the prefill would block a late-resolving tournament name and
  // the player would auto-join under the wrong one.
  const nameFromRememberedRef = useRef(false)
  useEffect(() => {
    if (initialNameSyncedRef.current) return
    if (initialName?.trim() && (!nameInput.trim() || nameFromRememberedRef.current) && !myPlayerId && !editingJoin) {
      initialNameSyncedRef.current = true
      nameFromRememberedRef.current = false
      setTimeout(() => setNameInput(initialName), 0)
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

  // Prefill the name this device used last time, so a returning player doesn't retype
  // it in every game they ever join (see `docs/accounts-and-identity-plan.md` §5, Slice 1).
  // Weakest source by design — it only fires into an empty field, and only when no room
  // or tournament link is supplying a name of its own. Skipped entirely when a room member
  // code is present because that name resolves asynchronously and must win.
  const rememberedNamePrefillRef = useRef(false)
  // A signed-in player's name is written by `useProfile` after its fetch resolves, which is
  // later than this effect's first run — none of its other deps change when that happens, so
  // without this it would never look again and the field would stay empty all visit.
  const [identityTick, setIdentityTick] = useState(0)
  useEffect(() => subscribeLocalIdentity(() => setIdentityTick((n) => n + 1)), [])
  useEffect(() => {
    if (rememberedNamePrefillRef.current) return
    if (!game || !useFreeNameJoin || view !== 'join') return
    if (myPlayerId || editingJoin || nameInput.trim()) return
    if (roomMemberCode || initialName?.trim()) return
    const remembered = getRememberedName()
    if (!remembered) return
    rememberedNamePrefillRef.current = true
    nameFromRememberedRef.current = true
    setTimeout(() => setNameInput(remembered), 0)
  }, [game, useFreeNameJoin, view, myPlayerId, editingJoin, nameInput, roomMemberCode, initialName, identityTick])

  // Once the player edits the field themselves it's their name, not a prefill, so a
  // late-arriving tournament name must no longer overwrite it.
  const handleSetNameInput = (value: string) => {
    nameFromRememberedRef.current = false
    setNameInput(value)
  }

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
      setTimeout(() => {
        setSelectedParticipantId(null)
        setNameInput('')
      }, 0)
      joinGenderTouchedRef.current = false
    }
  }, [namePickerOptions, selectedParticipantId, useFreeNameJoin, view])

  // Match room display name to a host-imported participant when joining from a game room.
  useEffect(() => {
    if (!roomDisplayName || useFreeNameJoin || view !== 'join' || editingJoin) return
    const match = namePickerOptions.find((o) => o.name.toLowerCase() === roomDisplayName.toLowerCase())
    if (!match || selectedParticipantId === match.id) return
    setTimeout(() => handleSelectParticipant(match.id, match.name), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // If this device already holds a seat here (a racing auto-join, a reconnect, a second
      // tab), send its resume token so the server reclaims THAT row — role and all — instead
      // of cutting a fresh one. On an active game a fresh row defaults to spectator, which is
      // how a real player gets silently demoted to a viewer. Mirrors useGameViewBootstrap.
      // Only a genuine "seat me" POST carries it: identity edits go through the isSelfEdit
      // PATCH above, and leaving clears the session (so a deliberate rejoin still gets a new row).
      const existingToken = isSelfEdit ? null : (getPlayerSession(gameCode)?.resumeToken ?? null)

      const doJoin = async (continueOnThisDevice: boolean) =>
        fetch('/api/players', {
          method: isSelfEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify(
            isSelfEdit
              ? { ...body, playerId: myPlayerId, resumeToken: editResumeToken }
              : {
                  ...body,
                  ...activeJoinExtras,
                  ...joinExtras,
                  ...(tournamentToken ? { tournamentToken } : {}),
                  ...(existingToken ? { resumeToken: existingToken } : {}),
                  ...(continueOnThisDevice ? { continueOnThisDevice: true } : {}),
                }
          ),
        })
      let res = await doJoin(false)
      let data = await res.json()
      if (
        !isSelfEdit &&
        res.status === 409 &&
        (data?.reason === 'already_hosting' || data?.reason === 'already_joined')
      ) {
        // Hosting is a different offer from continuing a seat: retrying the join would seat
        // the host as an ordinary PLAYER and leave hosting on the other device. Move it.
        if (data.reason === 'already_hosting') {
          const takeOver =
            typeof window !== 'undefined' &&
            window.confirm('You’re hosting this game on another device. Take over hosting on this device?')
          if (!takeOver) return
          const token = await takeOverHosting(gameCode)
          if (token) {
            window.location.href = hostHref(gameCode)
            return
          }
          // Handoff unavailable (a failed request, or the profile no longer owns this game).
          // STOP here rather than falling through: the next branch says "you're already a
          // player on another device", which is false for a host, and confirming it would
          // seat them as an ordinary player in the game they are running.
          toast.error('Could not take over hosting on this device — try again')
          return
        }
        const message = `You’re already a player in this game on another device${
          data.existingPlayerName ? ` (as ${data.existingPlayerName})` : ''
        }. Continue on this device, or keep it on the other one?`
        const proceed = typeof window !== 'undefined' && window.confirm(message)
        if (!proceed) return
        res = await doJoin(true)
        data = await res.json()
      }
      if (data.playerId) {
        // Remember the name for next time. Uses the name that went in, not `data.playerName`,
        // because anonymous games hand back a server-generated alias that isn't the player's.
        // Only free-name modes qualify — a claimed participant name comes from the host's
        // import list, not from the player telling us who they are.
        if (useFreeNameJoin) rememberName(resolvedName)
        // GA key event: a player joined a game via code/link (viral conversion).
        // Only a real join (POST) counts — skip name edits (PATCH / isSelfEdit).
        if (!isSelfEdit) trackEvent(GA_EVENTS.joinGame)
        const [{ data: plrs }, { data: parts }] = await Promise.all([
          supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
          supabase.from('participants').select(PARTICIPANT_SELECT).eq('game_id', gameCode).order('display_order'),
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
            .select(ROUND_SELECT)
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
    if (useFreeNameJoin) rememberName(name)
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
    setTimeout(() => void joinGame(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setNameInput: handleSetNameInput,
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
