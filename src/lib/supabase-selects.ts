/** Slim column lists for hot-path Supabase queries (avoids select('*') egress). */

export const GAME_SELECT =
  'id,title,host_token,rounds_count,timer_seconds,operative_timer_seconds,anonymous,auto_reveal,auto_submit_behavior,participant_mode,participant_filter,pair_vote_mode,question_source,custom_questions,player_questions_enabled,player_questions_order,game_type,theme,status,current_round_number,created_at,session_started_at,allow_viewers,allow_late_players,max_players,anonymous_messages_trimmed_at,wst_quote_source,custom_slots,gender_based,codewords_player_picks,codewords_late_join,codewords_randomize_teams,pool_usage,trivia_category,bingo_call_mode,bingo_call_interval_seconds,game_duration_seconds,whot_pick3_enabled,whot_cards_enabled,whot_number_calls_enabled'

export const PLAYER_SELECT =
  'id,game_id,name,gender,identity_gender,participant_id,joined_at,spectator,monopoly_token,resume_token'

export const PARTICIPANT_SELECT =
  'id,game_id,name,gender,photo_url,description,display_order,in_mlt_poll,submitted_by_player_id'

export const ROUND_SELECT =
  'id,game_id,round_number,participant_ids,wyr_option_a,wyr_option_b,mlt_question,submitter_player_id,quote_text,quote_author_participant_id,quote_submitted_at,status,started_at,ended_at,anime_metadata,trivia_metadata,ttl_metadata,npat_metadata,sudoku_metadata,word_hunt_metadata'

export const SUDOKU_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,block_index,is_correct,points_awarded,submitted_at'

export const WORD_HUNT_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,word,path,points_awarded,submitted_at'

export const VOTE_SELECT =
  'id,player_id,round_id,game_id,kiss_participant_id,marry_participant_id,kill_participant_id,pair_assignments,wyr_choice,target_player_id,target_participant_id,anime_choice,picked_number,created_at'

export const CONFESSION_SELECT = 'id,game_id,round_id,text,created_at'

export const MONOPOLY_BOARD_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_dice,consecutive_doubles,property_owners,property_buildings,mortgaged_properties,houses_in_bank,hotels_in_bank,chance_deck,community_deck,chance_discard,community_discard,auction_state,pending_trade,pending_debt,pending_space,status_message,last_card_event,last_rent_event,last_cash_event,last_trade_event,turn_deadline_at,winner_player_id,created_at,updated_at'

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
  'id,game_id,turn_order,current_turn_index,phase,draw_pile,discard_pile,top_card,required_shape,required_number,pick_two_stack,pick_five_stack,status_message,winner_player_id,turn_deadline_at,created_at,updated_at'

export const WHOT_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

export const LUDO_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_dice,remaining_dice,consecutive_sixes,extra_turn,status_message,winner_player_id,turn_deadline_at,created_at,updated_at'

export const LUDO_PLAYER_STATE_SELECT = 'id,game_id,player_id,color,pieces,player_order,created_at'

export const TIC_TAC_TOE_SESSION_SELECT =
  'id,game_id,player_x_id,player_o_id,board,board_winners,active_board,current_turn_mark,status,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

export const CHESS_SESSION_SELECT =
  'id,game_id,player_white_id,player_black_id,fen,pgn,current_turn,white_time_ms,black_time_ms,turn_started_at,last_move_from,last_move_to,in_check,status,result_reason,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

export const BINGO_CALLED_NUMBER_SELECT = 'id,game_id,number,called_at'

export const BINGO_CLAIM_SELECT = 'id,game_id,player_id,pattern,status,created_at'

export const BINGO_CARD_SELECT = 'id,game_id,player_id,cells,marked_indices,created_at'

export const TRIVIA_ANSWER_SELECT =
  'id,game_id,round_id,player_id,choice_index,is_correct,answered_at,response_ms,points'

export const TTL_STATEMENT_SELECT =
  'id,game_id,player_id,statement_a,statement_b,statement_c,lie_index,created_at,updated_at'

export const TTL_GUESS_SELECT = 'id,game_id,round_id,player_id,guessed_index,is_correct,points,guessed_at'

export const NPAT_ANSWER_SELECT =
  'id,game_id,round_id,player_id,name,animal,place,thing,food,submitted_at,score_name,score_animal,score_place,score_thing,score_food'

export const NPAT_MARK_SELECT =
  'id,game_id,round_id,marker_player_id,target_player_id,valid_name,valid_animal,valid_place,valid_thing,valid_food,marked_at'

export const WST_QUOTE_POOL_SELECT = 'id,game_id,player_id,quote_text,author_participant_id,created_at,updated_at'

export const PLAYER_QUESTION_SELECT = 'id,player_id,question_type,option_a,option_b,question_text'
