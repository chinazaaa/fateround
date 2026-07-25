import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { GameType } from '@fateround/shared'
import { isCrosswordGame, isWordSearchGame, isWordScrambleGame } from '@fateround/shared/game-type-checks'
import { isWhoSaidThis } from '@fateround/shared/poll-games'
import { isLandmineGame } from '@fateround/shared/game-type-checks'
import { GameTypePickerField } from '@/components/create/GameTypePickerField'
import { LandmineCreatePanel } from '@/components/create/LandmineCreatePanel'
import { ParticipantListEditor } from '@/components/create/ParticipantListEditor'
import { StepIndicator } from '@/components/create/StepIndicator'
import { UniversalLobbyFields } from '@/components/create/UniversalLobbyFields'
import { GameRoomSettingsPanel } from '@/components/create/GameRoomSettingsPanel'
import { PartyRoomSettingsPanel } from '@/components/create/PartyRoomSettingsPanel'
import { CustomContentPanel } from '@/components/create/CustomContentPanel'
import { CustomSlotBuilderPanel } from '@/components/create/CustomSlotBuilderPanel'
import { PlayerModePanel } from '@/components/create/PlayerModePanel'
import { WhoSaidThisCreatePanel } from '@/components/create/WhoSaidThisCreatePanel'
import { TemplateQuickStart, SaveTemplateButton } from '@/components/create/TemplatesSection'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { FormField } from '@/components/ui/FormField'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { useToast } from '@/components/ui/Toast'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGamePlayerLimits } from '@/hooks/useGamePlayerLimits'
import {
  applyGameTypeChange,
  buildCreatePayload,
  createInitialState,
  needsParticipantStep,
  templatableGame,
  validateCreateState,
  validateSetupStep,
  wizardStepsForGame,
  type CreateWizardState,
  type CreateWizardStep,
} from '@/lib/create-settings'
import { createGame } from '@/lib/game-api'
import { WEB_BASE_URL } from '@/lib/config'
import { getTemplates, saveTemplate, deleteTemplate, type GameTemplate, type TemplateSlots } from '@/lib/game-templates'
import { NATIVE_CREATABLE_GAMES } from '@/lib/native-create'
import { setHostToken } from '@/lib/secure-session'

const STEP_LABELS: Record<CreateWizardStep, string> = {
  setup: 'Setup',
  people: 'People',
}

export function CreateWizardShell() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const toast = useToast()
  const { limits } = useGamePlayerLimits()
  const [state, setState] = useState<CreateWizardState>(() =>
    createInitialState(NATIVE_CREATABLE_GAMES[0] ?? 'trivia', limits)
  )
  const [step, setStep] = useState<CreateWizardStep>('setup')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Save-as-template quick start (see lib/game-templates.ts, PR #681 web parity). Slots are
  // re-fetched whenever the game type changes — each game type has its own independent A/B slots.
  const [templateSlots, setTemplateSlots] = useState<TemplateSlots | null>(null)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveModalPresetSlot, setSaveModalPresetSlot] = useState<number | null>(null)
  // Set by a template's "Use & create": applies the template's values, then this effect fires
  // once those commit so createGame's closure sees the applied state rather than what was on
  // screen before.
  const [pendingAutoCreate, setPendingAutoCreate] = useState(false)

  const steps = useMemo(() => wizardStepsForGame(state), [state])
  const stepIndex = step === 'people' ? 1 : 0
  const showPeopleStep = needsParticipantStep(state)

  const patchState = (patch: Partial<CreateWizardState>) => {
    setState((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  // Player-facing content label, asked directly under a "Your own" CSV upload (for a Library
  // pack we auto-fill from the pack name instead). Rendered by the custom-content + WST paths.
  const categoryField = (
    <FormField
      label="Category"
      hint="What is this CSV theme? Shown to players before they join."
      value={state.contentLabel}
      onChangeText={(contentLabel) => patchState({ contentLabel })}
      placeholder="Maths, Countries, Mixed"
      maxLength={40}
      autoCapitalize="sentences"
      autoCorrect={false}
    />
  )

  const onGameTypeChange = (gameType: GameType) => {
    setState((prev) => applyGameTypeChange(prev, gameType, limits))
    setStep('setup')
    setError(null)
  }

  // Hydrate saved templates whenever the game type changes — each game type has its own
  // independent set of slots (see lib/game-templates.ts).
  useEffect(() => {
    let cancelled = false
    void getTemplates(state.gameType).then((slots) => {
      if (!cancelled) setTemplateSlots(slots)
    })
    return () => {
      cancelled = true
    }
  }, [state.gameType])

  const refreshTemplateSlots = () => {
    void getTemplates(state.gameType).then(setTemplateSlots)
  }

  const applyTemplateValues = (tpl: GameTemplate) => {
    setState((prev) => ({
      ...prev,
      theme: tpl.values.theme,
      isPublic: tpl.values.isPublic,
      maxPlayers: tpl.values.maxPlayers,
      lateJoinPolicy: tpl.values.lateJoinPolicy,
      room: { ...prev.room, ...tpl.values.room },
      party: { ...prev.party, ...tpl.values.party },
      landmine: { ...prev.landmine, ...tpl.values.landmine },
    }))
  }

  const handlePrefillTemplate = (tpl: GameTemplate) => {
    applyTemplateValues(tpl)
    toast.show(`Prefilled from "${tpl.name}" — review below, then Create when ready`)
  }

  // "Use & create" skips straight to creating a game (confirmed first, see
  // TemplateQuickStart's own confirm dialog) — applies the template, then waits for that state
  // update to commit (see pendingAutoCreate effect below) before firing the normal create flow.
  const runUseTemplate = (tpl: GameTemplate) => {
    if (!state.title.trim()) setState((prev) => ({ ...prev, title: tpl.name }))
    applyTemplateValues(tpl)
    setPendingAutoCreate(true)
  }

  const openSaveTemplateModal = (presetSlot: number | null = null) => {
    setSaveModalPresetSlot(presetSlot)
    setSaveModalOpen(true)
  }

  const confirmSaveTemplate = (slot: number, name: string) => {
    void saveTemplate(state.gameType, slot, {
      name,
      savedAt: Date.now(),
      values: {
        theme: state.theme,
        isPublic: state.isPublic,
        maxPlayers: state.maxPlayers,
        lateJoinPolicy: state.lateJoinPolicy,
        room: state.room,
        party: state.party,
        landmine: state.landmine,
      },
    }).then(() => {
      refreshTemplateSlots()
      toast.success(`Saved as "${name}"`)
    })
  }

  const handleDeleteTemplate = (slot: number) => {
    const name = templateSlots?.[slot]?.name
    void deleteTemplate(state.gameType, slot).then(() => {
      refreshTemplateSlots()
      toast.show(name ? `Deleted "${name}"` : 'Template deleted')
    })
  }

  const runCreateGame = async () => {
    const validationError = validateCreateState(state)
    if (validationError) {
      setError(validationError)
      return
    }

    setCreating(true)
    setError(null)
    try {
      const payload = buildCreatePayload(state, limits)
      const { gameCode, hostToken } = await createGame(payload)
      await setHostToken(gameCode, hostToken)
      router.replace(`/host/${gameCode}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create game')
    } finally {
      setCreating(false)
    }
  }

  const onPrimary = async () => {
    if (step === 'setup' && showPeopleStep) {
      const setupError = validateSetupStep(state)
      if (setupError) {
        setError(setupError)
        return
      }
      setStep('people')
      return
    }

    await runCreateGame()
  }

  // Fires once a template's applied values have committed to state (see pendingAutoCreate
  // above), then runs the normal create flow.
  useEffect(() => {
    if (!pendingAutoCreate) return
    setPendingAutoCreate(false)
    void runCreateGame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoCreate])

  const primaryLabel = step === 'setup' && showPeopleStep ? 'Next: People' : creating ? 'Creating…' : 'Create & host'

  const primaryDisabled = creating || (step === 'setup' && !state.title.trim())

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AmbientBackground />
      <KeyboardFormScreen
        contentContainerStyle={styles.container}
        footer={
          <View style={styles.footer}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              label={primaryLabel}
              onPress={() => void onPrimary()}
              loading={creating}
              disabled={primaryDisabled}
            />
          </View>
        }
      >
        <Pressable
          style={styles.back}
          onPress={() => {
            if (step === 'people') {
              setStep('setup')
              return
            }
            if (router.canGoBack()) router.back()
            else router.replace('/')
          }}
        >
          <Text style={styles.backText}>{step === 'people' ? '← Setup' : '← Home'}</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Host a room</Text>
          <Text style={styles.heading}>Create a game</Text>
          <Text style={styles.subtitle}>Title, lobby settings, then share the code when you're ready.</Text>
        </View>

        {steps.length > 1 ? (
          <StepIndicator steps={steps.map((key) => STEP_LABELS[key])} currentIndex={stepIndex} />
        ) : null}

        {step === 'setup' ? (
          <>
            <SurfaceCard>
              <FormField
                label="Game title"
                hint="Shown in the lobby — e.g. Friday night trivia"
                value={state.title}
                onChangeText={(title) => patchState({ title })}
                placeholder="Friday game night"
                maxLength={100}
                autoCapitalize="sentences"
                autoCorrect={false}
              />
            </SurfaceCard>

            <View style={styles.typeSection}>
              <Text style={styles.typeHeading}>Game type</Text>
              <GameTypePickerField
                options={NATIVE_CREATABLE_GAMES}
                value={state.gameType}
                onChange={onGameTypeChange}
              />
            </View>

            {templatableGame(state.gameType) && templateSlots ? (
              <TemplateQuickStart
                slots={templateSlots}
                onUse={runUseTemplate}
                onPrefill={handlePrefillTemplate}
                onOverride={(slot) => openSaveTemplateModal(slot)}
                onDelete={handleDeleteTemplate}
              />
            ) : null}

            <UniversalLobbyFields state={state} limits={limits} onChange={patchState} />

            <GameRoomSettingsPanel
              gameType={state.gameType}
              room={state.room}
              onChange={(roomPatch) => patchState({ room: { ...state.room, ...roomPatch } })}
            />

            {/* Who Said This is a single-step quick create: players just join and answer, so it
                shows only its Questions source picker (no rounds/name-list/content panels). */}
            {isWhoSaidThis(state.gameType) ? (
              <>
                <WhoSaidThisCreatePanel
                  wst={state.wst}
                  onChange={(wstPatch) => {
                    const patch: Partial<CreateWizardState> = { wst: { ...state.wst, ...wstPatch } }
                    // Auto-fill the category from a picked library deck name, unless the host typed their own.
                    if (wstPatch.libraryPackTitle && !state.contentLabel.trim())
                      patch.contentLabel = wstPatch.libraryPackTitle.slice(0, 40)
                    patchState(patch)
                  }}
                />
                {state.wst.source === 'custom' ? categoryField : null}
              </>
            ) : null}

            {/* Landmine owns a dedicated settings panel (mine source, mode, elimination timer, phase
                timers) instead of the generic party-room settings. */}
            {isLandmineGame(state.gameType) ? (
              <LandmineCreatePanel
                value={state.landmine}
                onChange={(landminePatch) => patchState({ landmine: { ...state.landmine, ...landminePatch } })}
              />
            ) : null}

            {/* Puzzle games (crossword/word_search/word_scramble) show the content SOURCE first —
                players pick Platform/Library/Your own, then the theme + difficulty (which depend on
                that choice) appear below. Other games keep source last. */}
            {isWhoSaidThis(state.gameType) || isLandmineGame(state.gameType)
              ? null
              : (() => {
                  const isPuzzle =
                    isCrosswordGame(state.gameType) ||
                    isWordSearchGame(state.gameType) ||
                    isWordScrambleGame(state.gameType)
                  const party = (
                    <PartyRoomSettingsPanel
                      gameType={state.gameType}
                      party={state.party}
                      contentSource={state.custom.source}
                      onChange={(partyPatch) => patchState({ party: { ...state.party, ...partyPatch } })}
                    />
                  )
                  const content = (
                    <>
                      <CustomContentPanel
                        gameType={state.gameType}
                        custom={state.custom}
                        roundsCount={state.party.roundsCount}
                        onChange={(customPatch) => {
                          const patch: Partial<CreateWizardState> = { custom: { ...state.custom, ...customPatch } }
                          // Auto-fill the category from the picked library pack name, unless the host typed their own.
                          if (customPatch.libraryPackTitle && !state.contentLabel.trim())
                            patch.contentLabel = customPatch.libraryPackTitle.slice(0, 40)
                          patchState(patch)
                        }}
                      />
                      {/* Ask for the category right under a "Your own" CSV upload. */}
                      {state.custom.source === 'custom' ? categoryField : null}
                    </>
                  )
                  return isPuzzle ? (
                    <>
                      {content}
                      {party}
                    </>
                  ) : (
                    <>
                      {party}
                      {content}
                    </>
                  )
                })()}

            <CustomSlotBuilderPanel
              gameType={state.gameType}
              people={state.people}
              onChange={(peoplePatch) => patchState({ people: { ...state.people, ...peoplePatch } })}
            />

            <PlayerModePanel
              gameType={state.gameType}
              people={state.people}
              onChange={(peoplePatch) => patchState({ people: { ...state.people, ...peoplePatch } })}
            />

            {templatableGame(state.gameType) && templateSlots ? (
              <SaveTemplateButton
                slots={templateSlots}
                presetSlot={saveModalPresetSlot}
                open={saveModalOpen}
                onOpenChange={(open) => {
                  setSaveModalOpen(open)
                  if (!open) setSaveModalPresetSlot(null)
                }}
                onConfirm={confirmSaveTemplate}
              />
            ) : null}
          </>
        ) : (
          <ParticipantListEditor
            gameType={state.gameType}
            people={state.people}
            onChange={(peoplePatch) => patchState({ people: { ...state.people, ...peoplePatch } })}
          />
        )}

        {step === 'setup' ? (
          <Pressable style={styles.webLink} onPress={() => void Linking.openURL(`${WEB_BASE_URL}/create`)}>
            <Text style={styles.webLinkText}>Prefer a bigger screen, or need .xlsx import?</Text>
            <Text style={styles.webLinkAction}>Full setup on web →</Text>
          </Pressable>
        ) : null}
      </KeyboardFormScreen>
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    container: {
      paddingHorizontal: theme.space.lg,
      paddingBottom: 40,
      gap: theme.space.lg,
    },
    back: { alignSelf: 'flex-start', marginTop: theme.space.xs },
    backText: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
    hero: {
      gap: theme.space.xs,
      paddingBottom: theme.space.xs,
    },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    heading: {
      color: theme.text,
      fontSize: 32,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 16,
      lineHeight: 24,
      maxWidth: 340,
    },
    typeSection: { gap: theme.space.sm },
    typeHeading: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
    },
    footer: {
      paddingHorizontal: theme.space.lg,
      paddingTop: theme.space.sm,
      paddingBottom: theme.space.sm,
      gap: theme.space.sm,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
    },
    error: {
      color: theme.error,
      fontSize: 14,
      textAlign: 'center',
    },
    webLink: {
      alignItems: 'center',
      gap: 4,
      paddingVertical: theme.space.sm,
    },
    webLinkText: {
      color: theme.textFaint,
      fontSize: 13,
      textAlign: 'center',
    },
    webLinkAction: {
      color: theme.primaryMuted,
      fontSize: 14,
      fontWeight: '700',
    },
  })
