export type GameStatus = 'scheduled' | 'waiting' | 'active' | 'finished'
export type RoundStatus = 'pending' | 'active' | 'finished'
export type AutoSubmitBehavior = 'random' | 'no_answer'
export type ParticipantMode = 'import' | 'joiners' | 'voters'
/** Pair games: `any` = 2 smash OK; `one_each` = must pick one of each option. */
export type PairVoteMode = 'any' | 'one_each'
/** WYR / MLT: built-in pool vs host-uploaded CSV questions, or community library pack. */
export type QuestionSource = 'platform' | 'custom' | 'library'
/** How player-submitted lobby questions are mixed with uploaded/platform questions. */
export type PlayerQuestionsOrder = 'players_first' | 'uploaded_first' | 'mixed'
export type GameType =
  | 'smash_marry_kill'
  | 'red_flag_green_flag'
  | 'smash_or_pass'
  | 'would_you_rather'
  | 'never_have_i_ever'
  | 'pick_a_number'
  | 'this_or_that'
  | 'most_likely_to'
  | 'who_said_this'
  | 'hot_seat'
  | 'custom'
  | 'anonymous_messages'
  | 'secret_message'
  | 'bingo'
  | 'codewords'
  | 'trivia'
  | 'two_truths'
  | 'parent_approval'
  | 'monopoly'
  | 'yahtzee'
  | 'whot'
  | 'ludo'
  | 'mahjong'
  | 'i_call_on'
  | 'sudoku'
  | 'tic_tac_toe'
  | 'word_hunt'
  | 'chess'
  | 'describe_it'
  | 'scrabble'
  | 'snake_and_ladder'
  | 'crazy_eights'
  | 'checkers'
  | 'checkers_international'
  | 'checkers_nigeria'
  | 'mafia'
  | 'matching_pairs'
  | 'quiplash'
  | 'word_rush'
  | 'quick_draw'
  | 'ayo'
  | 'crossword'
  | 'word_search'
  | 'word_scramble'
  | 'landmine'
  | 'ping_pong'
  | 'uno'
  | 'word_grouping'
  | 'wordle_room'

export type NpatPhase = 'letter_pick' | 'writing' | 'marking' | 'host_review' | 'reveal'
export type NpatCategory = 'name' | 'animal' | 'place' | 'thing' | 'food'

export type NpatHostOverrides = Record<string, Partial<Record<NpatCategory, boolean>>>

export interface NpatDispute {
  challenger_id: string
  target_player_id: string
  category: NpatCategory
}

export interface NpatMetadata {
  letter: string | null
  phase: NpatPhase
  phase_started_at: string | null
  reviewer_assignments: Record<string, string>
  scores_computed?: boolean
  used_letters: string[]
  caller_order: string[]
  caller_index: number
  host_overrides?: NpatHostOverrides
  disputes?: NpatDispute[]
}

export interface NpatAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  name: string
  animal: string
  place: string
  thing: string
  food: string
  submitted_at: string | null
  score_name: number | null
  score_animal: number | null
  score_place: number | null
  score_thing: number | null
  score_food: number | null
}

export interface NpatMark {
  id: string
  game_id: string
  round_id: string
  marker_player_id: string
  target_player_id: string
  valid_name: boolean
  valid_animal: boolean
  valid_place: boolean
  valid_thing: boolean
  valid_food: boolean
  marked_at: string | null
}

// ---------------------------------------------------------------------------
// Landmine — party word game. The system shows a category, secretly picks one
// (or a few) common answers as the "mine"; players type a blind answer; answers
// are peer-marked Valid/Void BEFORE the mine is revealed; then the mine is shown
// and hitters are zeroed (zero_points) or knocked out (elimination).
// Structurally a single-answer variant of NPAT (I Call On) with a secret mine.
// ---------------------------------------------------------------------------
export type LandminePhase = 'category_pick' | 'writing' | 'marking' | 'review' | 'reveal'
export type LandmineMode = 'zero_points' | 'elimination'
/** Who plants the mine: 'system' (server draws it) or 'manual' (a rotating player sets it). */
export type LandmineMineSource = 'system' | 'manual'

export interface LandmineMetadata {
  phase: LandminePhase
  phase_started_at: string | null
  /** Category shown to the room once the caller picks it. */
  category: string | null
  /** Rotating "caller" who picks the category each round (reused from NPAT). */
  caller_order: string[]
  caller_index: number
  /** markerId -> targetId ring; each player marks one other, never themselves. */
  reviewer_assignments: Record<string, string>
  /** The mine word(s) — populated ONLY at reveal (secret until then). */
  revealed_mines?: string[]
  mine_count: number
  scores_computed?: boolean
}

/** 'setter' marks the manual-mode setter's mirror-payout row (blank answer, points = round total). */
export type LandmineOutcome = 'valid' | 'original' | 'void' | 'mine' | 'empty' | 'setter'

export interface LandmineAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  answer: string
  submitted_at: string | null
  points: number | null
  outcome: LandmineOutcome | null
  mine_hit: boolean | null
  is_original: boolean | null
}

export interface LandmineMark {
  id: string
  game_id: string
  round_id: string
  marker_player_id: string
  target_player_id: string
  valid: boolean
  marked_at: string | null
}

export type YahtzeeCategory =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'three_kind'
  | 'four_kind'
  | 'full_house'
  | 'small_straight'
  | 'large_straight'
  | 'yahtzee'
  | 'chance'
export type TriviaCategory =
  | 'tech'
  | 'general'
  | 'art'
  | 'food'
  | 'geography'
  | 'history'
  | 'language'
  | 'literature'
  | 'math'
  | 'movies'
  | 'music'
  | 'nature'
  | 'pop_culture'
  | 'science'
  | 'sports'
  | 'technology'
  | 'world_culture'
export type BingoCallMode = 'manual' | 'auto'
export type CodewordsCellType = 'red' | 'blue' | 'neutral' | 'assassin'
export type CodewordsTeam = 'red' | 'blue'
export type CodewordsRole = 'spymaster' | 'operative'

export interface CodewordsBoard {
  id: string
  game_id: string
  words: string[]
  /**
   * Word → team assignment. SECRET while the game is live: only the host and the two
   * spymasters receive the real array from /api/codewords/board. Everyone else gets a MASKED
   * copy — the true type at revealed indices, `null` at unrevealed ones — which is all an
   * operative's UI needs (see audit finding H2). Server code always holds the full key.
   */
  key: (CodewordsCellType | null)[]
  /**
   * How many cells belong to each type. Not secret (the split is fixed by the ruleset and is
   * already on screen), but it can't be derived from a masked key — so the API sends it
   * explicitly for the scoreboard.
   */
  key_totals?: Partial<Record<CodewordsCellType, number>>
  starting_team: CodewordsTeam
  revealed_indices: number[]
  current_turn: CodewordsTeam
  guesses_remaining: number | null
  current_clue_word: string | null
  current_clue_number: number | null
  winner: CodewordsTeam | null
  assassin_team: CodewordsTeam | null
  spymaster_timer_seconds: number
  operative_timer_seconds: number
  turn_phase: 'clue' | 'guess'
  turn_deadline_at: string | null
  created_at: string
}

export interface CodewordsPlayerRole {
  id: string
  game_id: string
  player_id: string
  team: CodewordsTeam
  role: CodewordsRole
  created_at: string
}

export interface CodewordsGuess {
  id: string
  game_id: string
  board_id: string
  player_id: string
  cell_index: number
  word: string
  cell_type: CodewordsCellType
  clue_word: string | null
  clue_number: number | null
  team: CodewordsTeam
  created_at: string
}

export interface CodewordsMessage {
  id: string
  game_id: string
  player_id: string
  team: CodewordsTeam
  text: string
  created_at: string
  player_name?: string
}
export type ThemeId =
  | 'default'
  | 'neon'
  | 'retro'
  | 'elegant'
  | 'tropical'
  | 'pirate'
  | 'arctic'
  | 'naija'
  | 'grass_court'
export type WyrChoice = 'a' | 'b'

export type ParticipantGender = 'male' | 'female'
/** Gender selected when joining — `both` means vote on every round. */
export type PlayerGender = 'male' | 'female' | 'both'

export interface CustomSlot {
  key: string
  label: string
  emoji: string
  color: string
}

export interface CustomSlotsConfig {
  slots: CustomSlot[]
  title: string
  /** When true, rounds are same-gender and players vote by gender (KMK-style). Default false. */
  gender_based?: boolean
}

export interface AiQuestionsConfig {
  ratio: 'all_ai' | 'mostly_ai' | 'half' | 'mostly_platform'
  theme?: string
  customPrompt?: string
}

export type AiGeneratedQuestions =
  | { type: 'wyr'; questions: { optionA: string; optionB: string }[] }
  | { type: 'mlt'; questions: string[] }
  | { type: 'nhie'; questions: string[] }

export interface Game {
  id: string
  title: string
  /** Player-facing content label ("what's this pack about") for CSV/library content games —
   *  e.g. "Maths", "Bible trivia". Distinct from `title` (room name) and `theme` (cosmetic).
   *  Auto-filled from the library pack name, or typed by the host for a CSV upload; editable
   *  from the host lobby. Shown next to the room name on join, gameplay, and finished screens. */
  content_label?: string | null
  /** Secret host credential. Only present on server-side (service-role) reads; never
   *  exposed to clients (migration 0122), so optional on this shared type. */
  host_token?: string
  /** Set when this game belongs to a tournament (links back to tournaments.id). */
  tournament_id?: string | null
  /** Claim-based host transfer: player id the current host has nominated to take over.
   *  Non-secret (just a player id); the nominee claims via /api/games/[code]/claim-host. */
  pending_host_player_id?: string | null
  /** The host's own player row id, so every client can badge the host in the roster
   *  drawer. Non-secret (just a player id, like pending_host_player_id). Populated by
   *  migration 20260718140000 + host-seat writes; undefined until added to GAME_SELECT. */
  host_player_id?: string | null
  rounds_count: number
  timer_seconds: number
  /** Scrabble — which word list to validate plays against (default 'enable'). */
  scrabble_dictionary_id?: string | null
  /** Scrabble — 'standard' (per-turn timer / whole-game cap) or 'chess' (per-player time bank). */
  scrabble_clock_mode?: 'standard' | 'chess'
  /** Scrabble chess-clock mode — each player's time bank in seconds (0 = unused). */
  scrabble_clock_seconds?: number
  /** Chess — host's default board theme / piece set (players may override locally). */
  chess_board_theme?: string | null
  chess_piece_set?: string | null
  /** Codewords — operative guess phase timer. */
  operative_timer_seconds?: number | null
  mafia_doctor_enabled?: boolean
  /** Real Detective — two-player same-team check. */
  mafia_detective_enabled?: boolean
  /** Single-target alignment reveal, formerly (mis)named Detective. */
  mafia_aura_seer_enabled?: boolean
  mafia_bodyguard_enabled?: boolean
  mafia_mayor_enabled?: boolean
  mafia_vigilante_enabled?: boolean
  mafia_tracker_enabled?: boolean
  mafia_alpha_wolf_enabled?: boolean
  mafia_wolf_cub_enabled?: boolean
  mafia_framer_enabled?: boolean
  mafia_jester_enabled?: boolean
  mafia_serial_killer_enabled?: boolean
  mafia_arsonist_enabled?: boolean
  mafia_cupid_enabled?: boolean
  mafia_cursed_villager_enabled?: boolean
  mafia_medium_enabled?: boolean
  mafia_priest_enabled?: boolean
  mafia_witch_enabled?: boolean
  mafia_little_girl_enabled?: boolean
  mafia_trapper_enabled?: boolean
  /** Village Seer toggle — full role reveal (stronger than Aura Seer). */
  mafia_seer_enabled?: boolean
  /** Mafia-team Seer toggle — full role reveal, can resign into Regular Mafia. */
  mafia_mafia_seer_enabled?: boolean
  mafia_red_lady_enabled?: boolean
  mafia_anonymous_votes?: boolean
  /** Single Classic/Advanced switch — replaces individually toggling most optional roles.
   *  See resolveMafiaRoundToggles() in src/lib/mafia.ts for exactly what this changes. */
  mafia_advanced_mode?: boolean
  mafia_count?: number | null
  /** player_id -> role from the last round played in this room — used to bias the next role
   *  assignment away from repeating anyone's exact same role on Play Again. */
  mafia_last_roles?: Record<string, MafiaRole> | null
  mafia_day_seconds?: number
  mafia_voting_seconds?: number
  monopoly_double_go_salary?: boolean
  monopoly_forced_auctions?: boolean
  monopoly_auction_timer_seconds?: number | null
  monopoly_no_rent_in_jail?: boolean
  monopoly_estate_dividend?: boolean
  monopoly_board_size?: 40 | 48
  anonymous: boolean
  auto_reveal: boolean
  auto_submit_behavior: AutoSubmitBehavior
  participant_mode: ParticipantMode
  participant_filter: 'all' | 'joined'
  pair_vote_mode: PairVoteMode
  question_source?: QuestionSource
  custom_questions?: unknown[] | null
  /** WYR / MLT / This or That: allow players to submit questions. People poll games: allow name submissions. */
  player_questions_enabled?: boolean
  /** Order to mix player submissions with uploaded/platform questions when the game starts. */
  player_questions_order?: PlayerQuestionsOrder
  game_type: GameType
  theme?: ThemeId
  status: GameStatus
  /** When true, the game is listed in /browse (discoverable). Default false = code-only. */
  is_public?: boolean
  /** Discovery Phase A — bumped on lobby activity; drives the stale-lobby close cron. */
  last_activity_at?: string | null
  /** Discovery Phase C — when a scheduled game is set to open. Null for immediate games. */
  scheduled_at?: string | null
  /** Discovery Phase C — stamped when scheduled → waiting. */
  opened_at?: string | null
  /** Discovery Phase A — stamped once when the host got the T-13min warning (one bite per game). */
  host_idle_warning_sent_at?: string | null
  /** Discovery Phase A — how the lobby ended ("idle_timeout", null, …). */
  result_reason?: string | null
  /** When true, the host has enabled in-game Spotify music for this room (default off). */
  music_enabled?: boolean
  /** Play Again · same settings — true while the post-game ready-up ring is armed (Whot). */
  replay_pending?: boolean
  current_round_number: number
  created_at: string
  /** When the game session ended (status set to finished). */
  finished_at?: string | null
  /** Anonymous room — when the live session started (15 min cap). */
  session_started_at?: string | null
  /** Lobby cap for joiner modes (anonymous 2–20, bingo 2–30, codewords 4–20). */
  max_players?: number | null
  /** When false, players cannot join as spectators after the game starts. */
  allow_viewers?: boolean
  /** When allow_viewers is true: false = watch-only late join; true = late joiners may play. */
  allow_late_players?: boolean
  /** Anonymous room — last time a batch of old messages was trimmed. */
  anonymous_messages_trimmed_at?: string | null
  wst_quote_source?: WstQuoteSource
  custom_slots?: CustomSlotsConfig | null
  /** When true, rounds use same-gender groups and opposite-gender voting. Default true for SMK/pair, false for custom. */
  gender_based?: boolean
  /** Codewords — when false, only the host assigns teams and roles in the lobby. */
  codewords_player_picks?: boolean
  /** Codewords — allow new players to join after the game has started. */
  codewords_late_join?: boolean
  /** Codewords — host picks spymasters only; operatives are shuffled onto teams at start. */
  codewords_randomize_teams?: boolean
  /** Describe It — number of teams (2-4). */
  describe_it_num_teams?: number
  /** Describe It — 'team' (teams race) or 'individual' (skribbl-style solo scoring). */
  describe_it_mode?: DescribeItMode
  /** Quick Draw — 'lie' (Drawful) or 'guess' (draw & guess charades). */
  quick_draw_variant?: QuickDrawVariant
  /** Quick Draw guess mode — team vs individual. */
  quick_draw_play_mode?: QuickDrawPlayMode
  /** Quick Draw guess mode — number of teams (2-4). */
  quick_draw_num_teams?: number
  /** Word Rush — 'team' (teams race the clock) or 'individual' (everyone answers each round). */
  word_rush_mode?: WordRushMode
  /** Word Rush — 'automatic' (system picks letters) or 'manual' (player/host picks letters). */
  word_rush_prompt_mode?: WordRushPromptMode
  /** Word Rush — number of teams (2-4). */
  word_rush_num_teams?: number
  /** Word Rush — standard (min 3 always) or hard (min length rises each round). */
  word_rush_difficulty?: WordRushDifficulty
  /** Cumulative usage across play-again sessions — unused pool items are prioritized next game. */
  pool_usage?: Record<string, unknown> | null
  /** Trivia — platform pool category when question_source is platform. */
  trivia_category?: TriviaCategory | null
  /** Bingo — manual host calls vs automatic number calling. */
  bingo_call_mode?: BingoCallMode | null
  /** Bingo — seconds between automatic number calls. */
  bingo_call_interval_seconds?: number | null
  /** Monopoly — max active session length in seconds; 0 = unlimited. */
  game_duration_seconds?: number | null
  /** Whot — include Pick 3 (5) cards and penalty stacking. */
  whot_pick3_enabled?: boolean
  /** Whot — include WHOT (20) wild cards in the deck. */
  whot_cards_enabled?: boolean
  /** Whot — allow calling a number when playing WHOT. */
  whot_number_calls_enabled?: boolean
  ai_questions_enabled?: boolean
  ai_questions_config?: AiQuestionsConfig | null
  ai_generated_questions?: AiGeneratedQuestions | null
  /** Whot — whether a Pick 2 can be stacked/defended (true) or must be drawn (false). */
  whot_pick2_stacking?: boolean
  /** Crazy Eights — enable 2/J/Q/A action cards (false = only the 8 is wild). */
  crazy8_action_cards?: boolean
  /** Crazy Eights — include 2 Jokers (wild + draw 4) in the deck. */
  crazy8_jokers?: boolean
  /** Crazy Eights — allow stacking/defending a Pick Two (2) instead of forcing the draw. */
  crazy8_pick2_stacking?: boolean
  /** UNO — allow challenging a Wild Draw Four (default on). */
  uno_wd4_challenge?: boolean
  /** UNO — cards drawn for a missed "UNO" call (2 or 4). */
  uno_uno_penalty?: number
  /** UNO — cards a failed challenger draws (4 base, 6 variant). */
  uno_wd4_challenge_penalty?: number
  /** UNO — 0 rotates all hands, 7 swaps hands (deferred toggle). */
  uno_zero_seven?: boolean
  /** UNO — allow stacking Draw Two on Draw Two / Draw Four on Draw Four (deferred toggle). */
  uno_stacking?: boolean
  /** UNO — allow laying multiple same-colour cards in one turn (deferred toggle). */
  uno_multi_play?: boolean
  /** UNO — Multi-Play grouping rule: 'off' | 'same_color' | 'same_number' | 'same_color_or_number'. */
  uno_multi_play_mode?: string
  /** UNO — 2v2 Team-Up mode (exactly 4 players). */
  uno_team_mode?: boolean
  /** UNO — Jump-In: play an exact-match card out of turn (deferred toggle). */
  uno_jump_in?: boolean
  /** UNO — top-level mode: 'classic' (default; uno_team_mode toggles Team-Up) or 'no_mercy'. */
  uno_mode?: 'classic' | 'no_mercy'
  /** UNO — No Mercy win condition: first player out or last player standing after Mercy knockouts. */
  uno_no_mercy_win?: 'first_out' | 'last_standing'
  /** UNO — optional series scoring (award points at hand end; first to target wins the series). */
  uno_series_scoring?: boolean
  /** UNO — points needed to win the series when scoring is on (default 1000). */
  uno_series_target?: number
  /** UNO — running per-player series totals (map playerId → int). */
  uno_series_scores?: Record<string, number> | null
  /** UNO — series winner id (set when someone first crosses uno_series_target). */
  uno_series_winner_id?: string | null
  /** Ludo — 'modern' (start + mid-arm safe stars) or 'traditional' (no track safe squares). */
  ludo_variant?: LudoVariant
  /** Ayo — 'traditional' (capture on 4, houses, match rounds) or 'oware' (2/3 seeds). */
  ayo_variant?: AyoVariant
  /** Mahjong — ruleset selected before the table starts. */
  mahjong_ruleset?: MahjongRuleset | null
  /** Mahjong — house rules and match-settlement options. */
  mahjong_rule_options?: MahjongRuleOptions | null
  /** Landmine — 'zero_points' (mine scores 0, all rounds) or 'elimination' (mine knocks you out). */
  landmine_mode?: LandmineMode | null
  /** Landmine — number of mines per round (1–3). */
  landmine_mine_count?: number | null
  /** Landmine — award +5 when nobody else gave your answer. */
  landmine_originality_bonus?: boolean | null
  /** Landmine — 'system' (server draws the mine) or 'manual' (a rotating player sets it). */
  landmine_mine_source?: LandmineMineSource | null
  /** Landmine — elimination time limit in seconds (game ends when the clock runs out). */
  landmine_elim_seconds?: number | null
  /** Landmine — whether the reviewer (round caller) checks verdicts before reveal. Default true. */
  landmine_review?: boolean | null
  /** Landmine — the review-window length in seconds (15/20/30/45/60). */
  landmine_review_seconds?: number | null
  /** Nigerian Draughts — opt-in "Street Rules" (huffing): decline a capture, risk the piece. */
  checkers_nigeria_street_rules?: boolean | null
  /** Ping Pong — points required to win the match (3, 5, 7, 11, 15, or 21). */
  ping_pong_points_to_win?: number | null
  /** Wordle Room — which built-in word bank the race draws from. */
  wordle_room_category?:
    | 'general_english'
    | 'naija_slang'
    | 'sports'
    | 'food'
    | 'animals'
    | 'technology'
    | 'nature'
    | 'music'
    | 'science'
    | 'clothing'
    | 'travel'
    | null
  /** Wordle Room — how many words make up the race (5 / 10 / 15 / 20). */
  wordle_room_word_count?: number | null
}

export type MonopolyPhase = 'roll' | 'buy' | 'jail' | 'pay_rent' | 'auction' | 'raise_funds' | 'finished'

export interface MonopolyPendingDebt {
  player_id: string
  creditor_player_id: string | null
  amount: number
  reason: string
  debt_type: 'rent' | 'tax' | 'card' | 'jail' | 'other'
  space_index?: number | null
  next_debts?: MonopolyPendingDebt[]
}

export interface MonopolyAuctionState {
  space_index: number
  high_bid: number
  high_bidder_id: string | null
  current_bidder_id: string
  passed: string[]
  eligible: string[]
  initiator_id: string
}

export interface MonopolyPendingTrade {
  from_player_id: string
  to_player_id: string
  offer_cash: number
  offer_properties: number[]
  offer_get_out_cards: number
  request_cash: number
  request_properties: number[]
  request_get_out_cards?: number
}

export interface MonopolyLastRentEvent {
  seq: number
  payer_player_id: string
  owner_player_id: string
  amount: number
  space_name: string
}

export interface MonopolyLastCardEvent {
  seq: number
  kind: 'chance' | 'community'
  drawn_by_player_id: string
  card_message: string
  effect: string
  amount?: number
  other_player_count?: number
}

export interface MonopolyLastCashEvent {
  seq: number
  player_id: string
  change: number
  balance_after: number
  label: string
  bankrupt?: boolean
}

export interface MonopolyLastTradeEvent {
  seq: number
  from_player_id: string
  to_player_id: string
  outcome: 'proposed' | 'declined' | 'accepted' | 'cancelled'
}

export interface MonopolyBoard {
  id: string
  game_id: string
  board_size?: 40 | 48
  turn_order: string[]
  current_turn_index: number
  phase: MonopolyPhase
  last_dice: { d1: number; d2: number; total: number; doubles: boolean } | null
  consecutive_doubles: number
  property_owners: Record<string, string>
  property_buildings: Record<string, number>
  mortgaged_properties: Record<string, boolean>
  houses_in_bank: number
  hotels_in_bank: number
  chance_deck: number[]
  community_deck: number[]
  chance_discard: number[]
  community_discard: number[]
  auction_state: MonopolyAuctionState | null
  pending_trade: MonopolyPendingTrade | null
  pending_debt: MonopolyPendingDebt | null
  pending_space: number | null
  status_message: string | null
  last_card_event: MonopolyLastCardEvent | null
  last_rent_event: MonopolyLastRentEvent | null
  last_cash_event: MonopolyLastCashEvent | null
  last_trade_event: MonopolyLastTradeEvent | null
  turn_deadline_at: string | null
  winner_player_id: string | null
  created_at: string
  updated_at: string
}

export interface MonopolyPlayerState {
  id: string
  game_id: string
  player_id: string
  position: number
  cash: number
  in_jail: boolean
  jail_turns: number
  get_out_of_jail_free: number
  bankrupt: boolean
  passed_go_once: boolean
  player_order: number
  created_at: string
}

export type YahtzeePhase = 'rolling' | 'finished'

export interface YahtzeeSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: YahtzeePhase
  dice: number[]
  held: boolean[]
  rolls_remaining: number
  rolls_this_turn: number
  status_message: string | null
  winner_player_id: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export type YahtzeeCategoryPoints = Record<YahtzeeCategory, number | null>

export interface YahtzeePlayerScore {
  id: string
  game_id: string
  player_id: string
  scores: {
    categories: YahtzeeCategoryPoints
    /** Count of Yahtzee Bonuses earned (each a flat +100). Absent on cards from before the rule. */
    bonusYahtzees?: number
    /** Whether a Joker-rule Yahtzee was scored this game. Not derivable from the final card. */
    jokerUsed?: boolean
  }
  player_order: number
  created_at: string
}

export type WhotShape = 'circle' | 'cross' | 'triangle' | 'square' | 'star' | 'whot'

export type WhotPhase = 'playing' | 'choose_whot' | 'finished'

export interface WhotCard {
  id: string
  shape: WhotShape
  number: number
}

export interface WhotSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: WhotPhase
  draw_pile: WhotCard[]
  discard_pile: WhotCard[]
  top_card: WhotCard | null
  required_shape: WhotShape | null
  required_number: number | null
  pick_two_stack: number
  pick_five_stack: number
  status_message: string | null
  winner_player_id: string | null
  /** Player ids in the order they emptied their hands. Drives final placement. */
  finish_order: string[]
  /** How many times the draw pile has been rebuilt from the discard. Capped
   *  at WHOT_RESHUFFLE_LIMIT — beyond that the game ends by lowest hand
   *  total instead of the deck spinning forever. */
  reshuffle_count: number
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface WhotPlayerHand {
  id: string
  game_id: string
  player_id: string
  /**
   * The player's cards. `null` means REDACTED (someone else's hand) — deliberately not `[]`,
   * because an empty array is meaningful state ("this player is out") and conflating the two
   * is what would make a redacted row read as a finished player. Use `card_count` for anyone
   * other than the local player. Server-side code always holds the real array.
   */
  cards: WhotCard[] | null
  /** How many cards the player holds. Public information, and survives redaction. */
  card_count?: number
  player_order: number
  created_at: string
}

export type CrazyEightsSuit = 'spades' | 'clubs' | 'hearts' | 'diamonds' | 'joker'

/** A demandable suit — what an 8 or Joker names for the next player. */
export type CrazyEightsCalledSuit = 'spades' | 'clubs' | 'hearts' | 'diamonds'

export type CrazyEightsPhase = 'playing' | 'choose_suit' | 'finished'

export interface CrazyEightsCard {
  id: string
  suit: CrazyEightsSuit
  /** Ace = 1 … King = 13. Jokers carry rank 0. */
  rank: number
}

export interface CrazyEightsSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  /** 1 = forward through turn_order, -1 = reversed (Queen flips it). */
  direction: number
  phase: CrazyEightsPhase
  draw_pile: CrazyEightsCard[]
  discard_pile: CrazyEightsCard[]
  top_card: CrazyEightsCard | null
  required_suit: CrazyEightsCalledSuit | null
  /** Stackable, defendable-with-a-2 penalty (Pick Two). */
  pick_two_stack: number
  /** Non-defendable forced draw left by a Joker. */
  joker_penalty: number
  status_message: string | null
  winner_player_id: string | null
  /** Player ids in the order they emptied their hands. Drives final placement. */
  finish_order: string[]
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface CrazyEightsPlayerHand {
  id: string
  game_id: string
  player_id: string
  cards: CrazyEightsCard[]
  player_order: number
  created_at: string
}

/** A playable UNO colour ('wild' is the colourless slot for Wild / Wild Draw Four cards). */
export type UnoCardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild'

/** A demandable colour — what a Wild / Wild Draw Four names for the next player. */
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue'

/** What a card does. Number cards carry `value` 0–9; everything else is an action.
 *  The last six kinds are No-Mercy-only cards; they never appear in a Classic deck. */
export type UnoCardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild_draw4'
  | 'discard_all'
  | 'skip_everyone'
  | 'draw6'
  | 'draw10'
  | 'wild_reverse_draw4'
  | 'wild_color_roulette'

export type UnoPhase =
  | 'playing'
  | 'choose_color'
  | 'challenge_window'
  | 'swap_target'
  | 'team_leave_decision'
  | 'color_roulette'
  | 'finished'

export interface UnoCard {
  id: string
  color: UnoCardColor
  kind: UnoCardKind
  /** 0–9 for number cards; omitted for action / wild cards. */
  value?: number
}

export interface UnoSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  /** 1 = forward through turn_order, -1 = reversed (Reverse flips it). */
  direction: number
  phase: UnoPhase
  /**
   * REDACTED from clients: anon/authenticated hold no SELECT on this column, because the ordered
   * deck plus your own hand reveals every opponent's hand (2 players) or every future draw (N).
   * Only service-role reads (src/lib/uno.ts) see it — hence optional. Clients use `draw_count`.
   */
  draw_pile?: UnoCard[]
  /** REDACTED from clients alongside `draw_pile` — see above. Clients use `discard_count`. */
  discard_pile?: UnoCard[]
  /** Public size of `draw_pile`. Generated stored column; counts leak no order or identity. */
  draw_count?: number
  /** Public size of `discard_pile`. Generated stored column. */
  discard_count?: number
  top_card: UnoCard | null
  /** Colour demanded by a played Wild / Wild Draw Four. */
  required_color: UnoColor | null
  /** Pending forced draw the current player must take (Draw Two / Draw Four target). */
  draw_penalty: number
  /** Which card can stack onto the pending penalty; null = must draw it. In No Mercy any
   *  Draw card (Draw2/4/6/10 or Wild Reverse Draw 4) of equal-or-higher value can stack. */
  draw_penalty_kind: 'draw2' | 'wild_draw4' | 'draw6' | 'draw10' | 'wild_reverse_draw4' | null
  /** No Mercy: players knocked out by the 25-card Mercy rule this round. */
  eliminated_player_ids?: string[]
  /** No Mercy: who chose the colour for a Wild Color Roulette (they draw until match). */
  color_roulette_player_id?: string | null
  /** No Mercy: reveals so far in the current Colour Roulette event (NULL when none in
   *  progress). Trophies for Roulette Master (>=5) / Executioner (>=8) key off this
   *  exact per-event count. */
  color_roulette_reveals?: number | null
  /** Id of the player who played the current top card — for High Stakes knockout attribution. */
  last_play_player_id?: string | null
  /** Draw-card stack chain depth so far — resets when the penalty resolves or a non-Draw plays. */
  draw_stack_chain?: number
  /** Set to the card the current player just drew while they may still play it or keep it (pass). */
  drawn_card_id: string | null
  /**
   * The exact cards laid in the most recent play, in play order (last = the visible top card).
   * >1 means a Multi-Play covered earlier cards (e.g. a Draw Two under a Skip); the client shows
   * the covered cards as a "played together" fan so buried effects stay visible. null / length 1
   * = nothing extra to surface.
   */
  last_play_cards?: UnoCard[] | null
  /** During `choose_color`, which wild is being coloured. */
  pending_wild: 'wild' | 'wild_draw4' | 'draw6' | 'draw10' | 'wild_reverse_draw4' | 'wild_color_roulette' | null
  /** Colour in effect immediately before a Wild Draw Four (for challenge reveal). */
  challenge_prev_color: UnoColor | null
  /** Who played the Wild Draw Four currently in `challenge_window`. */
  wd4_player_id: string | null
  /** Player who dropped to one card and still owes an "UNO" call. */
  uno_pending_player: string | null
  /** Whether `uno_pending_player` has satisfied their UNO call. */
  uno_called: boolean
  status_message: string | null
  winner_player_id: string | null
  /** Player ids in the order they emptied their hands. Drives final placement. */
  finish_order: string[]
  /** Team-Up: players who left mid-round — kept in turn_order (parity) but skipped by play + placement. */
  left_player_ids?: string[]
  /** Team-Up: the remaining teammate who must choose continue-solo vs forfeit (phase team_leave_decision). */
  team_decider_id?: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface UnoPlayerHand {
  id: string
  game_id: string
  player_id: string
  /**
   * The player's cards. `null` means REDACTED (someone else's hand) — deliberately not `[]`,
   * because an empty array is meaningful state ("this player is out") and conflating the two
   * is what would make a redacted row read as a finished player. Use `card_count` for anyone
   * other than the local player (Team-Up: your teammate's cards also come back in full).
   * Server-side code always holds the real array.
   */
  cards: UnoCard[] | null
  /** How many cards the player holds. Public information, and survives redaction. */
  card_count?: number
  player_order: number
  created_at: string
}

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue'
export type LudoPieceZone = 'base' | 'track' | 'home' | 'finished'
export type LudoPhase = 'roll' | 'move' | 'finished'
export type LudoVariant = 'modern' | 'traditional'

export type AyoVariant = 'traditional' | 'oware'

export interface LudoDiceRoll {
  d1: number
  d2: number
  total: number
  doubles: boolean
}

export interface LudoPiece {
  id: number
  zone: LudoPieceZone
  /** Base yard: 0–3 (home circle). Track: 0–51. Home lane: 0–4 before finish. */
  pos: number
}

export interface LudoSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: LudoPhase
  last_dice: LudoDiceRoll | null
  /** Die values still to play this turn, e.g. [6, 3] after rolling 6+3. */
  remaining_dice: number[] | null
  consecutive_sixes: number
  extra_turn: boolean
  status_message: string | null
  winner_player_id: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface LudoPlayerState {
  id: string
  game_id: string
  player_id: string
  color: LudoColor
  pieces: LudoPiece[]
  player_order: number
  created_at: string
}

export type MahjongSeat = 'east' | 'south' | 'west' | 'north'
export type MahjongPhase = 'draw' | 'discard' | 'claim' | 'finished'
export type MahjongMeldType = 'chow' | 'pung' | 'kong'
export type MahjongClaimType = 'mahjong' | MahjongMeldType
export type MahjongWinType = 'self_draw' | 'discard'
export type MahjongRuleset = 'fate_round' | 'hong_kong' | 'riichi' | 'mcr'
export type MahjongWinningPattern =
  | 'standard'
  | 'seven_pairs'
  | 'thirteen_orphans'
  | 'knitted_straight'
  | 'greater_honors_knitted'
  | 'lesser_honors_knitted'
export type MahjongHandResult = 'win' | 'exhaustive_draw' | 'abortive_draw' | 'chombo'

export interface MahjongRuleOptions {
  matchLength?: 'east' | 'hanchan'
  startingScore?: number
  returnScore?: number
  bankruptcyEndsMatch?: boolean
  agariYame?: boolean
  okaEnabled?: boolean
  uma?: [number, number, number, number]
  doubleYakuman?: boolean
  kazoeYakuman?: boolean
  kiriageMangan?: boolean
  openTanyao?: boolean
  redFives?: boolean
  abortiveDraws?: boolean
  nagashiMangan?: boolean
  renhou?: 'off' | 'mangan' | 'yakuman'
  chomboPenalty?: 'mangan' | 'none'
  hongKongMinimumFan?: number
  hongKongLimitFan?: number
  mcrMinimumPoints?: number
}

export interface MahjongScoreLine {
  label: string
  fan: number
  detail?: string
}

export interface MahjongScorePayment {
  player_id: string
  delta: number
  reason: string
}

export interface MahjongScoreSummary {
  ruleset: MahjongRuleset
  pattern: MahjongWinningPattern
  fan: number
  yaku_fan?: number
  yakuman?: number
  limit?: string | null
  fu?: number | null
  base_points: number
  total_points: number
  lines: MahjongScoreLine[]
  payments: MahjongScorePayment[]
  payer_player_id?: string | null
  winner_player_ids?: string[]
  honba?: number
  riichi_sticks?: number
}

export interface MahjongDiscard {
  tile: string
  player_id: string
  claimed_by_player_id?: string | null
  claimed_as?: MahjongClaimType | null
  riichi_declared?: boolean
}

export interface MahjongMeld {
  type: MahjongMeldType
  tiles: string[]
  claimed_tile?: string | null
  from_player_id?: string | null
  concealed?: boolean
  added?: boolean
}

export interface MahjongLastDiscard {
  tile: string
  player_id: string
  discard_index: number
}

export interface MahjongSession {
  id: string
  game_id: string
  ruleset: MahjongRuleset
  turn_order: string[]
  dealer_index: number
  current_turn_index: number
  phase: MahjongPhase
  wall: string[]
  dead_wall?: string[]
  dora_indicators?: string[]
  ura_dora_indicators?: string[]
  honba?: number
  riichi_sticks?: number
  round_wind?: MahjongSeat
  hand_number?: number
  last_action?: 'draw' | 'discard' | 'claim' | 'kong' | 'riichi' | null
  hand_result?: MahjongHandResult | null
  rule_options?: MahjongRuleOptions | null
  rinshan_player_id?: string | null
  chankan_player_id?: string | null
  ippatsu_eligible_player_ids?: string[]
  exhaustive_draw_tenpai_player_ids?: string[]
  scores?: Record<string, number>
  discard_pile: MahjongDiscard[]
  last_discard: MahjongLastDiscard | null
  claim_passes: string[]
  status_message: string | null
  winner_player_id: string | null
  winner_player_ids?: string[]
  winning_tile: string | null
  win_type: MahjongWinType | null
  score_summary?: MahjongScoreSummary | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface MahjongPlayerState {
  id: string
  game_id: string
  player_id: string
  seat: MahjongSeat
  hand: string[]
  hand_count?: number
  last_drawn_tile?: string | null
  flowers?: string[]
  riichi_declared?: boolean
  riichi_discard_index?: number | null
  temporary_furiten?: boolean
  permanent_furiten?: boolean
  melds: MahjongMeld[]
  discarded: string[]
  player_order: number
  created_at: string
}

export type SnakeLadderColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'
export type SnakeLadderPhase = 'roll' | 'finished'
/** Outcome of the most recent roll, for board highlighting and the activity feed. */
export type SnakeLadderEvent = 'start' | 'move' | 'ladder' | 'snake' | 'overshoot' | 'bust' | 'win'

export interface SnakeLadderSession {
  id: string
  game_id: string
  turn_order: string[]
  current_turn_index: number
  phase: SnakeLadderPhase
  /** Pips of the most recent die roll (1–6), or null before the first roll. */
  last_roll: number | null
  /** Square the mover started from this roll. */
  last_from: number | null
  /** Square the mover ended on after any snake/ladder jump. */
  last_to: number | null
  last_event: SnakeLadderEvent | null
  /** Who the last roll belonged to — used to animate the right token. */
  last_player_id: string | null
  /** Consecutive sixes by the current roller; a third six busts the turn. */
  consecutive_sixes: number
  status_message: string | null
  winner_player_id: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface SnakeLadderPlayerState {
  id: string
  game_id: string
  player_id: string
  color: SnakeLadderColor
  /** 0 = off the board (not yet started); 1–100 on the board; 100 = home. */
  position: number
  player_order: number
  created_at: string
}

export type TicTacToeMark = 'X' | 'O'

/** Result of a single sub-board: a winning mark, a filled draw, or still in play. */
export type TicTacToeBoardResult = TicTacToeMark | 'draw' | null

export interface TicTacToeSession {
  id: string
  game_id: string
  player_x_id: string
  player_o_id: string
  /** 81 cells — nine 3x3 sub-boards laid out row-major (sub-board = floor(i/9), cell = i%9). */
  board: (TicTacToeMark | null)[]
  /** Outcome of each of the 9 sub-boards. */
  board_winners: TicTacToeBoardResult[]
  /** Sub-board (0-8) the current player must play in, or null to play anywhere. */
  active_board: number | null
  current_turn_mark: TicTacToeMark
  status: 'active' | 'finished'
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface PingPongSession {
  id: string
  game_id: string
  player_x_id: string
  player_o_id: string
  score_x: number
  score_o: number
  points_to_win: number
  status: 'active' | 'finished'
  winner_player_id: string | null
  status_message: string | null
  created_at: string
  updated_at: string
}

export type ChessColor = 'w' | 'b'

export interface ChessSession {
  id: string
  game_id: string
  player_white_id: string
  player_black_id: string
  /** Current position in Forsyth–Edwards Notation. */
  fen: string
  /** Full move history in Portable Game Notation. */
  pgn: string
  current_turn: ChessColor
  /** Remaining clock for each player in milliseconds; null when the game is untimed. */
  white_time_ms: number | null
  black_time_ms: number | null
  /** When the player on the move started their clock — used to compute elapsed time. */
  turn_started_at: string | null
  /** Squares of the most recent move, for highlighting (e.g. 'e2' -> 'e4'). */
  last_move_from: string | null
  last_move_to: string | null
  in_check: boolean
  status: 'active' | 'finished'
  /** checkmate | stalemate | threefold | insufficient | fifty_move | timeout | resignation */
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export type CheckersColor = 'r' | 'b'

export interface CheckersSession {
  id: string
  game_id: string
  player_red_id: string
  player_black_id: string
  /**
   * 64-char board, indexed by row*8 + col (row 0 = top, col 0 = left). Only dark
   * squares are occupied. '.' empty, 'r'/'b' man, 'R'/'B' king. Black moves first.
   */
  board: string
  current_turn: CheckersColor
  /** Consecutive king-only, non-capture plies — drives the 40-move draw rule. */
  move_count: number
  /** Occurrences of each "<board>:<turn>" position; drives threefold-repetition draws. */
  position_counts: Record<string, number>
  /** Square id ('rc') a multi-jump must continue from; null when no chain is active. */
  must_continue_from: string | null
  /** Remaining clock for each player in milliseconds; null when the game is untimed. */
  red_time_ms: number | null
  black_time_ms: number | null
  /** When the player on the move started their clock — used to compute elapsed time. */
  turn_started_at: string | null
  /** Squares of the most recent hop, for highlighting. */
  last_move_from: string | null
  last_move_to: string | null
  status: 'active' | 'finished'
  /** capture_all | no_moves | draw_moves | timeout | resignation */
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export type Draughts10Variant = 'international' | 'nigeria'

export interface Draughts10Session {
  id: string
  game_id: string
  variant: Draughts10Variant
  player_red_id: string
  player_black_id: string
  /**
   * 100-char board, indexed by row*10 + col (row 0 = top, col 0 = left). Only dark
   * squares are occupied. '.' empty, 'r'/'b' man, 'R'/'B' king (flying). Black moves first.
   */
  board: string
  current_turn: CheckersColor
  /** Consecutive king-only, non-capture plies — drives the 25-move draw rule (50 plies). */
  move_count: number
  /** Occurrences of each "<board>:<turn>" position; drives threefold-repetition draws. */
  position_counts: Record<string, number>
  /** Square id ('rc') a multi-jump must continue from; null when no chain is active. */
  must_continue_from: string | null
  /** Captures still required to complete the majority-rule sequence in progress. */
  must_continue_remaining: number | null
  /** Nigeria-only opt-in "street rules" (huffing) room setting. */
  huffing_enabled: boolean
  /**
   * Squares of the mover's own pieces that had a capture available but went unplayed
   * (Street Rules only) — the opponent may "huff" one of these instead of moving.
   */
  huffable_squares: string[]
  /** Remaining clock for each player in milliseconds; null when the game is untimed. */
  red_time_ms: number | null
  black_time_ms: number | null
  /** When the player on the move started their clock — used to compute elapsed time. */
  turn_started_at: string | null
  /** Squares of the most recent hop, for highlighting. */
  last_move_from: string | null
  last_move_to: string | null
  status: 'active' | 'finished'
  /** capture_all | no_moves | draw_moves | timeout | resignation */
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export type AyoSide = 'a' | 'b'

export interface AyoSession {
  id: string
  game_id: string
  player_a_id: string
  player_b_id: string
  /** 12 pits — indices 0–5 side A, 6–11 side B. Anti-clockwise sowing. */
  pits: number[]
  captured_a: number
  captured_b: number
  /** Houses won in the current deal (traditional mode). */
  houses_a: number
  houses_b: number
  /** Match round number (traditional multi-round play). */
  match_round: number
  /** Active houses per side (0–6); shrinks when the opponent wins a round. */
  a_row_size: number
  b_row_size: number
  current_turn: AyoSide
  a_win_streak: number
  b_win_streak: number
  a_time_ms: number | null
  b_time_ms: number | null
  turn_started_at: string | null
  last_pit: number | null
  status: 'active' | 'finished'
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean
  status_message: string | null
  turn_deadline_at: string | null
  /** Per-game trophy accumulators (migration 20260812040000). See src/lib/trophies/game-facts/ayo.ts. */
  a_stats?: AyoStats
  b_stats?: AyoStats
  created_at: string
  updated_at: string
}

/**
 * One seat's per-game trophy accumulator, kept on the `ayo_sessions` row. All keys optional,
 * absent == 0. Reset each game by `initializeAyoGame`. See migration 20260812040000.
 */
export interface AyoStats {
  /** This seat's completed moves this game. */
  moves?: number
  /** Of those, how many captured a house (completed exactly four). */
  capturing_moves?: number
  /** 0/1 — did this seat's MOST RECENT move capture (for the final-move win trophy). */
  last_capture?: number
  /** Bitmask of local houses (0–5) this seat has sowed from; 63 == all six. */
  sown_mask?: number
  /** Most seeds moved in a single move, relay laps included (a full lap == 12). */
  max_sown?: number
  /** Largest (opponent captured − this seat captured) seen after any move. */
  worst_deficit?: number
}

export type DescribeItPhase = 'turn' | 'break' | 'finished'

/** Team = current behaviour (teams race). Individual = skribbl-style solo scoring + leaderboard. */
export type DescribeItMode = 'team' | 'individual'

export interface DescribeItSession {
  id: string
  game_id: string
  mode: DescribeItMode
  num_teams: number
  total_rounds: number
  turn_seconds: number
  phase: DescribeItPhase
  /** 0-based index into the full turn order (team: num_teams * rounds, individual: players * rounds). */
  turn_index: number
  current_round: number
  active_team: number
  describer_player_id: string | null
  /** Ordered player ids that take turns describing (individual mode only). */
  roster: string[]
  current_word: string | null
  current_clue: string | null
  /** All clues given for the current word (reset each word). */
  current_clues: string[]
  used_words: string[]
  turn_deadline_at: string | null
  break_deadline_at: string | null
  status: 'active' | 'finished'
  status_message: string | null
  created_at: string
  updated_at: string
}

export interface DescribeItPlayer {
  id: string
  game_id: string
  player_id: string
  team: number
  /** Running individual-mode score. */
  score: number
  created_at: string
}

export interface DescribeItWord {
  id: string
  game_id: string
  turn_index: number
  round: number
  team: number
  describer_player_id: string | null
  word: string
  clue: string | null
  status: 'guessed' | 'skipped'
  guesser_player_id: string | null
  created_at: string
}

export interface DescribeItGuess {
  id: string
  game_id: string
  turn_index: number
  player_id: string
  team: number
  text: string
  correct: boolean
  /** Points earned for a correct guess (individual mode speed scoring). */
  points: number
  created_at: string
}

// ── Word Rush ──

export type WordRushPhase = 'playing' | 'awaiting_prompt' | 'intermission' | 'finished'
export type WordRushMode = 'team' | 'individual'
export type WordRushPromptMode = 'automatic' | 'manual'
export type WordRushDifficulty = 'standard' | 'hard'

export interface WordRushSession {
  id: string
  game_id: string
  mode: WordRushMode
  prompt_mode: WordRushPromptMode
  difficulty: WordRushDifficulty
  min_word_length: number
  num_teams: number
  total_rounds: number
  turn_seconds: number
  phase: WordRushPhase
  turn_index: number
  current_round: number
  active_team: number
  prompt_setter_player_id: string | null
  roster: string[]
  start_letter: string | null
  end_letter: string | null
  prompt_index: number
  used_pairs: string[]
  turn_deadline_at: string | null
  intermission_deadline_at: string | null
  status: 'active' | 'finished'
  status_message: string | null
  created_at: string
  updated_at: string
}

export interface WordRushPlayer {
  id: string
  game_id: string
  player_id: string
  team: number
  score: number
  created_at: string
}

export interface WordRushAnswer {
  id: string
  game_id: string
  turn_index: number
  round: number
  team: number
  team_turn_index: number | null
  prompt_index: number
  start_letter: string
  end_letter: string
  player_id: string
  text: string
  correct: boolean
  created_at: string
}

// ── Scrabble ──
/** A single board cell. null when empty, else a placed tile. */
export interface ScrabbleBoardCell {
  /** Resolved letter A–Z. For a blank tile, this is the letter the player chose. */
  letter: string
  /** True if this came from a blank tile (always scores 0). */
  isBlank: boolean
}

/** 15×15 grid, row-major. board[row][col]. */
export type ScrabbleBoard = (ScrabbleBoardCell | null)[][]

/** A tile the mover is placing this turn. letter is A–Z (chosen letter for a blank). */
export interface ScrabblePlacedTile {
  row: number
  col: number
  letter: string
  isBlank: boolean
}

/** Summary of the last action, for board highlighting and the activity log. */
export interface ScrabbleLastMove {
  player_id: string
  kind: 'play' | 'exchange' | 'pass'
  words: string[]
  score: number
  /** Cells newly filled this turn (for highlight). Empty for exchange/pass. */
  tiles: { row: number; col: number }[]
}

export interface ScrabbleSession {
  id: string
  game_id: string
  /** Player ids in seating/turn order. */
  turn_order: string[]
  current_turn_index: number
  board: ScrabbleBoard
  /** Remaining tiles in the bag; '?' represents a blank. */
  bag: string[]
  phase: 'playing' | 'finished'
  /** Number of consecutive scoreless turns (pass/exchange); game ends at 2×players. */
  consecutive_passes: number
  last_move: ScrabbleLastMove | null
  winner_player_id: string | null
  is_tie: boolean
  status_message: string | null
  turn_deadline_at: string | null
  /** 'standard' (per-turn timer) or 'chess' (per-player time bank). Snapshot of the game's mode. */
  clock_mode: 'standard' | 'chess'
  /** Chess-clock mode — when the current active player's clock started ticking. Null in standard mode. */
  turn_started_at: string | null
  created_at: string
  updated_at: string
}

export interface ScrabblePlayerState {
  id: string
  game_id: string
  player_id: string
  /** Up to 7 tiles on the rack; '?' represents a blank. */
  rack: string[]
  score: number
  player_order: number
  /** Chess-clock mode — remaining time bank in ms. Null in standard mode. */
  clock_ms_remaining: number | null
  /** Chess-clock mode — true once this player's clock hit zero (spectating, seat skipped). */
  timed_out: boolean
  created_at: string
}

export interface TriviaQuestion {
  question: string
  choices: string[]
  correctIndex: number
  category: TriviaCategory
}

export interface TriviaMetadata {
  question: string
  choices: string[]
  correct_index: number
  category: TriviaCategory
}

export interface TriviaAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  choice_index: number
  is_correct: boolean
  answered_at: string
  response_ms: number
  points: number
}

export interface TtlMetadata {
  statements: [string, string, string]
  lie_index: number
}

export interface TtlStatement {
  id: string
  game_id: string
  player_id: string
  statement_a: string
  statement_b: string
  statement_c: string
  lie_index: number
  created_at: string
  updated_at: string
}

export interface TtlGuess {
  id: string
  game_id: string
  round_id: string
  player_id: string
  guessed_index: number
  is_correct: boolean
  points: number
  guessed_at: string
}

export interface QuiplashMetadata {
  prompt: string
}

export type QuiplashPhase = 'writing' | 'voting' | 'reveal' | 'finished'

export interface QuiplashSession {
  id: string
  game_id: string
  phase: QuiplashPhase
  battle_index: number
  active_battle_id: string | null
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface QuiplashAnswer {
  id: string
  game_id: string
  round_id: string
  player_id: string
  text: string
  is_bye: boolean
  submitted_at: string
}

export interface QuiplashBattle {
  id: string
  game_id: string
  round_id: string
  battle_number: number
  answer_a_id: string
  answer_b_id: string
  winner_answer_id: string | null
  points_awarded: number
  status: 'pending' | 'active' | 'finished'
  started_at: string | null
  ended_at: string | null
}

export interface QuiplashVote {
  id: string
  game_id: string
  battle_id: string | null
  round_id: string | null
  player_id: string
  chosen_answer_id: string
  voted_at: string
}

export interface QuickDrawMetadata {
  round_number: number
}

export type QuickDrawPhase = 'drawing' | 'titling' | 'voting' | 'reveal' | 'finished'

export interface QuickDrawSession {
  id: string
  game_id: string
  phase: QuickDrawPhase
  drawing_index: number
  turn_deadline_at: string | null
  created_at: string
  updated_at: string
}

export interface QuickDrawAssignment {
  id: string
  game_id: string
  round_id: string
  player_id: string
  prompt: string
  created_at: string
}

export interface QuickDrawStroke {
  color: string
  width: number
  points: [number, number][]
  /** Omit for pen strokes; eraser uses destination-out when replayed. */
  tool?: 'pen' | 'eraser'
}

export interface QuickDrawDrawingStrokeData {
  width: number
  height: number
  strokes: QuickDrawStroke[]
}

export interface QuickDrawDrawing {
  id: string
  game_id: string
  round_id: string
  player_id: string
  stroke_data: QuickDrawDrawingStrokeData
  submitted_at: string
}

export interface QuickDrawTitle {
  id: string
  game_id: string
  drawing_id: string
  player_id: string | null
  text: string
  is_real: boolean
  submitted_at: string
}

export interface QuickDrawVote {
  id: string
  game_id: string
  drawing_id: string
  player_id: string
  chosen_title_id: string
  voted_at: string
}

export type QuickDrawVariant = 'lie' | 'guess'
export type QuickDrawPlayMode = 'team' | 'individual'

export type QuickDrawGuessPhase = 'turn' | 'break' | 'finished'

export interface QuickDrawGuessSession {
  id: string
  game_id: string
  mode: QuickDrawPlayMode
  num_teams: number
  total_rounds: number
  turn_seconds: number
  roster: string[]
  phase: QuickDrawGuessPhase
  turn_index: number
  current_round: number
  active_team: number
  drawer_player_id: string | null
  current_word: string | null
  current_stroke_data: QuickDrawDrawingStrokeData
  used_words: string[]
  turn_deadline_at: string | null
  break_deadline_at: string | null
  status: 'active' | 'finished'
  status_message: string | null
  created_at: string
  updated_at: string
}

export interface QuickDrawGuessPlayer {
  id: string
  game_id: string
  player_id: string
  team: number
  score: number
  created_at: string
}

export interface QuickDrawGuessWord {
  id: string
  game_id: string
  turn_index: number
  round: number
  team: number
  drawer_player_id: string | null
  word: string
  status: 'guessed' | 'skipped'
  guesser_player_id: string | null
  created_at: string
}

export interface QuickDrawGuessGuess {
  id: string
  game_id: string
  turn_index: number
  player_id: string
  team: number
  text: string
  correct: boolean
  points: number
  created_at: string
}

export interface Participant {
  id: string
  game_id: string
  name: string
  gender: ParticipantGender
  photo_url: string | null
  description: string | null
  display_order: number
  /** MLT import mode: host adds names from the list into the poll. */
  in_mlt_poll?: boolean | null
  /** Player-submitted name for people-based poll games (RFGF, SMK, etc.). */
  submitted_by_player_id?: string | null
}

export interface Player {
  id: string
  game_id: string
  name: string
  /** Who can vote: opposite-gender rule; `both` = every round. */
  gender: PlayerGender
  /** Male or female — shown in lobby, separate from vote preference. */
  identity_gender: ParticipantGender | null
  /** Import mode: which list name was claimed. */
  participant_id: string | null
  joined_at: string
  /** Read-only spectator (explicit choice or inferred for poll-game late join). */
  spectator?: boolean
  /** Monopoly board token id (car, hat, dog, …). */
  monopoly_token?: string | null
  /** Short code to resume this player on another device. */
  resume_token?: string | null
  /** True when player has been eliminated (elimination mode). */
  is_eliminated?: boolean
  /** When the player was eliminated. */
  eliminated_at?: string | null
  /** Remaining lives (lives mode only, null otherwise). */
  lives_remaining?: number | null
  /**
   * True when this player row is a bot (bots-in-room, Phase 1). The client uses
   * it to render the 🤖 chip in the roster and gate the "Add bot" affordance;
   * the server uses it to drive the bot's turns via game-tick. Defaults false
   * for every existing row (see migration 20260925120000_players_is_bot.sql).
   */
  is_bot?: boolean
}

export interface Round {
  id: string
  game_id: string
  round_number: number
  participant_ids: string[]
  wyr_option_a: string | null
  wyr_option_b: string | null
  mlt_question: string | null
  submitter_player_id: string | null
  quote_text: string | null
  quote_author_participant_id: string | null
  quote_submitted_at: string | null
  status: RoundStatus
  started_at: string | null
  ended_at: string | null
  anime_metadata?: AnimeMetadata | null
  trivia_metadata?: TriviaMetadata | null
  ttl_metadata?: TtlMetadata | null
  npat_metadata?: NpatMetadata | null
  landmine_metadata?: LandmineMetadata | null
  quiplash_metadata?: QuiplashMetadata | null
  quick_draw_metadata?: QuickDrawMetadata | null
}

export type PairFlag = 'kiss' | 'kill'
export type PairAssignmentMap = Record<string, PairFlag | null>

export interface Vote {
  id: string
  player_id: string
  round_id: string
  game_id: string
  kiss_participant_id: string | null
  marry_participant_id: string | null
  kill_participant_id: string | null
  pair_assignments: Record<string, PairFlag> | null
  wyr_choice: WyrChoice | null
  target_player_id: string | null
  target_participant_id: string | null
  anime_choice?: string | null
  picked_number?: number | null
  /** Who Said This speed scoring: how quickly the answer came in, and the points it earned. */
  response_ms?: number | null
  points?: number | null
  created_at: string
}

export interface VoteAssignment {
  kiss: string | null
  marry: string | null
  kill: string | null
}

export interface Confession {
  id: string
  game_id: string
  round_id: string | null
  text: string
  created_at: string
}

export interface AnonymousMessage {
  id: string
  game_id: string
  player_id: string
  player_name?: string
  text: string
  created_at: string
  reply_to_id?: string | null
  reply_to_text?: string | null
  message_type?: 'text' | 'gif'
  media_url?: string | null
}

export interface AnonymousRoomBan {
  id: string
  game_id: string
  player_id: string
  banned_until: string
  created_at: string
}

/** Lobby quote submission for Who Said This — players can add multiple quotes before the game starts. */
export interface WstQuotePoolEntry {
  id: string
  game_id: string
  player_id: string | null
  quote_text: string
  /** Trivia-style answer options the submitter supplied (2–4). */
  options: string[] | null
  /** Index into `options` of the correct answer. */
  correct_index: number | null
  /** Legacy (name-list model) — unused by the current players-submit flow. */
  author_participant_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Choice-round metadata for Who Said This: a quote whose author is guessed from a fixed
 * set of string `choices` (rather than from the players in the room). `source: 'anime'` is
 * the legacy auto-fetched pool; `source: 'deck'` is a host-provided Pre-set roster deck
 * (Platform / Library / uploaded CSV). `anime_name` doubles as the deck's optional category
 * label (e.g. "Harry Potter"). A round with this metadata present is a choice round
 * (see `isAnimeRound`), regardless of source.
 */
export interface AnimeMetadata {
  source: 'anime' | 'deck'
  anime_name: string
  correct_character: string
  choices: string[]
}

export interface AnimeQuotePoolEntry {
  id: string
  game_id: string
  quote_text: string
  anime_name: string
  correct_character: string
  choices: string[]
  removed: boolean
  created_at: string
}

// 'player' = Join & play (players submit quotes about themselves; guess who in the room).
// 'deck' = Pre-set roster (host-provided quote+answer deck; guess the character from choices).
// 'anime'/'both' are the legacy auto-fetch sources, retained for back-compat while that path
// is migrated into Library decks.
export type WstQuoteSource = 'player' | 'anime' | 'both' | 'deck'

export interface BingoCard {
  id: string
  game_id: string
  player_id: string
  cells: number[]
  marked_indices: number[]
  created_at: string
}

export interface BingoCalledNumber {
  id: string
  game_id: string
  number: number
  called_at: string
}

export interface BingoClaim {
  id: string
  game_id: string
  player_id: string
  pattern: 'line' | 'full_house'
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// --- MAFIA TYPES ---
export type MafiaRole =
  | 'villager'
  | 'doctor'
  | 'detective'
  | 'bodyguard'
  | 'mayor'
  | 'vigilante'
  | 'tracker'
  | 'mafia'
  | 'alpha_wolf'
  | 'wolf_cub'
  | 'framer'
  | 'jester'
  | 'serial_killer'
  | 'arsonist'
  | 'cupid'
  | 'cursed_villager'
  | 'medium'
  | 'priest'
  | 'witch'
  | 'little_girl'
  | 'trapper'
  | 'aura_seer'
  | 'seer'
  | 'mafia_seer'
  | 'red_lady'
export type MafiaTeam = 'village' | 'mafia' | 'jester' | 'serial_killer' | 'arsonist'
export type MafiaDeathCause =
  | 'mafia_kill'
  | 'village_vote'
  | 'serial_kill'
  | 'arson'
  | 'vigilante_kill'
  | 'witch_kill'
  | 'trap_kill'
  | 'red_lady_death'
export type MafiaPhase = 'role_reveal' | 'night' | 'day_report' | 'day' | 'voting' | 'elimination' | 'game_over'

export interface MafiaRoleEnabledFlags {
  doctor_enabled: boolean
  /** Wolvesville's actual "Detective" — checks two players each night for same-team membership. */
  detective_enabled: boolean
  /** The single-target alignment-reveal role, formerly (mis)named Detective on this platform. */
  aura_seer_enabled: boolean
  bodyguard_enabled: boolean
  mayor_enabled: boolean
  vigilante_enabled: boolean
  tracker_enabled: boolean
  alpha_wolf_enabled: boolean
  wolf_cub_enabled: boolean
  framer_enabled: boolean
  jester_enabled: boolean
  serial_killer_enabled: boolean
  arsonist_enabled: boolean
  cupid_enabled: boolean
  cursed_villager_enabled: boolean
  medium_enabled: boolean
  priest_enabled: boolean
  witch_enabled: boolean
  little_girl_enabled: boolean
  trapper_enabled: boolean
  /** Village Seer — reveals a target's exact role each night (stronger than Aura Seer). */
  seer_enabled: boolean
  /** Mafia-team Seer — reveals a target's exact role each night; can resign to become a
   *  Regular Mafia (gaining the kill vote, losing the reveal). */
  mafia_seer_enabled: boolean
  /** Visits a player each night — safe from any attack on herself while out visiting, but
   *  dies if the player she visited was attacked that night or is Mafia/a Solo killer. */
  red_lady_enabled: boolean
}

export interface MafiaSession extends MafiaRoleEnabledFlags {
  id: string
  game_id: string
  phase: MafiaPhase
  day_number: number
  phase_deadline: string | null
  mafia_target_player_id: string | null
  doctor_target_player_id: string | null
  aura_seer_target_player_id: string | null
  seer_target_player_id: string | null
  mafia_seer_target_player_id: string | null
  /** Append-only history of every {playerId, role} the Mafia Seer has ever revealed —
   *  unlike mafia_seer_target_player_id (overwritten each night), this accumulates so the
   *  crew keeps a persistent role badge on every player the seer has ever checked. */
  mafia_seer_revealed: Array<{ playerId: string; role: MafiaRole }>
  night_kill_player_id: string | null
  vote_result_player_id: string | null
  serial_kill_player_id: string | null
  arson_ignite: boolean
  bodyguard_target_player_id: string | null
  bodyguard_sacrifice_player_id: string | null
  tracker_visited_player_id: string | null
  framed_player_id: string | null
  wolf_cub_revenge_pending: boolean
  cupid_lover_ids: [string, string] | null
  medium_revive_player_id: string | null
  vigilante_day_kill_player_id: string | null
  vigilante_reveal_player_id: string | null
  /** Alive players who've asked to skip ahead out of the current Discussion/Voting phase
   *  early — reset to [] whenever a new 'day' or 'voting' phase starts. Reaching the same
   *  majority threshold as a lynch vote (floor(alive/2)+1) advances the phase immediately. */
  skip_requested_player_ids: string[]
  mafia_count: number
  day_seconds: number
  voting_seconds: number
  anonymous_votes: boolean
  winning_team: MafiaTeam | 'lovers' | null
  created_at: string
  updated_at: string
}

export interface MafiaPlayerState {
  id: string
  game_id: string
  player_id: string
  role: MafiaRole
  is_alive: boolean
  death_day: number | null
  death_cause: MafiaDeathCause | null
  night_action_target_player_id: string | null
  night_action_target_player_id_2: string | null
  day_vote_target_player_id: string | null
  doused_by_arsonist: boolean
  vigilante_shots_used: number
  vigilante_reveal_used: boolean
  medium_revive_used: boolean
  revived_by_medium: boolean
  bodyguard_hits_taken: number
  priest_holy_water_used: boolean
  witch_heal_used: boolean
  witch_kill_used: boolean
  trapper_trap_player_ids: string[]
  wolf_cub_revenge_target_player_id: string | null
  is_lover: boolean
  lover_partner_player_id: string | null
  seat_number: number
  created_at: string
  updated_at: string
}

export interface MafiaPublicPlayer {
  id: string
  seatNumber: number
  name: string
  isAlive: boolean
  deathDay: number | null
  deathCause: MafiaDeathCause | null
  role?: MafiaRole // Only revealed on death or game over
  revivedByMedium?: boolean
}

export interface MafiaChatMessage {
  id: string
  game_id: string
  sender_player_id: string
  sender_name: string
  message: string
  created_at: string
}

export interface MafiaMyState {
  role: MafiaRole
  team: MafiaTeam
  nightActionSubmitted: boolean
  dayVoteSubmitted: boolean
  auraSeerResult: { targetName: string; alignment: 'good' | 'evil' | 'unknown' } | null
  detectiveTeamCheckResult?: { targetAName: string; targetBName: string; sameTeam: boolean } | null
  mafiaTeammates: string[] // Only for mafia team members (mafia/alpha_wolf/wolf_cub/framer)
  /** Same set as mafiaTeammates but by player id — lets the roster grid mark each teammate's
   *  tile with the shared mafia symbol and reveal their role, without a separate list panel. */
  mafiaTeammateIds: string[]
  /** Each teammate's actual role (Mafia/Alpha Wolf/Wolf Cub/Framer) keyed by player id — the
   *  crew sees exactly what each other plays, not just "they're mafia too". */
  mafiaTeammateRoles: Record<string, MafiaRole>
  /** Every role the Mafia Seer has revealed so far, keyed by player id — only ever
   *  populated for mafia-team members (never sent to villagers), so the crew keeps a
   *  running roster of everyone their seer has checked, not just the latest one. */
  mafiaSeerRevealedRoles?: Record<string, MafiaRole>
  mafiaChatMessages?: MafiaChatMessage[]
  mafiaTeammateNightTargets?: Record<string, string | null>
  trackerResult?: { targetName: string; visitedName: string | null } | null
  bodyguardLastOutcome?: 'saved' | 'absorbed' | 'sacrificed' | 'no_attack' | null
  doctorLastOutcome?: 'saved' | 'no_attack' | null
  vigilanteShotsRemaining?: number
  vigilanteRevealRemaining?: number
  /** The role the Vigilante revealed this day (only they see it). */
  vigilanteRevealResult?: { targetName: string; role: MafiaRole } | null
  mediumReviveRemaining?: number
  mediumGhostChat?: MafiaChatMessage[]
  priestHolyWaterRemaining?: number
  witchHealRemaining?: number
  witchKillRemaining?: number
  trapperTrappedNames?: string[]
  /** Village Seer's full-role reveal of their last target. */
  seerResult?: { targetName: string; role: MafiaRole } | null
  /** Mafia Seer's full-role reveal of their last target (before resigning). */
  mafiaSeerResult?: { targetName: string; role: MafiaRole } | null
  framerLastTargetName?: string | null
  wolfCubRevengeTargetName?: string | null
  cupidLinkedNames?: [string, string] | null
  isLover?: boolean
  loverPartnerName?: string | null
  /** The two Lovers' player ids — populated only for Cupid and the two Lovers themselves, so
   *  the roster grid can mark their tiles with a heart without exposing it to anyone else. */
  loverIds?: string[]
  enabledRoles?: MafiaRole[]
}
