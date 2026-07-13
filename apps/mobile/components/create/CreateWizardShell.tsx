import { useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { GameType } from '@fateround/shared'
import { isCrosswordGame, isWordSearchGame, isWordScrambleGame } from '@fateround/shared/game-type-checks'
import { GameTypePickerField } from '@/components/create/GameTypePickerField'
import { ParticipantListEditor } from '@/components/create/ParticipantListEditor'
import { StepIndicator } from '@/components/create/StepIndicator'
import { UniversalLobbyFields } from '@/components/create/UniversalLobbyFields'
import { GameRoomSettingsPanel } from '@/components/create/GameRoomSettingsPanel'
import { PartyRoomSettingsPanel } from '@/components/create/PartyRoomSettingsPanel'
import { CustomContentPanel } from '@/components/create/CustomContentPanel'
import { CustomSlotBuilderPanel } from '@/components/create/CustomSlotBuilderPanel'
import { PlayerModePanel } from '@/components/create/PlayerModePanel'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { FormField } from '@/components/ui/FormField'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGamePlayerLimits } from '@/hooks/useGamePlayerLimits'
import {
  applyGameTypeChange,
  buildCreatePayload,
  createInitialState,
  needsParticipantStep,
  validateCreateState,
  validateSetupStep,
  wizardStepsForGame,
  type CreateWizardState,
  type CreateWizardStep,
} from '@/lib/create-settings'
import { createGame } from '@/lib/game-api'
import { WEB_BASE_URL } from '@/lib/config'
import { NATIVE_CREATABLE_GAMES } from '@/lib/native-create'
import { setHostToken } from '@/lib/secure-session'

const STEP_LABELS: Record<CreateWizardStep, string> = {
  setup: 'Setup',
  people: 'People',
}

export function CreateWizardShell() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const { limits } = useGamePlayerLimits()
  const [state, setState] = useState<CreateWizardState>(() =>
    createInitialState(NATIVE_CREATABLE_GAMES[0] ?? 'trivia', limits)
  )
  const [step, setStep] = useState<CreateWizardStep>('setup')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const steps = useMemo(() => wizardStepsForGame(state), [state])
  const stepIndex = step === 'people' ? 1 : 0
  const showPeopleStep = needsParticipantStep(state)

  const patchState = (patch: Partial<CreateWizardState>) => {
    setState((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  const onGameTypeChange = (gameType: GameType) => {
    setState((prev) => applyGameTypeChange(prev, gameType, limits))
    setStep('setup')
    setError(null)
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

            <UniversalLobbyFields state={state} limits={limits} onChange={patchState} />

            <GameRoomSettingsPanel
              gameType={state.gameType}
              room={state.room}
              onChange={(roomPatch) => patchState({ room: { ...state.room, ...roomPatch } })}
            />

            {/* Puzzle games (crossword/word_search/word_scramble) show the content SOURCE first —
                players pick Platform/Library/Your own, then the theme + difficulty (which depend on
                that choice) appear below. Other games keep source last. */}
            {(() => {
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
                <CustomContentPanel
                  gameType={state.gameType}
                  custom={state.custom}
                  roundsCount={state.party.roundsCount}
                  onChange={(customPatch) => patchState({ custom: { ...state.custom, ...customPatch } })}
                />
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
