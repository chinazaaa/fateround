export const GAME_SELECT =
  'id,title,game_type,status,current_round_number,timer_seconds,max_players,allow_viewers,allow_late_players,is_public,theme,replay_pending,pending_host_player_id,tournament_id,ayo_variant,participant_mode,pair_vote_mode,player_questions_enabled,player_questions_order,custom_questions,custom_slots,gender_based,ludo_variant,rounds_count,question_source,describe_it_num_teams,describe_it_mode,crazy8_action_cards,crazy8_jokers,crazy8_pick2_stacking,whot_pick3_enabled,whot_cards_enabled,whot_number_calls_enabled,whot_pick2_stacking,word_rush_mode,word_rush_num_teams,word_rush_prompt_mode,word_rush_difficulty,session_started_at,game_duration_seconds,anonymous_messages_trimmed_at,chess_board_theme,chess_piece_set,scrabble_dictionary_id,scrabble_clock_mode,scrabble_clock_seconds,operative_timer_seconds,codewords_player_picks,codewords_late_join,codewords_randomize_teams,mafia_doctor_enabled,mafia_detective_enabled,mafia_anonymous_votes,quick_draw_variant,quick_draw_play_mode,quick_draw_num_teams,mahjong_ruleset,mahjong_rule_options,bingo_call_mode,bingo_call_interval_seconds'

export const PLAYER_SELECT = 'id,game_id,name,gender,joined_at,spectator,is_eliminated,monopoly_token,participant_id'

export const PARTICIPANT_SELECT =
  'id,game_id,name,gender,photo_url,description,display_order,in_mlt_poll,submitted_by_player_id'

export const ROUND_SELECT =
  'id,game_id,round_number,participant_ids,wyr_option_a,wyr_option_b,mlt_question,submitter_player_id,quote_text,quote_author_participant_id,status,started_at,ended_at,anime_metadata,trivia_metadata,memory_match_metadata,sudoku_metadata,ttl_metadata,quiplash_metadata,word_hunt_metadata,npat_metadata'

export const VOTE_SELECT =
  'id,player_id,round_id,game_id,kiss_participant_id,marry_participant_id,kill_participant_id,pair_assignments,wyr_choice,target_player_id,target_participant_id,anime_choice,picked_number,created_at'

export const YAHTZEE_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,dice,held,rolls_remaining,rolls_this_turn,status_message,winner_player_id,turn_deadline_at'

export const YAHTZEE_PLAYER_SCORES_SELECT = 'id,game_id,player_id,scores,player_order'

export const LUDO_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_dice,remaining_dice,consecutive_sixes,extra_turn,status_message,winner_player_id,turn_deadline_at'

export const LUDO_PLAYER_STATE_SELECT = 'id,game_id,player_id,color,pieces,player_order'

export const SNAKE_LADDER_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_roll,last_from,last_to,last_event,last_player_id,consecutive_sixes,status_message,winner_player_id,turn_deadline_at'

export const SNAKE_LADDER_PLAYER_STATE_SELECT = 'id,game_id,player_id,color,position,player_order'

export const MEMORY_MATCH_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,pair_index,is_match,streak_at_time,streak_bonus,points_after,submitted_at'

export const MEMORY_MATCH_PROGRESS_SELECT =
  'id,game_id,round_id,player_id,pairs_matched,wrong_attempts,finished,finish_rank'

export const SUDOKU_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,cell_row,cell_col,submitted_value,is_correct,points_awarded,submitted_at'

export const TIC_TAC_TOE_SESSION_SELECT =
  'id,game_id,player_x_id,player_o_id,board,board_winners,active_board,current_turn_mark,status,winner_player_id,is_draw,status_message'

export const CHECKERS_SESSION_SELECT =
  'id,game_id,player_red_id,player_black_id,board,current_turn,must_continue_from,status,winner_player_id,is_draw,status_message'

export const CHESS_SESSION_SELECT =
  'id,game_id,player_white_id,player_black_id,fen,pgn,current_turn,white_time_ms,black_time_ms,turn_started_at,last_move_from,last_move_to,in_check,status,result_reason,winner_player_id,is_draw,status_message,turn_deadline_at,created_at,updated_at'

export const SCRABBLE_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,board,bag,phase,consecutive_passes,last_move,winner_player_id,is_tie,status_message,turn_deadline_at,clock_mode,turn_started_at,created_at,updated_at'

export const SCRABBLE_PLAYER_STATE_SELECT =
  'id,game_id,player_id,rack,score,player_order,clock_ms_remaining,timed_out,created_at'

export const AYO_SESSION_SELECT =
  'id,game_id,player_a_id,player_b_id,pits,captured_a,captured_b,houses_a,houses_b,match_round,a_row_size,b_row_size,current_turn,a_win_streak,b_win_streak,a_time_ms,b_time_ms,turn_started_at,last_pit,status,result_reason,winner_player_id,is_draw,status_message,turn_deadline_at'

export const BINGO_CARD_SELECT = 'id,game_id,player_id,cells,marked_indices'
export const BINGO_CALLED_NUMBER_SELECT = 'id,game_id,number,called_at'
export const BINGO_CLAIM_SELECT = 'id,game_id,player_id,pattern,status,created_at'
export const TRIVIA_ANSWER_SELECT =
  'id,game_id,round_id,player_id,choice_index,is_correct,points'

export const CRAZY8_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,direction,phase,draw_pile,discard_pile,top_card,required_suit,pick_two_stack,joker_penalty,status_message,winner_player_id,finish_order,turn_deadline_at'

export const CRAZY8_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order'

export const WHOT_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,draw_pile,discard_pile,top_card,required_shape,required_number,pick_two_stack,pick_five_stack,status_message,winner_player_id,finish_order,turn_deadline_at'

export const WHOT_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order'

export const TTL_STATEMENT_SELECT =
  'id,game_id,player_id,statement_a,statement_b,statement_c,lie_index,created_at,updated_at'

export const TTL_GUESS_SELECT = 'id,game_id,round_id,player_id,guessed_index,is_correct,points,guessed_at'

export const DESCRIBE_IT_SESSION_SELECT =
  'id,game_id,mode,num_teams,total_rounds,turn_seconds,phase,turn_index,current_round,active_team,describer_player_id,roster,current_word,current_clue,current_clues,used_words,turn_deadline_at,break_deadline_at,status,status_message'

export const DESCRIBE_IT_PLAYER_SELECT = 'id,game_id,player_id,team,score,created_at'

export const DESCRIBE_IT_WORD_SELECT =
  'id,game_id,turn_index,round,team,describer_player_id,word,clue,status,guesser_player_id,created_at'

export const DESCRIBE_IT_GUESS_SELECT = 'id,game_id,turn_index,player_id,team,text,correct,points,created_at'

export const QUIPLASH_SESSION_SELECT =
  'id,game_id,phase,battle_index,active_battle_id,turn_deadline_at,created_at,updated_at'

export const QUIPLASH_ANSWER_SELECT = 'id,game_id,round_id,player_id,text,is_bye,submitted_at'

export const QUIPLASH_BATTLE_SELECT =
  'id,game_id,round_id,battle_number,answer_a_id,answer_b_id,winner_answer_id,points_awarded,status,started_at,ended_at'

export const QUIPLASH_VOTE_SELECT = 'id,game_id,battle_id,round_id,player_id,chosen_answer_id,voted_at'

export const WORD_RUSH_SESSION_SELECT =
  'id,game_id,mode,prompt_mode,difficulty,min_word_length,num_teams,total_rounds,turn_seconds,phase,turn_index,current_round,active_team,prompt_setter_player_id,roster,start_letter,end_letter,prompt_index,used_pairs,turn_deadline_at,intermission_deadline_at,status,status_message,created_at,updated_at'

export const WORD_RUSH_PLAYER_SELECT = 'id,game_id,player_id,team,score,created_at'

export const WORD_RUSH_ANSWER_SELECT =
  'id,game_id,turn_index,round,team,team_turn_index,prompt_index,start_letter,end_letter,player_id,text,correct,created_at'

export const WORD_HUNT_SUBMISSION_SELECT =
  'id,game_id,round_id,player_id,word,path,points_awarded,submitted_at'

export const NPAT_ANSWER_SELECT =
  'id,game_id,round_id,player_id,name,animal,place,thing,food,submitted_at,score_name,score_animal,score_place,score_thing,score_food'

export const NPAT_MARK_SELECT =
  'id,game_id,round_id,marker_player_id,target_player_id,valid_name,valid_animal,valid_place,valid_thing,valid_food,marked_at'

export const CODEWORDS_BOARD_SELECT =
  'id,game_id,words,key,starting_team,revealed_indices,current_turn,guesses_remaining,current_clue_word,current_clue_number,winner,assassin_team,spymaster_timer_seconds,operative_timer_seconds,turn_phase,turn_deadline_at,created_at'

export const CODEWORDS_PLAYER_ROLE_SELECT = 'id,game_id,player_id,team,role,created_at'

export const CODEWORDS_GUESS_SELECT =
  'id,game_id,board_id,player_id,cell_index,word,cell_type,clue_word,clue_number,team,created_at'

export const CODEWORDS_MESSAGE_SELECT = 'id,game_id,player_id,team,text,created_at'

export const MONOPOLY_BOARD_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_dice,consecutive_doubles,property_owners,property_buildings,mortgaged_properties,houses_in_bank,hotels_in_bank,chance_deck,community_deck,chance_discard,community_discard,auction_state,pending_trade,pending_debt,pending_space,status_message,last_card_event,last_rent_event,last_cash_event,last_trade_event,turn_deadline_at,winner_player_id,created_at,updated_at'

export const MONOPOLY_PLAYER_STATE_SELECT =
  'id,game_id,player_id,position,cash,in_jail,jail_turns,get_out_of_jail_free,bankrupt,passed_go_once,player_order,created_at'

export const QUICK_DRAW_GUESS_SESSION_SELECT =
  'id,game_id,mode,num_teams,total_rounds,turn_seconds,roster,phase,turn_index,current_round,active_team,drawer_player_id,current_word,current_stroke_data,used_words,turn_deadline_at,break_deadline_at,status,status_message,created_at,updated_at'

export const QUICK_DRAW_GUESS_PLAYER_SELECT = 'id,game_id,player_id,team,score,created_at'

export const QUICK_DRAW_GUESS_WORD_SELECT =
  'id,game_id,turn_index,round,team,drawer_player_id,word,status,guesser_player_id,created_at'

export const QUICK_DRAW_GUESS_GUESS_SELECT = 'id,game_id,turn_index,player_id,team,text,correct,points,created_at'

export const QUICK_DRAW_SESSION_SELECT = 'id,game_id,phase,drawing_index,turn_deadline_at,created_at,updated_at'

export const QUICK_DRAW_ASSIGNMENT_SELECT = 'id,game_id,round_id,player_id,prompt,created_at'

export const QUICK_DRAW_DRAWING_SELECT = 'id,game_id,round_id,player_id,stroke_data,submitted_at'

export const QUICK_DRAW_TITLE_SELECT = 'id,game_id,drawing_id,player_id,text,is_real,submitted_at'

export const QUICK_DRAW_VOTE_SELECT = 'id,game_id,drawing_id,player_id,chosen_title_id,voted_at'

export const ANONYMOUS_MESSAGE_SELECT =
  'id,game_id,player_id,text,created_at,reply_to_id,reply_to_text,message_type,media_url'

export const ANONYMOUS_ROOM_BAN_SELECT = 'id,game_id,player_id,banned_until,created_at'
