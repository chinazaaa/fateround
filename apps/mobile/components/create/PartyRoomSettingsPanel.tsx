import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  BINGO_CALL_INTERVAL_OPTIONS,
  CODEWORDS_TIMER_OPTIONS,
  DESCRIBE_IT_TURN_OPTIONS,
  MAFIA_PHASE_TIMER_OPTIONS,
  MATCHING_PAIRS_GAME_DURATION_OPTIONS,
  POLL_ROUND_TIMER_OPTIONS,
  QUICK_DRAW_DRAW_TIMER_OPTIONS,
  QUICK_DRAW_TITLE_TIMER_OPTIONS,
  QUICK_DRAW_VOTE_TIMER_OPTIONS,
  SUDOKU_GAME_DURATION_OPTIONS,
  TRIVIA_TIMER_OPTIONS,
  formatMatchingPairsGameDuration,
  formatPollRoundTimer,
  formatQuickDrawTurnTimer,
  formatSudokuGameDuration,
  hasPartyRoomSettings,
  isPollPartyGame,
  pairVoteModeOptions,
  partyRoundOptions,
  supportsGenderToggle,
} from '@fateround/shared/create-party-games'
import {
  NPAT_GAME_DURATION_OPTIONS,
  NPAT_MARKING_TIMER_OPTIONS,
  NPAT_TIMER_OPTIONS,
  formatNpatGameDuration,
} from '@fateround/shared/npat'
import { isPairGame } from '@fateround/shared/poll-games'
import { QUICK_DRAW_GUESS_TEAM_OPTIONS, clampQuickDrawPlayMode } from '@fateround/shared/quick-draw-guess'
import { QUIPLASH_SUBMIT_TIMER_OPTIONS, QUIPLASH_VOTE_TIMER_OPTIONS } from '@fateround/shared/quiplash'
import { TTL_TIMER_OPTIONS } from '@fateround/shared/two-truths'
import { WORD_RUSH_ROUND_OPTIONS, WORD_RUSH_TURN_OPTIONS, formatWordRushTurnTimer } from '@fateround/shared/word-rush'
import { WORD_HUNT_TIMER_OPTIONS } from '@fateround/shared/word-hunt'
import {
  CROSSWORD_GAME_DURATION_OPTIONS,
  CROSSWORD_THEME_OPTIONS,
  formatCrosswordGameDuration,
} from '@fateround/shared/crossword'
import {
  WORD_SEARCH_GAME_DURATION_OPTIONS,
  WORD_SEARCH_THEME_OPTIONS,
  formatWordSearchGameDuration,
} from '@fateround/shared/word-search'
import {
  WORD_SCRAMBLE_GAME_DURATION_OPTIONS,
  WORD_SCRAMBLE_THEME_OPTIONS,
  formatWordScrambleGameDuration,
} from '@fateround/shared/word-scramble'
import { RoundCountPicker } from '@/components/create/RoundCountPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SelectField } from '@/components/create/SelectField'
import { usePuzzleThemes, puzzleThemeIdFromValue } from '@/lib/puzzle-themes'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { DESCRIBE_IT_TEAM_OPTIONS, type PartyRoomSettings } from '@/lib/create-settings/party-games'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  gameType: GameType
  party: PartyRoomSettings
  onChange: (patch: Partial<PartyRoomSettings>) => void
  /** Content source for puzzle games (crossword/word_search/word_scramble). Theme shows only
   *  for 'platform'; difficulty is hidden for 'library' (packs carry no difficulty). */
  contentSource?: 'platform' | 'custom' | 'library'
}

export function PartyRoomSettingsPanel({ gameType, party, onChange, contentSource = 'platform' }: Props) {
  const styles = useThemedStyles(makeStyles)
  // Admin-authored themes shown alongside the built-ins in the theme picker. A selected admin
  // theme carries value `pt:<id>`; the payload builder sends puzzle_theme_id. Called before any
  // early return to respect the rules of hooks.
  const puzzleThemes = usePuzzleThemes(gameType)
  const lockedPuzzleDifficulty = (value: string): 'easy' | 'medium' | 'hard' | null => {
    const id = puzzleThemeIdFromValue(value)
    return id ? (puzzleThemes.find((t) => t.id === id)?.difficulty ?? null) : null
  }
  const puzzleThemeOptions = puzzleThemes.map((t) => ({
    value: `pt:${t.id}`,
    label: t.difficulty ? `${t.name} (${t.difficulty})` : t.name,
  }))
  if (!hasPartyRoomSettings(gameType)) return null
  const showPuzzleTheme = contentSource === 'platform'
  // Difficulty = grid size, independent of where the words come from, so it stays editable under
  // every source. A theme only locks it on the Platform tab (admin themes carry one); under
  // Library/Your own there's no theme, so a stale theme value must not be treated as a lock.
  const showPuzzleDifficulty = true
  const crosswordDiffLock = contentSource === 'platform' ? lockedPuzzleDifficulty(party.crosswordTheme) : null
  const wordSearchDiffLock = contentSource === 'platform' ? lockedPuzzleDifficulty(party.wordSearchTheme) : null
  const wordScrambleDiffLock = contentSource === 'platform' ? lockedPuzzleDifficulty(party.wordScrambleTheme) : null

  const title = `${gameLabel(gameType)} room`
  const roundOptions = partyRoundOptions(gameType)
  const showRounds =
    gameType !== 'bingo' &&
    gameType !== 'two_truths' &&
    gameType !== 'word_hunt' &&
    gameType !== 'sudoku' &&
    gameType !== 'i_call_on' &&
    gameType !== 'codewords' &&
    gameType !== 'mafia'

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>{title}</Text>

        {isPollPartyGame(gameType) ? (
          <>
            {showRounds ? (
              <RoundCountPicker
                label="Rounds"
                value={party.roundsCount}
                options={roundOptions}
                onChange={(roundsCount) => onChange({ roundsCount })}
              />
            ) : null}
            <TimerPicker
              label="Time per round"
              value={party.timerSeconds}
              options={POLL_ROUND_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.toggles}>
              <SettingToggle
                label="Anonymous responses"
                description="Hide who voted for what"
                value={party.anonymous}
                onChange={(anonymous) => onChange({ anonymous })}
              />
              {supportsGenderToggle(gameType) ? (
                <SettingToggle
                  label="Gender-based rounds"
                  description="Same-gender rounds with gender voting rules"
                  value={party.genderBased}
                  onChange={(genderBased) => onChange({ genderBased })}
                />
              ) : null}
              {isPairGame(gameType) ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Pair voting</Text>
                  <SegmentedControl
                    value={party.pairVoteMode}
                    options={pairVoteModeOptions(gameType).map((option) => ({
                      value: option.value,
                      label: option.label,
                      hint: option.hint,
                    }))}
                    onChange={(value) => onChange({ pairVoteMode: value as PartyRoomSettings['pairVoteMode'] })}
                  />
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {gameType === 'trivia' ? (
          <>
            <RoundCountPicker
              label="Rounds"
              value={party.roundsCount}
              options={roundOptions}
              onChange={(roundsCount) => onChange({ roundsCount })}
            />
            <TimerPicker
              label="Time per question"
              value={party.timerSeconds}
              options={TRIVIA_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <SelectField
                title="Category"
                value={party.triviaCategory}
                options={[
                  { value: 'general', label: 'General (All Categories)' },
                  { value: 'tech', label: 'Tech' },
                  { value: 'art', label: 'Art' },
                  { value: 'food', label: 'Food' },
                  { value: 'geography', label: 'Geography' },
                  { value: 'history', label: 'History' },
                  { value: 'language', label: 'Language' },
                  { value: 'literature', label: 'Literature' },
                  { value: 'math', label: 'Math' },
                  { value: 'movies', label: 'Movies' },
                  { value: 'music', label: 'Music' },
                  { value: 'nature', label: 'Nature' },
                  { value: 'pop_culture', label: 'Pop Culture' },
                  { value: 'science', label: 'Science' },
                  { value: 'sports', label: 'Sports' },
                  { value: 'technology', label: 'Technology' },
                  { value: 'world_culture', label: 'World Culture' },
                ]}
                searchable
                onChange={(value) => onChange({ triviaCategory: value as PartyRoomSettings['triviaCategory'] })}
              />
            </View>
          </>
        ) : null}

        {gameType === 'bingo' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Number calling</Text>
              <SegmentedControl
                value={party.bingoCallMode}
                options={[
                  { value: 'manual', label: 'Manual', hint: 'You tap to call each number' },
                  { value: 'auto', label: 'Automatic', hint: 'Numbers called for you' },
                ]}
                onChange={(value) => onChange({ bingoCallMode: value as PartyRoomSettings['bingoCallMode'] })}
              />
            </View>
            {party.bingoCallMode === 'auto' ? (
              <TimerPicker
                label="Seconds between calls"
                value={party.bingoCallInterval}
                options={BINGO_CALL_INTERVAL_OPTIONS}
                format={(seconds) => `${seconds}s`}
                onChange={(bingoCallInterval) => onChange({ bingoCallInterval })}
              />
            ) : null}
          </>
        ) : null}

        {gameType === 'quiplash' ? (
          <>
            <RoundCountPicker
              label="Rounds"
              value={party.roundsCount}
              options={roundOptions}
              onChange={(roundsCount) => onChange({ roundsCount })}
            />
            <TimerPicker
              label="Answer timer"
              value={party.timerSeconds}
              options={QUIPLASH_SUBMIT_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <TimerPicker
              label="Vote timer"
              value={party.quiplashVoteTimer}
              options={QUIPLASH_VOTE_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(quiplashVoteTimer) => onChange({ quiplashVoteTimer })}
            />
          </>
        ) : null}

        {gameType === 'quick_draw' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Game style</Text>
              <SegmentedControl
                value={party.quickDrawVariant}
                options={[
                  { value: 'lie', label: 'Lie', hint: 'Drawful-style — fool everyone with fake titles' },
                  { value: 'guess', label: 'Guess', hint: 'Draw a word — teammates guess' },
                ]}
                onChange={(value) => onChange({ quickDrawVariant: value as PartyRoomSettings['quickDrawVariant'] })}
              />
            </View>
            {party.quickDrawVariant === 'guess' ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Mode</Text>
                  <SegmentedControl
                    value={party.quickDrawPlayMode}
                    options={[
                      { value: 'team', label: 'Teams', hint: 'Teams race to guess drawings' },
                      { value: 'individual', label: 'Individual', hint: 'Everyone draws — fastest guess wins' },
                    ]}
                    onChange={(value) =>
                      onChange({
                        quickDrawPlayMode: clampQuickDrawPlayMode(value) as PartyRoomSettings['quickDrawPlayMode'],
                      })
                    }
                  />
                </View>
                {party.quickDrawPlayMode !== 'individual' ? (
                  <View style={styles.field}>
                    <Text style={styles.label}>Teams</Text>
                    <SegmentedControl
                      value={String(party.quickDrawNumTeams)}
                      options={QUICK_DRAW_GUESS_TEAM_OPTIONS.map((count) => ({
                        value: String(count),
                        label: `${count} teams`,
                      }))}
                      onChange={(value) => onChange({ quickDrawNumTeams: Number(value) })}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            <RoundCountPicker
              label="Rounds"
              value={party.roundsCount}
              options={roundOptions}
              onChange={(roundsCount) => onChange({ roundsCount })}
            />
            <TimerPicker
              label={party.quickDrawVariant === 'guess' ? 'Turn timer' : 'Draw timer'}
              value={party.timerSeconds}
              options={QUICK_DRAW_DRAW_TIMER_OPTIONS}
              format={formatQuickDrawTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            {party.quickDrawVariant !== 'guess' ? (
              <>
                <TimerPicker
                  label="Title timer"
                  value={party.quickDrawTitleTimer}
                  options={QUICK_DRAW_TITLE_TIMER_OPTIONS}
                  format={formatPollRoundTimer}
                  onChange={(quickDrawTitleTimer) => onChange({ quickDrawTitleTimer })}
                />
                <TimerPicker
                  label="Vote timer"
                  value={party.quickDrawVoteTimer}
                  options={QUICK_DRAW_VOTE_TIMER_OPTIONS}
                  format={formatPollRoundTimer}
                  onChange={(quickDrawVoteTimer) => onChange({ quickDrawVoteTimer })}
                />
              </>
            ) : null}
          </>
        ) : null}

        {gameType === 'describe_it' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Mode</Text>
              <SegmentedControl
                value={party.describeItMode}
                options={[
                  { value: 'team', label: 'Teams', hint: 'Teams race to guess' },
                  { value: 'individual', label: 'Individual', hint: 'Solo — fastest guess wins' },
                ]}
                onChange={(value) => onChange({ describeItMode: value as PartyRoomSettings['describeItMode'] })}
              />
            </View>
            {party.describeItMode !== 'individual' ? (
              <View style={styles.field}>
                <Text style={styles.label}>Teams</Text>
                <SegmentedControl
                  value={String(party.describeItNumTeams)}
                  options={DESCRIBE_IT_TEAM_OPTIONS.map((count) => ({
                    value: String(count),
                    label: `${count} teams`,
                  }))}
                  onChange={(value) => onChange({ describeItNumTeams: Number(value) })}
                />
              </View>
            ) : null}
            <RoundCountPicker
              label="Rounds"
              value={party.roundsCount}
              options={roundOptions}
              onChange={(roundsCount) => onChange({ roundsCount })}
            />
            <TimerPicker
              label="Turn timer"
              value={party.timerSeconds}
              options={DESCRIBE_IT_TURN_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
          </>
        ) : null}

        {gameType === 'word_rush' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Mode</Text>
              <SegmentedControl
                value={party.wordRushMode}
                options={[
                  { value: 'team', label: 'Teams', hint: 'Teams take timed turns' },
                  { value: 'individual', label: 'Individual', hint: 'Everyone races each round' },
                ]}
                onChange={(value) => onChange({ wordRushMode: value as PartyRoomSettings['wordRushMode'] })}
              />
            </View>
            {party.wordRushMode !== 'individual' ? (
              <View style={styles.field}>
                <Text style={styles.label}>Teams</Text>
                <SegmentedControl
                  value={String(party.wordRushNumTeams)}
                  options={[2, 3, 4].map((count) => ({
                    value: String(count),
                    label: `${count} teams`,
                  }))}
                  onChange={(value) => onChange({ wordRushNumTeams: Number(value) })}
                />
              </View>
            ) : null}
            <View style={styles.field}>
              <Text style={styles.label}>Prompt mode</Text>
              <SegmentedControl
                value={party.wordRushPromptMode}
                options={[
                  { value: 'automatic', label: 'Automatic', hint: 'Platform prompts each turn' },
                  { value: 'manual', label: 'Manual', hint: 'Host picks prompts (web only today)' },
                ]}
                onChange={(value) => onChange({ wordRushPromptMode: value as PartyRoomSettings['wordRushPromptMode'] })}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Difficulty</Text>
              <SegmentedControl
                value={party.wordRushDifficulty}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'hard', label: 'Hard', hint: 'Minimum word length rises each round' },
                ]}
                onChange={(value) => onChange({ wordRushDifficulty: value as PartyRoomSettings['wordRushDifficulty'] })}
              />
            </View>
            <RoundCountPicker
              label="Rounds"
              value={party.roundsCount}
              options={WORD_RUSH_ROUND_OPTIONS}
              onChange={(roundsCount) => onChange({ roundsCount })}
            />
            <TimerPicker
              label={party.wordRushMode === 'individual' ? 'Round length' : 'Team turn length'}
              value={party.timerSeconds}
              options={WORD_RUSH_TURN_OPTIONS}
              format={formatWordRushTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
          </>
        ) : null}

        {gameType === 'two_truths' ? (
          <TimerPicker
            label="Guess timer"
            value={party.timerSeconds}
            options={TTL_TIMER_OPTIONS}
            format={formatPollRoundTimer}
            onChange={(timerSeconds) => onChange({ timerSeconds })}
          />
        ) : null}

        {gameType === 'hot_seat' ? (
          <>
            <RoundCountPicker
              label="Max rounds"
              hint="One hot seat turn per player — actual count is set in the lobby."
              value={party.roundsCount}
              options={roundOptions}
              onChange={(roundsCount) => onChange({ roundsCount })}
            />
            <TimerPicker
              label="Time per round"
              value={party.timerSeconds}
              options={POLL_ROUND_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
          </>
        ) : null}

        {gameType === 'codewords' ? (
          <>
            <TimerPicker
              label="Spymaster timer"
              value={party.timerSeconds}
              options={CODEWORDS_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <TimerPicker
              label="Operative timer"
              value={party.codewordsOperativeTimer}
              options={CODEWORDS_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(codewordsOperativeTimer) => onChange({ codewordsOperativeTimer })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Team assignment</Text>
              <SegmentedControl
                value={party.codewordsTeamAssignment}
                options={[
                  { value: 'players', label: 'Players pick', hint: 'Each player chooses team and role in the lobby' },
                  { value: 'host', label: 'Host assigns', hint: 'You place everyone from the host panel' },
                  { value: 'randomize', label: 'Randomize', hint: 'You pick spymasters — operatives shuffle at start' },
                ]}
                onChange={(value) =>
                  onChange({ codewordsTeamAssignment: value as PartyRoomSettings['codewordsTeamAssignment'] })
                }
              />
            </View>
          </>
        ) : null}

        {gameType === 'mafia' ? (
          <>
            <TimerPicker
              label="Phase time limit"
              value={party.timerSeconds}
              options={MAFIA_PHASE_TIMER_OPTIONS}
              format={formatQuickDrawTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.toggles}>
              <SettingToggle
                label="Doctor"
                description="Protects one player each night"
                value={party.mafiaDoctorEnabled}
                onChange={(mafiaDoctorEnabled) => onChange({ mafiaDoctorEnabled })}
              />
              <SettingToggle
                label="Detective"
                description="Investigates one player each night"
                value={party.mafiaDetectiveEnabled}
                onChange={(mafiaDetectiveEnabled) => onChange({ mafiaDetectiveEnabled })}
              />
              <SettingToggle
                label="Anonymous votes"
                description="Hide who voted for whom during the day phase"
                value={party.mafiaAnonymousVotes}
                onChange={(mafiaAnonymousVotes) => onChange({ mafiaAnonymousVotes })}
              />
            </View>
          </>
        ) : null}

        {gameType === 'word_hunt' ? (
          <TimerPicker
            label="Time limit"
            value={party.timerSeconds}
            options={WORD_HUNT_TIMER_OPTIONS}
            format={formatQuickDrawTurnTimer}
            onChange={(timerSeconds) => onChange({ timerSeconds })}
          />
        ) : null}

        {gameType === 'sudoku' ? (
          <TimerPicker
            label="Max time limit"
            value={party.gameDurationSeconds}
            options={SUDOKU_GAME_DURATION_OPTIONS}
            format={formatSudokuGameDuration}
            onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
          />
        ) : null}

        {gameType === 'crossword' ? (
          <>
            {showPuzzleTheme ? (
              <View style={styles.field}>
                <Text style={styles.label}>Theme</Text>
                <SelectField
                  title="Crossword theme"
                  value={party.crosswordTheme}
                  options={[
                    ...CROSSWORD_THEME_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
                    ...puzzleThemeOptions,
                  ]}
                  onChange={(crosswordTheme) => {
                    const locked = lockedPuzzleDifficulty(crosswordTheme)
                    onChange({ crosswordTheme, ...(locked ? { crosswordDifficulty: locked } : {}) })
                  }}
                  searchable
                />
              </View>
            ) : null}
            {showPuzzleDifficulty ? (
              <View style={styles.field}>
                <Text style={styles.label}>Difficulty</Text>
                <SegmentedControl
                  value={party.crosswordDifficulty}
                  disabled={!!crosswordDiffLock}
                  options={[
                    { value: 'easy', label: 'Easy', hint: 'Smaller grid, fewer words' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard', hint: 'Bigger grid, more words' },
                  ]}
                  onChange={(value) =>
                    onChange({ crosswordDifficulty: value as PartyRoomSettings['crosswordDifficulty'] })
                  }
                />
              </View>
            ) : null}
            <TimerPicker
              label="Max time limit"
              value={party.gameDurationSeconds}
              options={CROSSWORD_GAME_DURATION_OPTIONS}
              format={formatCrosswordGameDuration}
              onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
            />
          </>
        ) : null}

        {gameType === 'word_search' ? (
          <>
            {showPuzzleTheme ? (
              <View style={styles.field}>
                <Text style={styles.label}>Theme</Text>
                <SelectField
                  title="Word Search theme"
                  value={party.wordSearchTheme}
                  options={[
                    ...WORD_SEARCH_THEME_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
                    ...puzzleThemeOptions,
                  ]}
                  onChange={(wordSearchTheme) => {
                    const locked = lockedPuzzleDifficulty(wordSearchTheme)
                    onChange({ wordSearchTheme, ...(locked ? { wordSearchDifficulty: locked } : {}) })
                  }}
                  searchable
                />
              </View>
            ) : null}
            {showPuzzleDifficulty ? (
              <View style={styles.field}>
                <Text style={styles.label}>Difficulty</Text>
                <SegmentedControl
                  value={party.wordSearchDifficulty}
                  disabled={!!wordSearchDiffLock}
                  options={[
                    { value: 'easy', label: 'Easy', hint: 'Smaller grid, fewer words' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard', hint: 'Bigger grid, all directions' },
                  ]}
                  onChange={(value) =>
                    onChange({ wordSearchDifficulty: value as PartyRoomSettings['wordSearchDifficulty'] })
                  }
                />
              </View>
            ) : null}
            <TimerPicker
              label="Max time limit"
              value={party.gameDurationSeconds}
              options={WORD_SEARCH_GAME_DURATION_OPTIONS}
              format={formatWordSearchGameDuration}
              onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
            />
          </>
        ) : null}

        {gameType === 'word_scramble' ? (
          <>
            {showPuzzleTheme ? (
              <View style={styles.field}>
                <Text style={styles.label}>Theme</Text>
                <SelectField
                  title="Word Scramble theme"
                  value={party.wordScrambleTheme}
                  options={[
                    ...WORD_SCRAMBLE_THEME_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
                    ...puzzleThemeOptions,
                  ]}
                  onChange={(wordScrambleTheme) => {
                    const locked = lockedPuzzleDifficulty(wordScrambleTheme)
                    onChange({ wordScrambleTheme, ...(locked ? { wordScrambleDifficulty: locked } : {}) })
                  }}
                  searchable
                />
              </View>
            ) : null}
            {showPuzzleDifficulty ? (
              <View style={styles.field}>
                <Text style={styles.label}>Difficulty</Text>
                <SegmentedControl
                  value={party.wordScrambleDifficulty}
                  disabled={!!wordScrambleDiffLock}
                  options={[
                    { value: 'easy', label: 'Easy', hint: 'Short words' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard', hint: 'Long words + letter bonus' },
                  ]}
                  onChange={(value) =>
                    onChange({ wordScrambleDifficulty: value as PartyRoomSettings['wordScrambleDifficulty'] })
                  }
                />
              </View>
            ) : null}
            <TimerPicker
              label="Max time limit"
              value={party.gameDurationSeconds}
              options={WORD_SCRAMBLE_GAME_DURATION_OPTIONS}
              format={formatWordScrambleGameDuration}
              onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
            />
          </>
        ) : null}

        {gameType === 'matching_pairs' ? (
          <>
            <TimerPicker
              label="Time limit"
              value={party.timerSeconds}
              options={MATCHING_PAIRS_GAME_DURATION_OPTIONS}
              format={formatMatchingPairsGameDuration}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <RoundCountPicker
              label="Rounds"
              hint="Scores accumulate across all rounds."
              value={party.roundsCount}
              options={roundOptions}
              onChange={(roundsCount) => onChange({ roundsCount })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Grid size</Text>
              <SegmentedControl
                value={party.matchingPairsLargeGrid ? 'large' : 'standard'}
                options={[
                  { value: 'standard', label: 'Standard', hint: '4×4 grid (8 pairs)' },
                  { value: 'large', label: 'Large', hint: '8×4 grid (16 pairs)' },
                ]}
                onChange={(value) => onChange({ matchingPairsLargeGrid: value === 'large' })}
              />
            </View>
          </>
        ) : null}

        {gameType === 'i_call_on' ? (
          <>
            <TimerPicker
              label="Game length"
              value={party.gameDurationSeconds}
              options={NPAT_GAME_DURATION_OPTIONS}
              format={formatNpatGameDuration}
              onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
            />
            <TimerPicker
              label="Writing time"
              value={party.timerSeconds}
              options={NPAT_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <TimerPicker
              label="Marking time"
              value={party.npatMarkingTimer}
              options={NPAT_MARKING_TIMER_OPTIONS}
              format={formatPollRoundTimer}
              onChange={(npatMarkingTimer) => onChange({ npatMarkingTimer })}
            />
          </>
        ) : null}
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    heading: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
    },
    field: { gap: theme.space.sm },
    label: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    toggles: { gap: theme.space.sm },
  })
