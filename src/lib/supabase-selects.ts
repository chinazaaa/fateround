/** Slim column lists for hot-path Supabase queries (avoids select('*') egress). */

// NOTE: host_token / resume_token are deliberately excluded — they are secret auth
// credentials anon must never read (migration 0122 revokes them at the DB). They are
// vended only by server endpoints (create-game, join, /api/players/resume) and read
// server-side via the service role. Anon `select('*')` on games/players now ERRORS, so
// client reads must use these curated lists.
export const GAME_SELECT =
  'id,title,content_label,rounds_count,timer_seconds,operative_timer_seconds,anonymous,auto_reveal,auto_submit_behavior,participant_mode,participant_filter,pair_vote_mode,question_source,custom_questions,player_questions_enabled,player_questions_order,game_type,theme,status,current_round_number,created_at,finished_at,session_started_at,allow_viewers,allow_late_players,max_players,monopoly_board_size,anonymous_messages_trimmed_at,wst_quote_source,custom_slots,gender_based,codewords_player_picks,codewords_late_join,codewords_randomize_teams,describe_it_num_teams,describe_it_mode,quick_draw_variant,quick_draw_play_mode,quick_draw_num_teams,word_rush_mode,word_rush_prompt_mode,word_rush_difficulty,word_rush_num_teams,pool_usage,trivia_category,bingo_call_mode,bingo_call_interval_seconds,game_duration_seconds,whot_pick3_enabled,whot_cards_enabled,whot_number_calls_enabled,whot_pick2_stacking,crazy8_action_cards,crazy8_jokers,crazy8_pick2_stacking,uno_wd4_challenge,uno_uno_penalty,uno_wd4_challenge_penalty,uno_zero_seven,uno_stacking,uno_multi_play,uno_multi_play_mode,uno_team_mode,uno_jump_in,uno_mode,uno_no_mercy_win,uno_series_scoring,uno_series_target,uno_series_scores,uno_series_winner_id,ludo_variant,ayo_variant,mahjong_ruleset,mahjong_rule_options,scrabble_dictionary_id,scrabble_clock_mode,scrabble_clock_seconds,chess_board_theme,chess_piece_set,tournament_id,pending_host_player_id,host_player_id,is_public,music_enabled,replay_pending,crossword_theme,crossword_difficulty,word_search_theme,word_search_difficulty,word_scramble_theme,word_scramble_difficulty,monopoly_double_go_salary,monopoly_forced_auctions,monopoly_auction_timer_seconds,monopoly_no_rent_in_jail,monopoly_estate_dividend,monopoly_loans_enabled,monopoly_loan_interest,monopoly_loan_term_rounds,landmine_mode,landmine_mine_count,landmine_originality_bonus,landmine_mine_source,landmine_elim_seconds,landmine_review,landmine_review_seconds,checkers_nigeria_street_rules,wordle_room_category,wordle_room_word_count,troll_run_rounds,troll_run_time_limit,troll_run_world,last_activity_at,host_idle_warning_sent_at,result_reason,scheduled_at,opened_at,edition_slug'

export const PLAYER_SELECT =
  'id,game_id,name,gender,identity_gender,participant_id,joined_at,spectator,monopoly_token,is_eliminated,eliminated_at,lives_remaining,is_bot'

/** Host-side game read: GAME_SELECT plus the host-only AI-questions fields (the host
 *  settings panel reads them). Still excludes host_token — the host page validates its
 *  token via /api/games/[code]/verify-host instead of reading it.
 *  The ai_questions_* columns are guaranteed to exist + be anon-readable by migration 0123,
 *  which MUST be applied with this code (an explicit select on a missing/ungranted column
 *  errors). */
export const HOST_GAME_SELECT = `${GAME_SELECT},ai_questions_enabled,ai_questions_config,ai_generated_questions`

export const PARTICIPANT_SELECT =
  'id,game_id,name,gender,photo_url,description,display_order,in_mlt_poll,submitted_by_player_id'

export const ROUND_SELECT =
  'id,game_id,round_number,participant_ids,wyr_option_a,wyr_option_b,mlt_question,submitter_player_id,quote_text,quote_author_participant_id,quote_submitted_at,status,started_at,ended_at,anime_metadata,trivia_metadata,ttl_metadata,npat_metadata,sudoku_metadata,word_hunt_metadata,memory_match_metadata,quiplash_metadata,quick_draw_metadata,crossword_metadata,word_grouping_metadata,landmine_metadata,wordle_room_metadata'

export const SUDOKU_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,block_index,cell_row,cell_col,submitted_value,is_correct,points_awarded,submitted_at'

export const WORD_HUNT_SUBMISSION_SELECT = 'id,game_id,round_id,player_id,word,path,points_awarded,submitted_at'

export const CROSSWORD_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,cell_row,cell_col,submitted_letter,is_correct,via_hint,submitted_at'

export const WORD_GROUPING_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,group_index,difficulty,guess_words,is_correct,mistakes_at_time,submitted_at'

export const VOTE_SELECT =
  'id,player_id,round_id,game_id,kiss_participant_id,marry_participant_id,kill_participant_id,pair_assignments,wyr_choice,target_player_id,target_participant_id,anime_choice,picked_number,response_ms,points,created_at'

export const CONFESSION_SELECT = 'id,game_id,round_id,text,created_at'

export const MONOPOLY_BOARD_SELECT =
  'id,game_id,board_size,turn_order,current_turn_index,phase,last_dice,consecutive_doubles,property_owners,property_buildings,mortgaged_properties,houses_in_bank,hotels_in_bank,auction_state,pending_trade,pending_debt,pending_space,status_message,last_card_event,last_rent_event,last_cash_event,last_trade_event,loans,turn_deadline_at,winner_player_id,created_at,updated_at'

/**
 * `monopoly_boards` columns that are NOT NULL in the DB.
 *
 * Realtime UPDATE payloads omit unchanged TOAST-ed columns — once a game has enough owned
 * properties for `property_owners` (and the other large jsonb columns) to be stored out-of-line,
 * a board update that doesn't touch them delivers them as `null`. Since these columns can never
 * legitimately be null, a null here proves the pushed row is partial: applying it would wipe
 * ownership, buildings and the decks on screen. Callers use {@link isCompleteMonopolyBoardRow}
 * to detect that and fall back to a full reload instead of the delta fast-path.
 */
// The four card decks are deliberately absent — they are no longer in MONOPOLY_BOARD_SELECT, so
// a pushed row never carries them and requiring them here would make isCompleteMonopolyBoardRow
// return false for EVERY payload, rejecting every delta and forcing a full reload each time.
// (Exactly the bug found in UNO_SESSION_NOT_NULL_KEYS after its piles were revoked.)
export const MONOPOLY_BOARD_NOT_NULL_KEYS = [
  'property_owners',
  'property_buildings',
  'mortgaged_properties',
  'turn_order',
  'loans',
] as const

/** True when a pushed `monopoly_boards` row carries every NOT-NULL column (i.e. is not a
 *  TOAST-truncated partial realtime payload — see {@link MONOPOLY_BOARD_NOT_NULL_KEYS}). */
export function isCompleteMonopolyBoardRow(row: Record<string, unknown>): boolean {
  return MONOPOLY_BOARD_NOT_NULL_KEYS.every((key) => row[key] != null)
}

/** Default per-turn timer when host enables timing (seconds). 0 = off. */
export const MONOPOLY_DEFAULT_TURN_TIMER = 45

/** Fixed bid window per auction turn (seconds). */
export const MONOPOLY_AUCTION_TIMER_SECONDS = 10

/** Auto-dismiss Chance / Community Chest popups (seconds). */
export const MONOPOLY_CARD_MODAL_SECONDS = 5

export const MONOPOLY_PLAYER_STATE_SELECT =
  'id,game_id,player_id,position,cash,in_jail,jail_turns,get_out_of_jail_free,bankrupt,passed_go_once,player_order,created_at'

export const YAHTZEE_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,dice,held,rolls_remaining,rolls_this_turn,status_message,winner_player_id,turn_deadline_at,created_at,updated_at'

export const YAHTZEE_PLAYER_SCORES_SELECT = 'id,game_id,player_id,scores,player_order,created_at'

export const WHOT_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,draw_pile,discard_pile,top_card,required_shape,required_number,pick_two_stack,pick_five_stack,status_message,winner_player_id,finish_order,reshuffle_count,turn_deadline_at,created_at,updated_at'

export const WHOT_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

/**
 * Go Fish session — `ocean` (the face-down draw pile) is EXCLUDED. It is server-only state;
 * the client only needs `ocean_count` to render "N cards left" without seeing card order.
 */
export const GOFISH_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,ocean_count,event_log,status_message,winner_player_id,finish_order,turn_deadline_at,created_at,updated_at'

/**
 * Go Fish hands — `cards` is redacted per-viewer by the /api/gofish/hands route, so this
 * select is fine to run from the browser: opponents' rows carry public `books` and a
 * `card_count`, and only your own row carries the real cards.
 */
export const GOFISH_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,books,player_order,created_at'

export const CRAZY8_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,direction,phase,draw_pile,discard_pile,top_card,required_suit,pick_two_stack,joker_penalty,status_message,winner_player_id,finish_order,turn_deadline_at,created_at,updated_at'

export const CRAZY8_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

// last_play_player_id, pending_wild, color_roulette_player_id, color_roulette_reveals and
// draw_stack_chain are deliberately absent: no client reads them, and the server paths that
// do (processUnoPlay, processUnoDraw, processUnoChoose, …) re-fetch the row themselves with
// `select('*')` through the service role.
export const UNO_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,direction,phase,draw_pile,discard_pile,top_card,required_color,draw_penalty,draw_penalty_kind,drawn_card_id,last_play_cards,challenge_prev_color,wd4_player_id,uno_pending_player,uno_called,status_message,winner_player_id,finish_order,left_player_ids,team_decider_id,eliminated_player_ids,turn_deadline_at,created_at,updated_at'

/**
 * `uno_sessions` columns that are NOT NULL in the DB.
 *
 * Realtime UPDATE payloads omit unchanged TOAST-ed columns — once the draw / discard piles
 * are big enough for Postgres to store them out-of-line, a partial update that doesn't touch
 * them delivers them as `null` (same failure mode as `monopoly_boards.property_owners`, see
 * MONOPOLY_BOARD_NOT_NULL_KEYS). Applying such a row would wipe the piles / turn order on
 * screen and make every card look unplayable (canPlayCard sees a stale session). Callers
 * use {@link isCompleteUnoSessionRow} to detect that and fall back to a full reload.
 */
export const UNO_SESSION_NOT_NULL_KEYS = [
  'turn_order',
  'draw_pile',
  'discard_pile',
  'left_player_ids',
  'eliminated_player_ids',
] as const

/** True when a pushed `uno_sessions` row carries every NOT-NULL column (i.e. is not a
 *  TOAST-truncated partial realtime payload — see {@link UNO_SESSION_NOT_NULL_KEYS}). */
export function isCompleteUnoSessionRow(row: Record<string, unknown>): boolean {
  return UNO_SESSION_NOT_NULL_KEYS.every((key) => row[key] != null)
}

export const UNO_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

export const LUDO_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_dice,remaining_dice,consecutive_sixes,extra_turn,status_message,winner_player_id,turn_deadline_at,created_at,updated_at'

export const LUDO_PLAYER_STATE_SELECT = 'id,game_id,player_id,color,pieces,player_order,created_at'

export const SNAKE_LADDER_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_roll,last_from,last_to,last_event,last_player_id,consecutive_sixes,status_message,winner_player_id,turn_deadline_at,created_at,updated_at'

export const SNAKE_LADDER_PLAYER_STATE_SELECT = 'id,game_id,player_id,color,position,player_order,created_at'

// Hand-resolution bookkeeping (dealer_index, honba, riichi_sticks, round_wind, hand_number,
// last_action, hand_result, rule_options, the ura-dora indicators and the claim/ippatsu id
// lists) is deliberately absent: no client reads any of it, and every server path that does
// — processMahjongNextHand, processMahjongRiichi, sanitizeMahjongSession and friends —
// re-fetches the row itself with `select('*')` through the service role. `claim_passes` IS
// kept: mobile reads it directly.
export const MAHJONG_SESSION_SELECT =
  'id,game_id,ruleset,turn_order,current_turn_index,phase,wall,dead_wall,dora_indicators,scores,discard_pile,last_discard,claim_passes,status_message,winner_player_id,winner_player_ids,winning_tile,win_type,score_summary,turn_deadline_at,created_at,updated_at'

export const MAHJONG_PLAYER_STATE_SELECT =
  'id,game_id,player_id,seat,hand,hand_count,last_drawn_tile,flowers,riichi_declared,riichi_discard_index,temporary_furiten,permanent_furiten,melds,discarded,player_order,created_at'

export const TIC_TAC_TOE_SESSION_SELECT =
  'id,game_id,player_x_id,player_o_id,board,board_winners,active_board,current_turn_mark,status,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

export const CHESS_SESSION_SELECT =
  'id,game_id,player_white_id,player_black_id,fen,pgn,current_turn,white_time_ms,black_time_ms,turn_started_at,last_move_from,last_move_to,in_check,status,result_reason,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

export const CHECKERS_SESSION_SELECT =
  'id,game_id,player_red_id,player_black_id,board,current_turn,move_count,position_counts,must_continue_from,red_time_ms,black_time_ms,turn_started_at,last_move_from,last_move_to,status,result_reason,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

export const DRAUGHTS10_SESSION_SELECT =
  'id,game_id,variant,player_red_id,player_black_id,board,current_turn,move_count,position_counts,must_continue_from,must_continue_remaining,huffing_enabled,huffable_squares,red_time_ms,black_time_ms,turn_started_at,last_move_from,last_move_to,status,result_reason,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

export const AYO_SESSION_SELECT =
  'id,game_id,player_a_id,player_b_id,pits,captured_a,captured_b,houses_a,houses_b,match_round,a_row_size,b_row_size,current_turn,a_win_streak,b_win_streak,a_time_ms,b_time_ms,turn_started_at,last_pit,status,result_reason,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

/**
 * NOTE: no `current_word` and no `used_words`. Both are revoked from anon/authenticated by
 * migration 20260807130000 — the word used to ship to every guesser's client and was merely
 * hidden in the UI, and `used_words[last]` IS that word. The describer fetches it from POST
 * /api/describe-it/my-word instead.
 *
 * Every column here except `word_seq` predates the migrations on this branch, so this list is
 * the part that is safe against ANY database version.
 */
export const DESCRIBE_IT_SESSION_SELECT_NO_WORD_SEQ =
  'id,game_id,mode,num_teams,total_rounds,turn_seconds,phase,turn_index,current_round,active_team,describer_player_id,roster,current_clue,current_clues,turn_deadline_at,break_deadline_at,status,status_message,created_at,updated_at'

/**
 * `word_seq` (added by migration 20260807115000) is the public per-word counter that replaced
 * the clients' only legitimate use of the revoked `used_words` array — its length.
 *
 * DEPLOY SKEW: naming a column that does not exist yet makes PostgREST fail the WHOLE select
 * with 42703, which would take out all session state, not just the word. Read the session
 * through `readDescribeItSession()` (src/lib/describe-it-session-read.ts), which falls back to
 * DESCRIBE_IT_SESSION_SELECT_NO_WORD_SEQ on 42703 so a web deploy that lands ahead of the
 * migration degrades instead of bricking the game.
 */
export const DESCRIBE_IT_SESSION_SELECT = `${DESCRIBE_IT_SESSION_SELECT_NO_WORD_SEQ},word_seq`

export const DESCRIBE_IT_PLAYER_SELECT = 'id,game_id,player_id,team,score,created_at'

export const DESCRIBE_IT_WORD_SELECT =
  'id,game_id,turn_index,round,team,describer_player_id,word,clue,status,guesser_player_id,created_at'

export const DESCRIBE_IT_GUESS_SELECT = 'id,game_id,turn_index,player_id,team,text,correct,points,created_at'

export const WORD_RUSH_SESSION_SELECT =
  'id,game_id,mode,prompt_mode,difficulty,min_word_length,num_teams,total_rounds,turn_seconds,phase,turn_index,current_round,active_team,prompt_setter_player_id,roster,start_letter,end_letter,prompt_index,used_pairs,turn_deadline_at,intermission_deadline_at,status,status_message,created_at,updated_at'

export const WORD_RUSH_PLAYER_SELECT = 'id,game_id,player_id,team,score,created_at'

export const WORD_RUSH_ANSWER_SELECT =
  'id,game_id,turn_index,round,team,team_turn_index,prompt_index,start_letter,end_letter,player_id,text,correct,created_at'

export const SCRABBLE_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,board,bag,phase,consecutive_passes,last_move,winner_player_id,is_tie,status_message,turn_deadline_at,clock_mode,turn_started_at,created_at,updated_at'

export const SCRABBLE_PLAYER_STATE_SELECT =
  'id,game_id,player_id,rack,score,player_order,clock_ms_remaining,timed_out,created_at'

export const BINGO_CALLED_NUMBER_SELECT = 'id,game_id,number,called_at'

export const BINGO_CLAIM_SELECT = 'id,game_id,player_id,pattern,status,created_at'

export const BINGO_CARD_SELECT = 'id,game_id,player_id,cells,marked_indices,created_at'

export const TRIVIA_ANSWER_SELECT =
  'id,game_id,round_id,player_id,choice_index,is_correct,answered_at,response_ms,points'

export const TTL_STATEMENT_SELECT =
  'id,game_id,player_id,statement_a,statement_b,statement_c,lie_index,created_at,updated_at'

export const TTL_GUESS_SELECT = 'id,game_id,round_id,player_id,guessed_index,is_correct,points,guessed_at'

export const QUIPLASH_SESSION_SELECT =
  'id,game_id,phase,battle_index,active_battle_id,turn_deadline_at,created_at,updated_at'

export const QUIPLASH_ANSWER_SELECT = 'id,game_id,round_id,player_id,text,is_bye,submitted_at'

export const QUIPLASH_BATTLE_SELECT =
  'id,game_id,round_id,battle_number,answer_a_id,answer_b_id,winner_answer_id,points_awarded,status,started_at,ended_at'

export const QUIPLASH_VOTE_SELECT = 'id,game_id,battle_id,round_id,player_id,chosen_answer_id,voted_at'

export const QUICK_DRAW_SESSION_SELECT = 'id,game_id,phase,drawing_index,turn_deadline_at,created_at,updated_at'

export const QUICK_DRAW_ASSIGNMENT_SELECT = 'id,game_id,round_id,player_id,prompt,created_at'

export const QUICK_DRAW_DRAWING_SELECT = 'id,game_id,round_id,player_id,stroke_data,submitted_at'

export const QUICK_DRAW_TITLE_SELECT = 'id,game_id,drawing_id,player_id,text,is_real,submitted_at'

export const QUICK_DRAW_VOTE_SELECT = 'id,game_id,drawing_id,player_id,chosen_title_id,voted_at'

/**
 * NOTE: no `current_word` and no `used_words`. The secret prompt is revoked from
 * anon/authenticated by migration 20260807140000 — it used to ship to every guesser's client
 * (twice: as `current_word`, and as the last entry of `used_words`) and was merely hidden in the
 * UI. The drawer fetches it from POST /api/quick-draw/my-word instead, and `word_seq` is the
 * public per-word counter clients use to know it rotated.
 */
export const QUICK_DRAW_GUESS_SESSION_SELECT =
  'id,game_id,mode,num_teams,total_rounds,turn_seconds,roster,phase,turn_index,current_round,active_team,drawer_player_id,current_stroke_data,word_seq,turn_deadline_at,break_deadline_at,status,status_message,created_at,updated_at'

export const QUICK_DRAW_GUESS_PLAYER_SELECT = 'id,game_id,player_id,team,score,created_at'

export const QUICK_DRAW_GUESS_WORD_SELECT =
  'id,game_id,turn_index,round,team,drawer_player_id,word,status,guesser_player_id,created_at'

export const QUICK_DRAW_GUESS_GUESS_SELECT = 'id,game_id,turn_index,player_id,team,text,correct,points,created_at'

export const NPAT_ANSWER_SELECT =
  'id,game_id,round_id,player_id,name,animal,place,thing,food,submitted_at,score_name,score_animal,score_place,score_thing,score_food'

export const NPAT_MARK_SELECT =
  'id,game_id,round_id,marker_player_id,target_player_id,valid_name,valid_animal,valid_place,valid_thing,valid_food,marked_at'

export const LANDMINE_ANSWER_SELECT =
  'id,game_id,round_id,player_id,answer,submitted_at,points,outcome,mine_hit,is_original'

export const LANDMINE_MARK_SELECT = 'id,game_id,round_id,marker_player_id,target_player_id,valid,marked_at'

export const WST_QUOTE_POOL_SELECT =
  'id,game_id,player_id,quote_text,options,correct_index,author_participant_id,created_at,updated_at'

export const PLAYER_QUESTION_SELECT = 'id,player_id,question_type,option_a,option_b,question_text'

export const MEMORY_MATCH_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,pair_index,is_match,streak_at_time,streak_bonus,points_after,submitted_at'

export const MEMORY_MATCH_PROGRESS_SELECT =
  'id,game_id,round_id,player_id,pairs_matched,wrong_attempts,finished,finish_rank,finished_at,created_at,updated_at'

export const TROLL_RUN_SESSION_SELECT =
  'id,game_id,phase,current_round,total_rounds,current_world,levels_per_round,round_time_limit,round_started_at,turn_deadline_at,level_order,created_at,updated_at'

export const TROLL_RUN_PLAYER_STATE_SELECT =
  'id,game_id,player_id,current_round,current_level_index,deaths,levels_cleared,total_time_ms,round_score,total_score,finish_position,round_finished,created_at,updated_at'

export const TROLL_RUN_EVENT_SELECT = 'id,game_id,player_id,round,level_id,level_name,event_type,time_ms,created_at'

/**
 * Wordle Room per-player progress — the anon-readable, realtime half of the game. The secrets
 * live in sibling tables that have NO policies and no anon grants at all
 * (`wordle_room_solutions.words`, `wordle_room_guesses.state`), so nothing here needs redacting;
 * this constant exists to name the columns rather than ship whatever the row grows next.
 */
export const WORDLE_ROOM_PROGRESS_SELECT =
  'id,game_id,round_id,player_id,word_index,current_word_guesses,words_solved,total_guesses,total_time_ms,finished,finished_at,created_at,updated_at'

/**
 * Codewords seat assignments. `role` is what makes someone a spymaster and is read by the board,
 * so it stays for now — but naming the columns is what lets the codewords redaction PR drop it
 * from the client without hunting `select('*')` call sites.
 */
export const CODEWORDS_PLAYER_ROLE_SELECT = 'id,game_id,player_id,team,role,created_at'

/** Codewords guesses — all public once made; the board key lives in `codewords_boards.key`. */
export const CODEWORDS_GUESS_SELECT =
  'id,game_id,board_id,player_id,cell_index,word,cell_type,clue_word,clue_number,team,created_at'

/** Anonymous-room bans. */
export const ANONYMOUS_ROOM_BAN_SELECT = 'id,game_id,player_id,banned_until,created_at'
