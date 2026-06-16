/** Slim column lists for hot-path Supabase queries (avoids select('*') egress). */

export const GAME_SELECT =
  'id,title,host_token,rounds_count,timer_seconds,operative_timer_seconds,anonymous,auto_reveal,auto_submit_behavior,participant_mode,participant_filter,pair_vote_mode,question_source,custom_questions,player_questions_enabled,player_questions_order,game_type,theme,status,current_round_number,created_at,session_started_at,allow_viewers,allow_late_players,max_players,anonymous_messages_trimmed_at,wst_quote_source,custom_slots,gender_based,codewords_player_picks,codewords_late_join,codewords_randomize_teams,pool_usage,trivia_category,bingo_call_mode,bingo_call_interval_seconds'

export const PLAYER_SELECT =
  'id,game_id,name,gender,identity_gender,participant_id,joined_at,spectator'

export const PARTICIPANT_SELECT =
  'id,game_id,name,gender,photo_url,description,display_order,in_mlt_poll,submitted_by_player_id'

export const ROUND_SELECT =
  'id,game_id,round_number,participant_ids,wyr_option_a,wyr_option_b,mlt_question,submitter_player_id,quote_text,quote_author_participant_id,quote_submitted_at,status,started_at,ended_at,anime_metadata,trivia_metadata,ttl_metadata'

export const VOTE_SELECT =
  'id,player_id,round_id,game_id,kiss_participant_id,marry_participant_id,kill_participant_id,pair_assignments,wyr_choice,target_player_id,target_participant_id,anime_choice,created_at'

export const CONFESSION_SELECT = 'id,game_id,round_id,text,created_at'

export const MONOPOLY_BOARD_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,last_dice,consecutive_doubles,property_owners,pending_space,status_message,winner_player_id,created_at,updated_at'

export const MONOPOLY_PLAYER_STATE_SELECT =
  'id,game_id,player_id,position,cash,in_jail,jail_turns,get_out_of_jail_free,bankrupt,player_order,created_at'

export const BINGO_CALLED_NUMBER_SELECT = 'id,game_id,number,called_at'

export const BINGO_CLAIM_SELECT = 'id,game_id,player_id,pattern,status,created_at'

export const BINGO_CARD_SELECT = 'id,game_id,player_id,cells,marked_indices,created_at'

export const TRIVIA_ANSWER_SELECT =
  'id,game_id,round_id,player_id,choice_index,is_correct,answered_at,response_ms,points'

export const TTL_STATEMENT_SELECT =
  'id,game_id,player_id,statement_a,statement_b,statement_c,lie_index,created_at,updated_at'

export const TTL_GUESS_SELECT =
  'id,game_id,round_id,player_id,guessed_index,is_correct,points,guessed_at'

export const WST_QUOTE_POOL_SELECT =
  'id,game_id,player_id,quote_text,author_participant_id,created_at,updated_at'

export const PLAYER_QUESTION_SELECT =
  'id,player_id,question_type,option_a,option_b,question_text'
