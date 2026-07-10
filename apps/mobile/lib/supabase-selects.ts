export const GAME_SELECT =
  'id,title,game_type,status,current_round_number,timer_seconds,max_players,allow_viewers,allow_late_players,ayo_variant,participant_mode,pair_vote_mode,custom_questions'

export const PLAYER_SELECT = 'id,game_id,name,gender,joined_at,spectator,is_eliminated'

export const PARTICIPANT_SELECT =
  'id,game_id,name,gender,photo_url,description,display_order,in_mlt_poll,submitted_by_player_id'

export const ROUND_SELECT =
  'id,game_id,round_number,participant_ids,wyr_option_a,wyr_option_b,mlt_question,submitter_player_id,quote_text,quote_author_participant_id,status,started_at,ended_at,anime_metadata,trivia_metadata'

export const VOTE_SELECT =
  'id,player_id,round_id,game_id,kiss_participant_id,marry_participant_id,kill_participant_id,pair_assignments,wyr_choice,target_player_id,target_participant_id,anime_choice,picked_number,created_at'

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
