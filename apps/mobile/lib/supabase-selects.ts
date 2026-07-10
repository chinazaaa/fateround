export const GAME_SELECT =
  'id,title,game_type,status,current_round_number,timer_seconds,max_players,allow_viewers,allow_late_players,ayo_variant,participant_mode,pair_vote_mode,custom_questions,ludo_variant'

export const PLAYER_SELECT = 'id,game_id,name,gender,joined_at,spectator,is_eliminated'

export const PARTICIPANT_SELECT =
  'id,game_id,name,gender,photo_url,description,display_order,in_mlt_poll,submitted_by_player_id'

export const ROUND_SELECT =
  'id,game_id,round_number,participant_ids,wyr_option_a,wyr_option_b,mlt_question,submitter_player_id,quote_text,quote_author_participant_id,status,started_at,ended_at,anime_metadata,trivia_metadata,memory_match_metadata,sudoku_metadata'

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
  'id,game_id,round_id,player_id,cell_row,cell_col,submitted_value,is_correct,points_awarded'

export const TIC_TAC_TOE_SESSION_SELECT =
  'id,game_id,player_x_id,player_o_id,board,board_winners,active_board,current_turn_mark,status,winner_player_id,is_draw,status_message'

export const CHECKERS_SESSION_SELECT =
  'id,game_id,player_red_id,player_black_id,board,current_turn,must_continue_from,status,winner_player_id,is_draw,status_message'

export const AYO_SESSION_SELECT =
  'id,game_id,player_a_id,player_b_id,pits,captured_a,captured_b,houses_a,houses_b,a_row_size,b_row_size,current_turn,status,winner_player_id,is_draw,status_message'

export const BINGO_CARD_SELECT = 'id,game_id,player_id,cells,marked_indices'
export const BINGO_CALLED_NUMBER_SELECT = 'id,game_id,number'
export const TRIVIA_ANSWER_SELECT =
  'id,game_id,round_id,player_id,choice_index,is_correct,points'
