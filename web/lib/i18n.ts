export type Lang = 'en' | 'zh-CN';

export type MessageKey =
  | 'landing_title'
  | 'landing_subtitle'
  | 'landing_tagline'
  | 'landing_cta_start'
  | 'landing_cta_login'
  | 'landing_feature_tree'
  | 'landing_feature_tree_zh'
  | 'landing_feature_tree_desc'
  | 'landing_feature_path'
  | 'landing_feature_path_zh'
  | 'landing_feature_path_desc'
  | 'landing_feature_export'
  | 'landing_feature_export_zh'
  | 'landing_feature_export_desc'
  | 'landing_feature_keys'
  | 'landing_feature_keys_zh'
  | 'landing_feature_keys_desc'
  | 'cta_signup'
  | 'cta_login'
  | 'cta_go_to'
  | 'home_welcome'
  | 'home_subtitle'
  | 'home_title'
  | 'home_new_tree_title'
  | 'home_new_tree_desc'
  | 'home_new_tree_cta'
  | 'home_recent_title'
  | 'home_recent_empty'
  | 'home_recent_open'
  | 'nav_help'
  | 'nav_help_desc'
  | 'nav_help_cta'
  // Settings page
  | 'settings_title'
  | 'settings_subtitle'
  | 'settings_learn_more'
  | 'settings_account'
  | 'settings_email'
  | 'settings_name'
  | 'settings_member_since'
  | 'settings_coming_soon'
  | 'settings_theme'
  | 'settings_theme_desc'
  | 'settings_theme_current'
  | 'settings_theme_toggle_hint'
  | 'settings_language'
  | 'settings_language_desc'
  | 'settings_language_label'
  | 'settings_language_save'
  | 'settings_language_saving'
  | 'settings_language_updated'
  | 'settings_language_updated_desc'
  | 'settings_language_failed'
  | 'settings_language_failed_desc'
  | 'settings_coming_next'
  | 'settings_coming_api_keys'
  | 'settings_coming_usage'
  | 'settings_coming_locale'
  | 'settings_usage_title'
  | 'settings_usage_subtitle'
  | 'settings_usage_this_month_requests'
  | 'settings_usage_this_month_tokens'
  | 'settings_usage_platform_tokens'
  | 'settings_usage_byok_tokens'
  | 'settings_usage_table_provider'
  | 'settings_usage_table_source'
  | 'settings_usage_table_requests'
  | 'settings_usage_table_tokens'
  | 'settings_usage_source_platform'
  | 'settings_usage_source_byok'
  | 'settings_usage_empty'
  // Shared trees panel
  | 'shared_trees_title'
  | 'shared_trees_desc'
  | 'shared_trees_loading'
  | 'shared_trees_retry'
  | 'shared_trees_empty'
  | 'shared_trees_shared_at'
  | 'shared_trees_created_at'
  | 'shared_trees_copy_link'
  | 'shared_trees_revoke'
  | 'shared_trees_revoke_title'
  | 'shared_trees_revoke_desc'
  | 'shared_trees_cancel'
  | 'shared_trees_views'
  | 'shared_trees_link_copied'
  | 'shared_trees_copy_failed'
  | 'shared_trees_link_revoked'
  | 'shared_trees_revoke_failed'
  // Chat toolbar
  | 'chat_view_tree'
  | 'chat_more_actions'
  | 'chat_current'
  | 'chat_copy'
  | 'chat_copy_content'
  | 'chat_generate_report'
  | 'chat_reasoning_label'
  | 'chat_reasoning_show'
  | 'chat_reasoning_hide'
  | 'chat_reasoning_empty'
  | 'chat_tree_growing'
  // Chat (genesis + input)
  | 'chat_genesis_title'
  | 'chat_input_placeholder'
  | 'ai_thinking'
  | 'ai_streaming'
  | 'ai_generation_failed'
  | 'upload_hint_native'
  | 'pins_open_timeline'
  | 'pins_open_timeline_tooltip'
  | 'pins_collapse'
  | 'outcomes_capsule_label'
  | 'outcomes_capsule_open'
  | 'outcomes_capsule_tooltip'
  | 'outcomes_count_unit'
  | 'outcome_time_just_now'
  | 'outcome_time_min_ago'
  | 'outcome_time_hour_ago'
  | 'outcome_archive_title'
  | 'outcome_empty_title'
  | 'outcome_empty_desc'
  | 'outcome_untitled'
  | 'outcome_detail'
  | 'outcome_report_ready'
  | 'outcome_rendering_hint'
  | 'story_mode_enable'
  | 'story_mode_disable'
  | 'llm_error_byok_invalid_key'
  | 'llm_error_byok_insufficient_quota'
  | 'llm_error_provider_unreachable'
  | 'llm_error_provider_rate_limited'
  | 'llm_error_provider_model_not_found'
  | 'llm_error_file_upload_failed'
  | 'llm_error_file_type_unsupported'
  | 'llm_error_timeout'
  | 'llm_error_internal_error'
  // T28-4: Header menu actions (whole tree scope)
  | 'header_export_json'
  | 'header_export_markdown'
  | 'header_share_tree'
  | 'header_copy_share_link'
  | 'header_revoke_share'
  // Context capsule
  | 'context_capsule_title'
  | 'context_capsule_profile_label'
  | 'context_capsule_scope_label'
  | 'context_capsule_token_label'
  | 'context_capsule_token_prefix'
  | 'context_capsule_scope_branch'
  | 'context_capsule_scope_tree'
  | 'context_capsule_summary_title'
  | 'context_capsule_error_retry'
  | 'context_capsule_loading'
  | 'context_capsule_missing'
  | 'context_capsule_learn_more'
  | 'context_capsule_expand'
  | 'context_capsule_collapse'
  | 'context_profile_lite_hint'
  | 'context_profile_standard_hint'
  | 'context_profile_max_hint'
  // Sidebar
  | 'sidebar_my_trees'
  | 'sidebar_new_tree'
  | 'sidebar_search_chats'
  | 'recent_chats'
  | 'search_placeholder'
  | 'sidebar_knowledge_base'
  | 'sidebar_collapse'
  | 'sidebar_expand'
  | 'app_date_today'
  | 'app_date_yesterday'
  | 'app_date_this_week'
  | 'app_date_last_week'
  | 'app_date_this_month'
  | 'app_date_last_month'
  | 'app_trees_load_failed'
  | 'app_trees_empty_title'
  | 'app_trees_empty_desc'
  | 'app_tree_placeholder_back'
  | 'app_tree_placeholder_pending'
  | 'app_trees_loading_more'
  | 'app_trees_autoload_hint'
  | 'app_workspace_placeholder'
  | 'app_workspace_personal_suffix'
  | 'knowledge_days_ago'
  | 'knowledge_status_processing'
  | 'knowledge_no_description'
  | 'knowledge_system_library'
  | 'knowledge_manage'
  // Tree actions
  | 'tree_rename'
  | 'tree_delete'
  | 'tree_delete_title'
  | 'tree_delete_desc'
  | 'tree_delete_confirm'
  | 'tree_rename_title'
  | 'tree_rename_desc'
  | 'tree_rename_label'
  | 'tree_rename_save'
  | 'export_json'
  | 'export_markdown'
  | 'tree_view_label'
  | 'tree_root_badge'
  | 'tree_view_empty'
  | 'tree_untitled'
  | 'tree_view_expand'
  | 'tree_view_collapse'
  // User menu
  | 'user_menu_settings'
  | 'user_menu_signout'
  // Grounding toggle
  | 'grounding_toggle_label'
  // Auth pages
  | 'auth_login_title'
  | 'auth_login_desc'
  | 'auth_register_title'
  | 'auth_register_desc'
  | 'auth_email'
  | 'auth_email_placeholder'
  | 'auth_password'
  | 'auth_password_hint'
  | 'auth_login_button'
  | 'auth_login_loading'
  | 'auth_register_button'
  | 'auth_register_loading'
  | 'auth_no_account'
  | 'auth_create_one'
  | 'auth_have_account'
  | 'auth_sign_in'
  | 'auth_or_continue_with'
  | 'auth_social_coming_soon'
  | 'auth_registered_success'
  | 'auth_forgot_password'
  | 'auth_legal_consent_prefix'
  | 'auth_legal_consent_terms'
  | 'auth_legal_consent_and'
  | 'auth_legal_consent_privacy'
  // Auth errors / statuses
  | 'auth_error_email_password_required'
  | 'auth_error_invalid_email'
  | 'auth_error_password_too_short'
  | 'auth_error_network'
  | 'auth_error_generic'
  | 'auth_error_email_exists'
  | 'auth_error_recaptcha_failed'
  | 'auth_error_verification_failed'
  | 'auth_error_credentials'
  | 'auth_error_access_denied'
  | 'auth_error_account_disabled'
  | 'auth_error_configuration'
  | 'auth_error_signin_failed'
  | 'auth_verified_success'
  | 'auth_already_signed_in_title'
  | 'auth_already_signed_in_desc'
  // Forgot password page
  | 'auth_forgot_title'
  | 'auth_forgot_desc'
  | 'auth_forgot_send_link'
  | 'auth_forgot_sending'
  | 'auth_forgot_success'
  | 'auth_forgot_success_desc'
  | 'auth_forgot_back_to_login'
  | 'auth_forgot_link_expires'
  // Reset password page
  | 'auth_reset_title'
  | 'auth_reset_desc'
  | 'auth_reset_new_password'
  | 'auth_reset_confirm_password'
  | 'auth_reset_button'
  | 'auth_reset_loading'
  | 'auth_reset_success'
  | 'auth_reset_success_desc'
  | 'auth_reset_invalid_link'
  | 'auth_reset_invalid_desc'
  | 'auth_reset_request_new'
  | 'auth_reset_password_mismatch'
  | 'auth_reset_password_too_short'
  // Verify email result page
  | 'auth_verify_result_ok_title'
  | 'auth_verify_result_ok_message'
  | 'auth_verify_result_expired_title'
  | 'auth_verify_result_expired_message'
  | 'auth_verify_result_invalid_title'
  | 'auth_verify_result_invalid_message'
  | 'auth_verify_result_used_title'
  | 'auth_verify_result_used_message'
  | 'auth_verify_result_error_title'
  | 'auth_verify_result_error_message'
  | 'auth_verify_result_go_to_app'
  | 'auth_verify_result_redirecting'
  | 'auth_verify_result_go_to_login'
  | 'auth_verify_result_back_home'
  | 'auth_verify_result_trouble'
  | 'auth_verify_result_contact_support'
  // Model settings (T27-2)
  | 'models_title'
  | 'models_subtitle'
  | 'models_current_provider'
  | 'models_use_default'
  | 'models_use_default_desc'
  | 'models_use_own_key'
  | 'models_use_own_key_desc'
  | 'models_my_api_keys'
  | 'models_my_api_keys_desc'
  | 'models_provider_openai'
  | 'models_provider_google'
  | 'models_api_key'
  | 'models_api_key_placeholder'
  | 'models_api_key_label'
  | 'models_configured'
  | 'models_not_configured'
  | 'models_save'
  | 'models_saving'
  | 'models_saved'
  | 'models_test_connection'
  | 'models_testing'
  | 'models_test_success'
  | 'models_test_failed'
  | 'models_switch_provider'
  | 'models_switch_success'
  | 'models_switch_failed'
  | 'models_no_key_warning'
  | 'models_delete_key'
  | 'models_delete_key_confirm'
  | 'models_key_deleted'
  | 'models_byok_notice'
  | 'models_advanced_title'
  | 'models_advanced_desc'
  | 'models_advanced_learn_more'
  | 'models_advanced_need_key'
  | 'user_menu_models'
  // Settings navigation (T26-7)
  | 'settings_nav_general'
  | 'settings_nav_general_desc'
  | 'settings_nav_conversation'
  | 'settings_nav_conversation_desc'
  | 'settings_nav_models'
  | 'settings_nav_models_desc'
  | 'settings_nav_account'
  | 'settings_nav_account_desc'
  | 'settings_nav_billing'
  | 'settings_nav_billing_desc'
  | 'settings_nav_data'
  | 'settings_nav_data_desc'
  | 'settings_nav_about'
  | 'settings_nav_about_desc'
  // Settings sections (T26-7)
  | 'settings_general_title'
  | 'settings_general_desc'
  | 'settings_conversation_title'
  | 'settings_conversation_desc'
  | 'settings_account_title'
  | 'settings_account_desc'
  | 'settings_account_change_password'
  | 'settings_billing_title'
  | 'settings_billing_desc'
  | 'settings_billing_plan'
  | 'settings_billing_plan_free'
  | 'settings_billing_plan_desc'
  | 'settings_weekly_quota_turn_label'
  | 'settings_weekly_quota_summarize_label'
  | 'settings_weekly_quota_reset_utc'
  | 'settings_weekly_quota_byok_unlimited'
  | 'settings_weekly_quota_byok_unlimited_need_key'
  | 'settings_data_title'
  | 'settings_data_desc'
  | 'settings_data_export'
  | 'settings_data_export_desc'
  | 'settings_data_delete'
  | 'settings_data_delete_desc'
  | 'settings_data_delete_account'
  | 'settings_data_confirm_delete_title'
  | 'settings_data_confirm_delete_desc'
  | 'settings_data_confirm_delete_item_trees'
  | 'settings_data_confirm_delete_item_chats'
  | 'settings_data_confirm_delete_item_links'
  | 'settings_data_confirm_delete_item_api'
  | 'settings_data_confirm_delete_warning'
  | 'settings_data_confirm_delete_type'
  | 'settings_data_delete_forever'
  | 'settings_oauth_disconnect_confirm'
  | 'settings_oauth_connected_accounts'
  | 'settings_oauth_empty'
  | 'settings_oauth_expires_on'
  | 'settings_oauth_disconnect'
  | 'settings_oauth_add_account'
  | 'settings_oauth_connect_with'
  | 'settings_account_name_placeholder'
  | 'settings_account_save'
  | 'settings_account_checking'
  | 'settings_account_set_password'
  | 'settings_account_loading'
  | 'settings_account_change_password_desc'
  | 'settings_account_set_password_desc'
  | 'settings_about_title'
  | 'settings_about_desc'
  | 'settings_about_version'
  | 'settings_about_links'
  | 'settings_about_docs'
  | 'settings_about_github'
  | 'settings_about_twitter'
  | 'settings_about_contact'
  // Quota messages (T27-3)
  | 'quota_exceeded_daily'
  | 'quota_exceeded_monthly'
  | 'quota_usage_label'
  | 'quota_daily_remaining'
  | 'quota_monthly_remaining'
  | 'delete_failed'
  | 'delete_failed_retry'
  // Delete branch/from-here dialogs
  | 'delete_branch_title'
  | 'delete_branch_desc'
  | 'delete_branch_warning'
  | 'delete_branch_cancel'
  | 'delete_branch_confirm'
  | 'delete_branch_deleting'
  | 'delete_from_here_title'
  | 'delete_from_here_desc'
  | 'delete_from_here_warning'
  // T54-1: Profile capsule for new tree
  | 'profile_lite_desc'
  | 'profile_standard_desc'
  | 'profile_max_desc'
  | 'profile_max_need_byok'
  | 'memory_scope_branch'
  | 'memory_scope_branch_desc'
  | 'memory_scope_tree'
  | 'memory_scope_tree_desc'
  // T56-1: Resume panel
  | 'tab_conversation'
  | 'tab_resume'
  | 'tab_outcome'
  | 'tab_evidence'
  | 'tab_coming_soon'
  // T58-4: Evidence UI
  | 'evidence_new'
  | 'evidence_new_url'
  | 'evidence_new_text'
  | 'evidence_new_file'
  | 'evidence_title'
  | 'evidence_summary'
  | 'evidence_url'
  | 'evidence_text'
  | 'evidence_tags_hint'
  | 'evidence_attach'
  | 'evidence_attach_existing'
  | 'evidence_attached_count'
  | 'evidence_attached_none'
  | 'evidence_empty'
  | 'evidence_drawer_nodes'
  | 'evidence_drawer_preview'
  | 'evidence_type_url'
  | 'evidence_type_text'
  | 'evidence_type_file'
  | 'evidence_loading'
  | 'evidence_current_node'
  | 'evidence_select_placeholder'
  | 'evidence_created_time'
  | 'evidence_open_original'
  | 'evidence_use_selection'
  | 'evidence_use_selection_hint'
  | 'resume_empty_title'
  | 'resume_empty_desc'
  | 'resume_generate_btn'
  | 'resume_loading'
  | 'resume_loading_desc'
  | 'resume_no_tree'
  | 'resume_retry'
  | 'resume_refresh'
  | 'resume_history'
  | 'resume_loading_existing'
  | 'resume_loading_existing_desc'
  | 'resume_generate_loading'
  | 'resume_generate_success'
  | 'resume_generate_failed'
  | 'resume_generate_failed_reason'
  // T58-7-3: Gap UI denoise
  | 'resume_coverage_label'
  | 'resume_coverage_tooltip'
  | 'resume_delta_since'
  | 'resume_delta_nodes'
  | 'resume_delta_evidence'
  | 'resume_sources_hint'
  | 'resume_attach_evidence'
  | 'resume_sources_missing_hint'
  | 'resume_section_now'
  | 'resume_section_diary'
  | 'resume_section_facts'
  | 'resume_section_open_loops'
  | 'resume_section_next_actions'
  | 'resume_section_artifacts'
  | 'resume_facts_label'
  | 'resume_inferences_label'
  | 'resume_empty_diary'
  | 'resume_empty_facts'
  | 'resume_empty_open_loops'
  | 'resume_empty_actions'
  | 'resume_empty_artifacts'
  // T57-1: Outcome outline (Step 1)
  | 'outcome_no_tree'
  | 'outcome_need_snapshot'
  | 'outcome_need_snapshot_desc'
  | 'outcome_outline_title'
  | 'outcome_outline_subtitle'
  | 'outcome_gap_label'
  | 'outcome_snapshot_label'
  | 'outcome_type_label'
  | 'outcome_type_brief'
  | 'outcome_type_decision'
  | 'outcome_type_report'
  | 'outcome_generate_btn'
  | 'outcome_refresh'
  | 'outcome_snapshot_hint'
  | 'outcome_outline_heading'
  | 'outcome_evidence_heading'
  | 'outcome_outline_empty'
  | 'outcome_evidence_empty'
  | 'outcome_status_ready'
  | 'outcome_status_gap'
  // T57-2: Outcome editable UI
  | 'outcome_edit_section'
  | 'outcome_edit_placeholder'
  | 'outcome_gaps'
  | 'outcome_need_material'
  | 'outcome_ready'
  | 'outcome_ignored'
  | 'outcome_needs_material_hint'
  | 'outcome_regenerate_with_evidence'
  | 'outcome_regenerate_hint'
  | 'outcome_refresh_with_evidence'
  | 'outcome_attach_prompt'
  | 'outcome_attach_evidence'
  | 'outcome_refresh_notice'
  | 'outcome_refresh_conflict'
  | 'outcome_export'
  | 'outcome_export_success'
  | 'outcome_export_download'
  | 'outcome_export_copied_desc'
  | 'outcome_export_download_desc'
  | 'outcome_export_retry'
  | 'outcome_export_retry_desc'
  | 'outcome_export_fail'
  | 'outcome_last_updated'
  // T58-9-0: Evidence create flow
  | 'evidence_created'
  | 'evidence_attach_hint'
  | 'evidence_title_optional'
  | 'saving'
  | 'cancel'
  | 'save'
  | 'curation_overlay_title'
  | 'keyframes_count_label'
  | 'keyframe_annotation_placeholder'
  // T72: Keyframe explainer
  | 'kf_explainer_title'
  | 'kf_reason_first'
  | 'kf_reason_last'
  | 'kf_reason_deepest'
  | 'kf_reason_fork'
  | 'kf_reason_leaf'
  | 'kf_reason_retry'
  | 'kf_reason_deep_dive'
  | 'kf_reason_attachment'
  | 'kf_reason_model_switch'
  | 'kf_reason_error_kw'
  | 'kf_reason_decide_kw'
  | 'kf_reason_why_kw'
  | 'kf_reason_summary_kw'
  // Expandable capsule
  | 'capsule_expand'
  | 'capsule_collapse'
  // T88: Upload UX polish
  | 'upload_formats_hint'
  | 'upload_max_size_hint'
  | 'upload_error_unsupported_type'
  | 'upload_error_file_too_large'
  | 'upload_error_quota_tree_exceeded'
  | 'upload_error_quota_user_exceeded'
  | 'upload_error_quota_file_limit'
  | 'upload_error_weekly_quota_exceeded'
  | 'upload_error_parse_failed'
  | 'upload_error_generic'
  | 'upload_attachment_label'
  // P1-4: Unified toolbox panel
  | 'toolbox_title'
  | 'toolbox_tab_keyframes'
  | 'toolbox_tab_trail'
  | 'toolbox_tab_snapshot'
  | 'toolbox_tab_diff'
  | 'toolbox_snapshot_empty'
  | 'toolbox_snapshot_empty_desc'
  | 'toolbox_snapshot_create'
  | 'toolbox_snapshot_creating'
  | 'toolbox_snapshot_view_history'
  | 'toolbox_snapshot_created_at'
  | 'toolbox_snapshot_keyframes_count'
  | 'toolbox_snapshot_replay'
  | 'toolbox_diff_empty'
  | 'toolbox_diff_empty_desc'
  | 'toolbox_diff_select_first'
  | 'toolbox_diff_select_second'
  | 'toolbox_diff_compare'
  | 'toolbox_diff_comparing'
  | 'toolbox_diff_use_snapshot'
  | 'toolbox_back'
  // Toast: workspace
  | 'toast_workspace_switched'
  | 'toast_workspace_switch_failed'
  // Toast: tree CRUD
  | 'toast_tree_deleted'
  | 'toast_tree_deleted_desc'
  | 'toast_tree_delete_failed'
  | 'toast_tree_delete_failed_desc'
  | 'toast_tree_title_required'
  | 'toast_tree_title_required_desc'
  | 'toast_tree_renamed'
  | 'toast_tree_renamed_desc'
  | 'toast_tree_rename_failed'
  | 'toast_tree_rename_failed_desc'
  // Toast: export
  | 'toast_exported'
  | 'toast_export_json_desc'
  | 'toast_export_md_desc'
  | 'toast_export_failed'
  | 'toast_export_tree_failed'
  | 'toast_export_md_failed'
  // Toast: share
  | 'toast_link_copied'
  | 'toast_copy_failed'
  | 'toast_share_revoked'
  | 'toast_share_created_copied'
  | 'toast_share_created'
  | 'toast_share_update_failed'
  // Toast: upload
  | 'toast_upload_no_tree'
  | 'toast_upload_no_tree_desc'
  // Toast: knowledge base
  | 'toast_kb_no_docs'
  | 'toast_kb_docs_processing'
  | 'toast_kb_load_failed'
  | 'toast_kb_search_failed'
  | 'toast_kb_redirect_soon'
  | 'toast_kb_redirect_soon_desc'
  | 'toast_kb_docs_load_failed'
  | 'toast_kb_file_too_large'
  | 'toast_kb_upload_success'
  | 'toast_kb_file_duplicate'
  | 'toast_kb_file_duplicate_desc'
  | 'toast_kb_upload_failed'
  | 'toast_kb_settings_saved'
  | 'toast_kb_settings_saved_desc'
  | 'toast_kb_save_failed'
  | 'toast_kb_deleted'
  | 'toast_kb_deleted_desc'
  | 'toast_kb_delete_failed'
  | 'toast_kb_doc_renamed'
  | 'toast_kb_doc_rename_failed'
  | 'toast_kb_doc_deleted'
  | 'toast_kb_doc_delete_failed'
  | 'toast_kb_detail_load_failed'
  | 'toast_kb_load_more_failed'
  | 'toast_kb_created'
  // Toast: evidence
  | 'toast_evidence_title_required'
  | 'toast_evidence_file_required'
  // Toast: settings account
  | 'toast_name_updated'
  | 'toast_name_updated_desc'
  | 'toast_update_failed'
  | 'toast_update_failed_desc'
  // Toast: settings data
  | 'toast_delete_protected'
  | 'toast_delete_protected_desc'
  | 'toast_account_deleted'
  | 'toast_account_deleted_desc'
  | 'toast_delete_failed'
  | 'toast_delete_failed_desc'
  // Toast: OAuth
  | 'toast_oauth_load_failed'
  | 'toast_oauth_load_failed_desc'
  | 'toast_oauth_disconnected'
  | 'toast_oauth_disconnected_desc'
  | 'toast_oauth_disconnect_failed'
  | 'toast_oauth_disconnect_failed_desc'
  | 'toast_oauth_connect_failed'
  | 'toast_oauth_connect_failed_desc'
  // Toast: models
  | 'toast_models_fetch_first'
  | 'toast_models_enabled_saved'
  | 'toast_models_save_failed'
  | 'toast_models_fetched_count'
  | 'toast_models_fetch_failed'
  // Toast: advanced context
  | 'toast_advanced_blocked'
  | 'toast_advanced_updated'
  | 'toast_advanced_enabled_desc'
  | 'toast_advanced_disabled_desc'
  | 'toast_advanced_update_failed'
  // Toast: BYOK
  | 'toast_byok_key_saved'
  | 'toast_byok_key_saved_desc'
  | 'toast_byok_save_failed'
  | 'toast_byok_models_fetched'
  | 'toast_byok_models_select'
  | 'toast_byok_fetch_failed'
  | 'toast_byok_select_first'
  | 'toast_byok_test_success'
  | 'toast_byok_test_failed'
  | 'toast_byok_test_required'
  | 'toast_byok_enabled'
  | 'toast_byok_update_failed'
  | 'toast_byok_deleted'
  | 'toast_byok_delete_failed'
  // Toast: email verification
  | 'toast_verify_rate_limit'
  | 'toast_verify_rate_limit_desc'
  | 'toast_verify_send_failed'
  | 'toast_verify_send_failed_desc'
  | 'toast_verify_already'
  | 'toast_verify_already_desc'
  | 'toast_verify_sent'
  | 'toast_verify_sent_desc'
  | 'toast_verify_error'
  | 'toast_verify_error_desc'
  | 'verify_banner_sent_to'
  | 'verify_banner_fallback_email'
  | 'verify_banner_unverified'
  | 'verify_banner_send_code'
  | 'verify_banner_sending'
  | 'verify_banner_dismiss'
  // Toast: outcome
  | 'toast_outcome_suggest_failed'
  | 'toast_outcome_created'
  | 'toast_outcome_created_desc'
  | 'toast_outcome_create_failed'
  | 'toast_outcome_published'
  | 'toast_outcome_published_desc'
  | 'toast_outcome_publish_failed'
  | 'toast_outcome_unpublished'
  | 'toast_outcome_unpublished_desc'
  | 'toast_outcome_unpublish_failed'
  // Toast: resume
  | 'toast_resume_title'
  | 'toast_resume_desc'
  | 'toast_resume_action'
  // Toast: annotation
  | 'toast_annotation_failed'
  | 'toast_annotation_update_failed'
  | 'toast_annotation_delete_failed'
  // Toast: context navigation
  | 'toast_nav_cannot_locate'
  | 'toast_nav_cannot_locate_desc'
  | 'toast_nav_notice'
  | 'toast_nav_notice_desc'
  | 'toast_nav_failed'
  | 'toast_nav_failed_desc'
  | 'toast_nav_cannot_locate_keyframe'
  | 'toast_nav_cannot_locate_keyframe_desc'
  | 'toast_nav_cannot_open_outcome'
  | 'toast_nav_cannot_open_outcome_desc'
  | 'toast_nav_open_outcome_failed'
  | 'toast_nav_open_outcome_failed_desc'
  | 'toast_nav_unknown_source'
  // Toast: evidence attach
  | 'toast_evidence_select_node'
  | 'toast_evidence_attach_failed'
  // Toast: streaming & generation
  | 'toast_usage_reminder'
  | 'toast_gen_failed'
  | 'toast_stream_error'
  | 'toast_something_wrong'
  // Toast: upload sending guards
  | 'toast_upload_in_progress'
  | 'toast_upload_in_progress_desc'
  | 'toast_upload_some_failed'
  | 'toast_upload_some_failed_desc'
  | 'toast_upload_not_ready'
  | 'toast_upload_not_ready_desc'
  | 'toast_upload_limit_desc'
  // Toast: upload file type hints
  | 'toast_upload_allowed_in_mode'
  | 'toast_upload_tip_switch_model'
  | 'toast_upload_supported'
  | 'toast_upload_tip_audio'
  // Toast: branch & node management
  | 'toast_branch_deleted'
  | 'toast_branch_deleted_desc'
  | 'toast_branch_delete_failed'
  | 'toast_branch_delete_failed_desc'
  | 'toast_cannot_delete'
  | 'toast_cannot_delete_desc'
  | 'toast_deleted'
  | 'toast_deleted_desc'
  | 'toast_delete_failed_generic'
  | 'toast_delete_failed_retry'
  | 'toast_cannot_edit'
  | 'toast_cannot_edit_user_only'
  | 'toast_question_updated'
  | 'toast_question_updated_desc'
  // Toast: image upload (admin editor)
  | 'toast_image_upload_failed'
  // Toast: model settings
  | 'toast_model_save_failed'
  // BYOK UI copy
  | 'byok_connection_success'
  | 'byok_test_failed'
  | 'byok_network_error'
  | 'byok_save_failed'
  | 'byok_fetch_models_failed'
  | 'byok_models_count'
  | 'byok_models_found_count'
  | 'byok_no_models_found'
  | 'byok_select_models_to_enable'
  | 'byok_select_at_least_one_model'
  | 'byok_step_fetch_model_list'
  | 'byok_fetch_models'
  | 'byok_select_models'
  | 'byok_selected'
  | 'byok_first_model_for_test'
  | 'byok_test_connection'
  | 'byok_enable_requires_test'
  | 'byok_enable_provider'
  | 'byok_enable_provider_named'
  | 'byok_enable_provider_desc'
  | 'byok_test_passed'
  | 'byok_models_enabled_count'
  | 'byok_enabled'
  | 'byok_steps_description'
  | 'byok_delete_api_key_title'
  | 'byok_delete_api_key_desc'
  | 'byok_pass_test_first'
  // BYOK Ollama
  | 'byok_ollama_url_saved'
  | 'byok_ollama_cannot_connect_detail'
  | 'byok_ollama_cannot_connect_title'
  | 'byok_ollama_ensure_local'
  | 'byok_ollama_no_models_installed'
  | 'byok_ollama_install_hint'
  | 'byok_ollama_cannot_connect_short'
  | 'byok_ollama_ensure_running'
  | 'byok_ollama_connection_success_detail'
  | 'byok_ollama_connection_success'
  | 'byok_ollama_configuration_deleted'
  | 'byok_ollama_local_models'
  | 'byok_ollama_local_models_desc'
  | 'byok_connection_url'
  | 'byok_ollama_url_hint'
  | 'byok_fetch_local_models'
  | 'byok_enable_ollama_requires_test'
  | 'byok_enable_ollama'
  | 'byok_enable_ollama_local_models'
  | 'byok_enable_ollama_desc'
  | 'byok_delete_ollama_title'
  | 'byok_delete_ollama_desc'
  // Toast: generic
  | 'toast_operation_failed'
  | 'toast_operation_retry'
  | 'toast_loading_failed'
  | 'toast_tree_loading';

type Messages = Record<MessageKey, string>;

const en: Messages = {
  landing_title: 'Turn your AI chats into trees.',
  landing_subtitle: 'oMyTree helps you see how your thinking branches and grows — one question, one node at a time. Visualize, revisit, and reuse complex AI conversations as a living tree.',
  landing_tagline: 'See how your thinking branches and grows.',
  landing_cta_start: 'Start Using',
  landing_cta_login: 'Login',
  landing_feature_tree: 'Tree Visualizer',
  landing_feature_tree_zh: '对话变树',
  landing_feature_tree_desc: 'Turn linear chats into branching trees of thought. Every question creates a new branch, making your thinking visible.',
  landing_feature_path: 'Path View & History',
  landing_feature_path_zh: '路径视图 & 全历史',
  landing_feature_path_desc: 'Jump to any turn, replay the path, and never lose context. Navigate your conversation history with ease.',
  landing_feature_export: 'Export & Share',
  landing_feature_export_zh: '导出 & 分享',
  landing_feature_export_desc: 'Export your trees to JSON or Markdown and share them anywhere. Create public links for collaboration.',
  landing_feature_keys: 'Accounts & API Keys',
  landing_feature_keys_zh: '账号与 API Key',
  landing_feature_keys_desc: 'Use your own API keys. Keep your prompts and data under your control. Full privacy, no middleman.',
  cta_signup: 'Sign up',
  cta_login: 'Log in',
  cta_go_to: 'Go to my trees',
  home_welcome: 'Welcome back',
  home_subtitle: 'Pick a tree to continue, or start a new one.',
  home_title: 'Your trees, front and center.',
  home_new_tree_title: 'New tree',
  home_new_tree_desc: 'Start a fresh conversation tree from your next question.',
  home_new_tree_cta: 'Start a new tree',
  home_recent_title: 'Recent trees',
  home_recent_empty: 'No trees yet. Create one to get started.',
  home_recent_open: 'Open →',
  nav_help: 'Help',
  nav_help_desc: 'Learn how to turn your AI chats into trees with our quick start guide.',
  nav_help_cta: 'Getting started',
  // Settings page
  settings_title: 'Settings',
  settings_subtitle: 'Manage your account basics and preview upcoming options.',
  settings_learn_more: 'Learn more about oMyTree →',
  settings_account: 'Account',
  settings_email: 'Email',
  settings_name: 'Name',
  settings_member_since: 'Member since',
  settings_coming_soon: 'Coming soon',
  settings_theme: 'Theme',
  settings_theme_desc: 'oMyTree currently remembers the theme on this device.',
  settings_theme_current: 'Current theme',
  settings_theme_toggle_hint: 'Use the toggle in the top-right corner to switch between Light and Dark.',
  settings_language: 'Language',
  settings_language_desc: 'Choose your preferred language for core UI text.',
  settings_language_label: 'Preferred language',
  settings_language_save: 'Save language',
  settings_language_saving: 'Saving...',
  settings_language_updated: 'Language updated',
  settings_language_updated_desc: 'We will use this language going forward.',
  settings_language_failed: 'Failed to update language',
  settings_language_failed_desc: 'Please try again.',
  settings_coming_next: 'Coming next',
  settings_coming_api_keys: 'API keys for external LLMs',
  settings_coming_usage: 'Per-user usage & limits',
  settings_coming_locale: 'Language / locale preferences',
  settings_usage_title: 'Usage',
  settings_usage_subtitle: 'See how much you and your API keys have used this month.',
  settings_usage_this_month_requests: 'This month requests',
  settings_usage_this_month_tokens: 'This month tokens',
  settings_usage_platform_tokens: 'Platform default',
  settings_usage_byok_tokens: 'Your API keys',
  settings_usage_table_provider: 'Provider',
  settings_usage_table_source: 'Source',
  settings_usage_table_requests: 'Requests',
  settings_usage_table_tokens: 'Tokens',
  settings_usage_source_platform: 'Platform',
  settings_usage_source_byok: 'Your keys',
  settings_usage_empty: 'No usage recorded yet.',
  // Shared trees panel
  shared_trees_title: 'Shared trees',
  shared_trees_desc: 'These trees are currently accessible via public links. You can copy or revoke links here.',
  shared_trees_loading: 'Loading shared trees…',
  shared_trees_retry: 'Retry',
  shared_trees_empty: 'No shared trees yet. You can generate share links from the Tree Drawer inside a tree.',
  shared_trees_shared_at: 'Shared',
  shared_trees_created_at: 'Created',
  shared_trees_copy_link: 'Copy link',
  shared_trees_revoke: 'Revoke',
  shared_trees_revoke_title: 'Revoke share link for this tree?',
  shared_trees_revoke_desc: 'Visitors will no longer be able to view this tree via the existing link.',
  shared_trees_cancel: 'Cancel',
  shared_trees_views: 'Views',
  shared_trees_link_copied: 'Link copied',
  shared_trees_copy_failed: 'Failed to copy',
  shared_trees_link_revoked: 'Link revoked',
  shared_trees_revoke_failed: 'Failed to revoke',
  // Chat toolbar
  chat_view_tree: 'View tree',
  chat_more_actions: 'More actions',
  chat_current: 'Current',
  chat_copy: 'Copy',
  chat_copy_content: 'Copy content',
  chat_generate_report: 'New outcome',
  chat_reasoning_label: 'Reasoning',
  chat_reasoning_show: 'Show reasoning',
  chat_reasoning_hide: 'Hide reasoning',
  chat_reasoning_empty: 'No reasoning available',
  chat_tree_growing: 'Your tree is growing…',
  chat_genesis_title: 'Ask anything, and let your tree start growing...',
  chat_input_placeholder: 'Ask anything and watch your tree grow.',
  ai_thinking: 'Thinking…',
  ai_streaming: 'Generating',
  ai_generation_failed: 'Generation failed',
  upload_hint_native: 'Files will be parsed by the model natively. Local preview is disabled for this provider.',
  pins_open_timeline: 'Open Story Timeline',
  pins_open_timeline_tooltip: 'Thread automatically connects your annotated nodes.',
  pins_collapse: 'Collapse',
  outcomes_capsule_label: 'Outcomes',
  outcomes_capsule_open: 'Open outcomes',
  outcomes_capsule_tooltip: 'Generate and review outcome reports for selected nodes.',
  outcomes_count_unit: 'outcomes',
  outcome_time_just_now: 'just now',
  outcome_time_min_ago: '{count}m ago',
  outcome_time_hour_ago: '{count}h ago',
  outcome_archive_title: 'Archive',
  outcome_empty_title: 'No Outcome yet',
  outcome_empty_desc: 'Click "New" on anchor to save insights',
  outcome_untitled: 'Untitled',
  outcome_detail: 'Detail',
  outcome_report_ready: 'Report Ready',
  outcome_rendering_hint: 'Rendering archival view on canvas...',
  story_mode_enable: 'Enable Thread Mode',
  story_mode_disable: 'Disable Thread Mode',
  llm_error_byok_invalid_key: 'Your {provider} API key is invalid or expired. Please update it in Settings.',
  llm_error_byok_insufficient_quota: 'Your {provider} balance or quota is insufficient. Please top up in the provider console or switch models.',
  llm_error_provider_unreachable: 'Cannot reach {provider} right now. Please check your network or try again later.',
  llm_error_provider_rate_limited: 'Too many requests to {provider}. Please slow down, retry shortly, or switch models.',
  llm_error_provider_model_not_found: 'The selected model is not enabled for {provider}. Please refresh models in Settings and re-enable it.',
  llm_error_file_upload_failed: 'Failed to upload file to {provider}. Please retry or switch models.',
  llm_error_file_type_unsupported: '{provider} does not support this file type. Please upload a supported file.',
  llm_error_timeout: '{provider} did not respond in time. Please retry or choose another model.',
  llm_error_internal_error: 'An unknown error occurred with {provider}. We have logged it—please try again.',
  // T28-4: Header menu actions (whole tree scope)
  header_export_json: 'Export whole tree as JSON',
  header_export_markdown: 'Export whole tree as Markdown',
  header_share_tree: 'Share this tree',
  header_copy_share_link: 'Copy share link',
  header_revoke_share: 'Revoke share',
  // Context capsule
  context_capsule_title: 'Context info',
  context_capsule_profile_label: 'Profile:',
  context_capsule_scope_label: 'Memory scope:',
  context_capsule_token_label: 'Token:',
  context_capsule_token_prefix: 'Approx answer limit',
  context_capsule_scope_branch: 'Branch memory',
  context_capsule_scope_tree: 'Whole tree + summary',
  context_capsule_summary_title: 'Tree summary',
  context_capsule_error_retry: 'Last generation failed, will retry automatically.',
  context_capsule_loading: 'Loading...',
  context_capsule_missing: 'Tree summary not generated yet. It will be created in the background.',
  context_capsule_learn_more: 'Learn how context profiles work →',
  context_capsule_expand: 'Show more',
  context_capsule_collapse: 'Collapse',
  context_profile_lite_hint: 'Lite: concise, keeps the last exchange to stay on track',
  context_profile_standard_hint: 'Standard: balanced context with recent dialogue',
  context_profile_max_hint: 'Max: deepest memory with tree overview (BYOK only)',
  // Sidebar
  sidebar_my_trees: 'My trees',
  sidebar_new_tree: 'New Chat',
  sidebar_search_chats: 'Search Chat',
  recent_chats: 'Recent Chats',
  search_placeholder: 'Search Chat',
  sidebar_knowledge_base: 'Knowledge Base',
  sidebar_collapse: 'Collapse sidebar',
  sidebar_expand: 'Open sidebar',
  app_date_today: 'Today',
  app_date_yesterday: 'Yesterday',
  app_date_this_week: 'This week',
  app_date_last_week: 'Last week',
  app_date_this_month: 'This month',
  app_date_last_month: 'Last month',
  app_trees_load_failed: 'Failed to load trees',
  app_trees_empty_title: 'No trees yet',
  app_trees_empty_desc: 'Click "New tree" above to start',
  app_tree_placeholder_back: 'Back to this conversation',
  app_tree_placeholder_pending: 'Creating conversation, switch available soon',
  app_trees_loading_more: 'Loading...',
  app_trees_autoload_hint: 'Scroll to auto-load more conversations',
  app_workspace_placeholder: 'Workspace',
  app_workspace_personal_suffix: '(Personal)',
  knowledge_days_ago: '{count} days ago',
  knowledge_status_processing: 'Processing',
  knowledge_no_description: 'No description',
  knowledge_system_library: 'System library',
  knowledge_manage: 'Manage',
  // Tree actions
  tree_rename: 'Rename',
  tree_delete: 'Delete',
  tree_delete_title: 'Delete this tree?',
  tree_delete_desc: 'This will permanently delete this tree and all its branches. This cannot be undone.',
  tree_delete_confirm: 'Delete',
  tree_rename_title: 'Rename tree',
  tree_rename_desc: 'Enter a new name for this tree.',
  tree_rename_label: 'Name',
  tree_rename_save: 'Save',
  export_json: 'Export JSON',
  export_markdown: 'Export Markdown',
  tree_view_label: 'View:',
  tree_root_badge: 'R',
  tree_view_empty: 'Start a chat to grow the tree here',
  tree_untitled: 'Untitled',
  tree_view_expand: 'Expand tree view',
  tree_view_collapse: 'Collapse tree view',
  // User menu
  user_menu_settings: 'Settings',
  user_menu_signout: 'Sign out',
  // Grounding toggle
  grounding_toggle_label: 'Web',
  // Auth pages
  auth_login_title: 'Sign in to oMyTree',
  auth_login_desc: 'Use your email and password to continue.',
  auth_register_title: 'Create your oMyTree account',
  auth_register_desc: 'Sign up with your email and a password.',
  auth_email: 'Email',
  auth_email_placeholder: 'you@example.com',
  auth_password: 'Password',
  auth_password_hint: 'Must be at least 8 characters.',
  auth_login_button: 'Sign in',
  auth_login_loading: 'Signing in...',
  auth_register_button: 'Create account',
  auth_register_loading: 'Creating...',
  auth_no_account: "Don't have an account?",
  auth_create_one: 'Create one',
  auth_have_account: 'Already have an account?',
  auth_sign_in: 'Sign in',
  auth_or_continue_with: 'Or continue with',
  auth_social_coming_soon: 'Social login coming soon',
  auth_registered_success: 'Account created successfully! Please sign in.',
  auth_forgot_password: 'Forgot password?',
  auth_legal_consent_prefix: 'By creating an account, you agree to our',
  auth_legal_consent_terms: 'Terms of Service',
  auth_legal_consent_and: 'and',
  auth_legal_consent_privacy: 'Privacy Policy',
  auth_error_email_password_required: 'Please enter your email and password.',
  auth_error_invalid_email: 'Please enter a valid email address.',
  auth_error_password_too_short: 'Password must be at least 8 characters.',
  auth_error_network: 'Network error. Please try again.',
  auth_error_generic: 'Something went wrong. Please try again.',
  auth_error_email_exists: 'This email is already registered. Try signing in instead.',
  auth_error_recaptcha_failed: 'reCAPTCHA verification failed. Please retry.',
  auth_error_verification_failed: 'Verification failed. Please retry.',
  auth_error_credentials: 'Email or password is incorrect.',
  auth_error_access_denied: 'Access denied. Please try again.',
  auth_error_account_disabled: 'This account has been disabled. Please contact support.',
  auth_error_configuration: 'Configuration issue detected. Please try again soon.',
  auth_error_signin_failed: 'Sign in failed. Please try again.',
  auth_verified_success: 'Email verified successfully! Please sign in to continue.',
  auth_already_signed_in_title: 'You are already signed in',
  auth_already_signed_in_desc: 'Redirecting you to your workspace...',
  // Forgot password page
  auth_forgot_title: 'Forgot your password?',
  auth_forgot_desc: "Enter your email and we'll send you a link to reset it.",
  auth_forgot_send_link: 'Send reset link',
  auth_forgot_sending: 'Sending...',
  auth_forgot_success: 'Check your inbox',
  auth_forgot_success_desc: "If this email exists, we've sent a reset link. Check your inbox and spam folder.",
  auth_forgot_back_to_login: 'Back to sign in',
  auth_forgot_link_expires: 'Link expires in 24 hours',
  // Reset password page
  auth_reset_title: 'Set a new password',
  auth_reset_desc: 'Choose a strong password to secure your account.',
  auth_reset_new_password: 'New password',
  auth_reset_confirm_password: 'Confirm password',
  auth_reset_button: 'Reset password',
  auth_reset_loading: 'Resetting...',
  auth_reset_success: 'Password updated',
  auth_reset_success_desc: 'Your password has been reset. Redirecting to sign in...',
  auth_reset_invalid_link: 'Invalid or expired link',
  auth_reset_invalid_desc: 'This reset link is invalid or has expired. Please request a new one.',
  auth_reset_request_new: 'Request a new link',
  auth_reset_password_mismatch: 'Passwords do not match',
  auth_reset_password_too_short: 'Password must be at least 8 characters',
  // Verify email result page
  auth_verify_result_ok_title: 'Email Verified!',
  auth_verify_result_ok_message: 'Your email has been successfully verified. You can now enjoy all features of oMyTree.',
  auth_verify_result_expired_title: 'Link Expired',
  auth_verify_result_expired_message: 'This verification link has expired. Please log in and request a new verification email.',
  auth_verify_result_invalid_title: 'Invalid Link',
  auth_verify_result_invalid_message: 'This verification link is invalid or has already been used. Please request a new one.',
  auth_verify_result_used_title: 'Already Verified',
  auth_verify_result_used_message: 'This verification link has already been used. Your email is verified.',
  auth_verify_result_error_title: 'Something Went Wrong',
  auth_verify_result_error_message: 'An error occurred while verifying your email. Please try again later or contact support.',
  auth_verify_result_go_to_app: 'Go to App',
  auth_verify_result_redirecting: 'Redirecting to app in 5 seconds...',
  auth_verify_result_go_to_login: 'Go to Login',
  auth_verify_result_back_home: 'Back to Home',
  auth_verify_result_trouble: 'Having trouble?',
  auth_verify_result_contact_support: 'Contact Support',
  // Model settings (T27-2)
  models_title: 'Models & API Keys',
  models_subtitle: 'Choose how oMyTree connects to AI models for your conversations.',
  models_current_provider: 'Current chat model',
  models_use_default: 'Use oMyTree default model',
  models_use_default_desc: 'Recommended. Uses our managed AI service with no setup required.',
  models_use_own_key: 'Use my own API key',
  models_use_own_key_desc: 'Connect with your own OpenAI or Google API key.',
  models_my_api_keys: 'My API Keys',
  models_my_api_keys_desc: 'Configure your API keys for external LLM providers.',
  models_provider_openai: 'OpenAI',
  models_provider_google: 'Google AI',
  models_api_key: 'API Key',
  models_api_key_placeholder: 'sk-... or AIza...',
  models_api_key_label: 'Label (optional)',
  models_configured: 'Configured',
  models_not_configured: 'Not configured',
  models_save: 'Save',
  models_saving: 'Saving...',
  models_saved: 'Saved!',
  models_test_connection: 'Test connection',
  models_testing: 'Testing...',
  models_test_success: 'Connection successful!',
  models_test_failed: 'Connection failed',
  models_switch_provider: 'Switch provider',
  models_switch_success: 'Provider switched',
  models_switch_failed: 'Failed to switch provider',
  models_no_key_warning: 'Please configure an API key first.',
  models_delete_key: 'Delete key',
  models_delete_key_confirm: 'Delete this API key?',
  models_key_deleted: 'API key deleted',
  models_byok_notice: 'Using your own key means usage is billed by the provider. oMyTree does not store your prompts.',
  models_advanced_title: 'Advanced context profiles',
  models_advanced_desc: 'When on, only your BYOK models can be used. The platform default model is disabled.',
  models_advanced_learn_more: 'Learn how context profiles work',
  models_advanced_need_key: 'Add and enable at least one BYOK API key to turn on advanced mode.',
  user_menu_models: 'Models & API Keys',
  byok_connection_success: 'Connection successful',
  byok_test_failed: 'Test failed',
  byok_network_error: 'Network error',
  byok_save_failed: 'Save failed',
  byok_fetch_models_failed: 'Fetch models failed',
  byok_models_count: '{count} models',
  byok_models_found_count: 'Models found ({count})',
  byok_no_models_found: 'No models found',
  byok_select_models_to_enable: 'Select models to enable',
  byok_select_at_least_one_model: 'Select at least one model first',
  byok_step_fetch_model_list: 'Fetch Model List',
  byok_fetch_models: 'Fetch Models',
  byok_select_models: 'Select Models',
  byok_selected: 'selected',
  byok_first_model_for_test: 'The first selected model will be used for connection test',
  byok_test_connection: 'Test Connection',
  byok_enable_requires_test: '⚠️ You must pass the connection test before enabling this provider',
  byok_enable_provider: 'Enable Provider',
  byok_enable_provider_named: 'Enable {provider}',
  byok_enable_provider_desc: 'When enabled, models from this provider will appear in the model picker',
  byok_test_passed: 'Test passed',
  byok_models_enabled_count: '{count} models enabled',
  byok_enabled: 'Enabled',
  byok_steps_description: 'Follow the steps to configure providers: Enter key → Fetch models → Select models → Test → Enable',
  byok_delete_api_key_title: 'Delete API Key',
  byok_delete_api_key_desc: 'Are you sure you want to delete this API key? This will also remove all saved model settings.',
  byok_pass_test_first: 'Pass connection test first',
  byok_ollama_url_saved: 'Ollama URL saved',
  byok_ollama_cannot_connect_detail: 'Cannot connect to Ollama ({baseUrl}). Please ensure Ollama is running.',
  byok_ollama_cannot_connect_title: 'Cannot connect to Ollama',
  byok_ollama_ensure_local: 'Please ensure Ollama is running locally',
  byok_ollama_no_models_installed: 'No models installed in Ollama',
  byok_ollama_install_hint: "Please install models with 'ollama pull' first",
  byok_ollama_cannot_connect_short: 'Cannot connect to Ollama ({baseUrl})',
  byok_ollama_ensure_running: 'Please ensure Ollama is running',
  byok_ollama_connection_success_detail: 'Connection successful ({elapsed}ms, model: {model})',
  byok_ollama_connection_success: 'Ollama connection successful!',
  byok_ollama_configuration_deleted: 'Ollama configuration deleted',
  byok_ollama_local_models: 'Ollama Local Models',
  byok_ollama_local_models_desc: 'Connect to a locally running Ollama instance. No API key needed, data stays on your machine.',
  byok_connection_url: 'Connection URL',
  byok_ollama_url_hint: 'Make sure Ollama is running. For remote machines, enter the appropriate URL.',
  byok_fetch_local_models: 'Fetch Local Models',
  byok_enable_ollama_requires_test: '⚠️ You must pass the connection test before enabling Ollama',
  byok_enable_ollama: 'Enable Ollama',
  byok_enable_ollama_local_models: 'Enable Ollama Local Models',
  byok_enable_ollama_desc: 'When enabled, local models will appear in the model picker',
  byok_delete_ollama_title: 'Delete Ollama Configuration',
  byok_delete_ollama_desc: 'Are you sure you want to delete the Ollama configuration? This will also remove all saved model settings.',
  // Settings navigation (T26-7)
  settings_nav_general: 'General',
  settings_nav_general_desc: 'Language, theme, and display preferences',
  settings_nav_conversation: 'Conversation & UI',
  settings_nav_conversation_desc: 'Tree canvas and chat preferences',
  settings_nav_models: 'Models & API',
  settings_nav_models_desc: 'LLM provider and API keys',
  settings_nav_account: 'Account & Security',
  settings_nav_account_desc: 'Email, name, and password',
  settings_nav_billing: 'Billing & Plan',
  settings_nav_billing_desc: 'Subscription and usage',
  settings_nav_data: 'Data & Export',
  settings_nav_data_desc: 'Export trees and manage data',
  settings_nav_about: 'About oMyTree',
  settings_nav_about_desc: 'Version and links',
  // Settings sections (T26-7)
  settings_general_title: 'General',
  settings_general_desc: 'Customize your language and appearance preferences.',
  settings_conversation_title: 'Conversation & UI',
  settings_conversation_desc: 'Configure tree canvas and chat interface preferences.',
  settings_account_title: 'Account & Security',
  settings_account_desc: 'Manage your account information and security settings.',
  settings_account_change_password: 'Change password',
  settings_billing_title: 'Billing & Plan',
  settings_billing_desc: 'View your current plan and billing information.',
  settings_billing_plan: 'Current Plan',
  settings_billing_plan_free: 'Free (beta)',
  settings_billing_plan_desc: 'Official model usage resets weekly (Mon 00:00 UTC). Use BYOK for unlimited turns.',
  settings_weekly_quota_turn_label: 'Official model weekly turns remaining',
  settings_weekly_quota_summarize_label: 'Official model weekly summaries remaining',
  settings_weekly_quota_reset_utc: 'Resets every Monday 00:00 UTC',
  settings_weekly_quota_byok_unlimited: 'BYOK: unlimited turns',
  settings_weekly_quota_byok_unlimited_need_key: 'BYOK: unlimited turns (add an API key in Settings)',
  settings_data_title: 'Data & Export',
  settings_data_desc: 'Export your data or manage your account.',
  settings_data_export: 'Export all trees',
  settings_data_export_desc: 'Download all your trees and conversations in JSON format.',
  settings_data_delete: 'Delete Account',
  settings_data_delete_desc: 'Permanently delete your account and all associated data. This action cannot be undone.',
  settings_data_delete_account: 'Delete account',
  settings_data_confirm_delete_title: 'Delete Account',
  settings_data_confirm_delete_desc: 'This will permanently delete your account and all associated data, including:',
  settings_data_confirm_delete_item_trees: 'All conversation trees and nodes',
  settings_data_confirm_delete_item_chats: 'All chat history',
  settings_data_confirm_delete_item_links: 'Shared links and settings',
  settings_data_confirm_delete_item_api: 'API key configurations',
  settings_data_confirm_delete_warning: '⚠️ This action cannot be undone!',
  settings_data_confirm_delete_type: 'Type DELETE to confirm:',
  settings_data_delete_forever: 'Delete Forever',
  settings_oauth_disconnect_confirm: 'Are you sure you want to disconnect {provider}?',
  settings_oauth_connected_accounts: 'Connected Accounts',
  settings_oauth_empty: 'No OAuth accounts connected yet.',
  settings_oauth_expires_on: 'Expires on ',
  settings_oauth_disconnect: 'Disconnect',
  settings_oauth_add_account: 'Add Account',
  settings_oauth_connect_with: 'Connect with ',
  settings_account_name_placeholder: 'Enter your name',
  settings_account_save: 'Save',
  settings_account_checking: 'Checking...',
  settings_account_set_password: 'Set Password',
  settings_account_loading: 'Loading...',
  settings_account_change_password_desc: 'Update your password to keep your account secure.',
  settings_account_set_password_desc: 'Set a password for your account so you can sign in with email and password.',
  settings_about_title: 'About oMyTree',
  settings_about_desc: 'Learn more about oMyTree and get in touch.',
  settings_about_version: 'Version',
  settings_about_links: 'Links',
  settings_about_docs: 'Documentation',
  settings_about_github: 'GitHub',
  settings_about_twitter: 'X (Twitter)',
  settings_about_contact: 'Contact',
  // Quota messages (T27-3)
  quota_exceeded_daily: "You've used all your free requests for today. Come back tomorrow, or add your own API key in Settings to continue.",
  quota_exceeded_monthly: "You've used all your free requests for this month. Add your own API key in Settings to continue.",
  quota_usage_label: 'Free tier usage',
  quota_daily_remaining: 'Today: {used} / {limit}',
  quota_monthly_remaining: 'This month: {used} / {limit}',
  delete_failed: 'Delete failed',
  delete_failed_retry: 'Please try again',
  // Delete branch/from-here dialogs
  delete_branch_title: 'Confirm delete this branch?',
  delete_branch_desc: 'This will delete the current node and all its children.',
  delete_branch_warning: 'This action cannot be undone.',
  delete_branch_cancel: 'Cancel',
  delete_branch_confirm: 'Confirm delete',
  delete_branch_deleting: 'Deleting...',
  delete_from_here_title: 'Delete from here?',
  delete_from_here_desc: 'This will delete this question and all subsequent Q&A content.',
  delete_from_here_warning: 'This action cannot be undone.',
  // T54-1: Profile capsule for new tree
  profile_lite_desc: 'Concise, saves tokens',
  profile_standard_desc: 'Balanced context',
  profile_max_desc: 'Deep context (BYOK)',
  profile_max_need_byok: 'Needs BYOK',
  memory_scope_branch: 'Branch',
  memory_scope_branch_desc: 'Current branch only',
  memory_scope_tree: 'Tree',
  memory_scope_tree_desc: 'With tree summary',
  // T56-1: Resume panel
  tab_conversation: 'Tree',
  tab_resume: 'Resume',
  tab_outcome: 'Outcome',
  tab_evidence: 'Evidence',
  tab_coming_soon: 'Coming soon...',
  evidence_new: 'New Evidence',
  evidence_created: 'Evidence created!',
  evidence_attach_hint: 'You can now attach it to nodes.',
  evidence_title_optional: 'Title (optional - auto-fills from URL)',
  evidence_new_url: 'URL',
  evidence_new_text: 'Text',
  evidence_new_file: 'File',
  evidence_title: 'Title',
  evidence_summary: 'Summary',
  evidence_url: 'Source URL',
  evidence_text: 'Text content',
  evidence_tags_hint: 'Tags (comma separated)',
  evidence_attach: 'Attach to current node',
  evidence_attach_existing: 'Attach existing evidence',
  evidence_attached_count: 'Attached to {count} nodes',
  evidence_attached_none: 'Not attached yet',
  evidence_empty: 'No evidence yet',
  evidence_drawer_nodes: 'Anchored nodes',
  evidence_drawer_preview: 'Preview',
  evidence_type_url: 'URL',
  evidence_type_text: 'Text',
  evidence_type_file: 'File',
  evidence_loading: 'Loading evidence…',
  evidence_current_node: 'Current node',
  evidence_select_placeholder: 'Select a node to attach evidence',
  evidence_created_time: 'Created',
  evidence_open_original: 'Open original',
  evidence_use_selection: 'Use selected text',
  evidence_use_selection_hint: 'Selected text detected',
  resume_empty_title: 'No Resume Snapshot Yet',
  resume_empty_desc: 'Generate a snapshot to capture your exploration progress, key insights, and open questions.',
  resume_generate_btn: 'Generate Snapshot',
  resume_loading: 'Generating snapshot...',
  resume_loading_desc: 'Analyzing your exploration trail',
  resume_no_tree: 'Select a tree to view its resume',
  resume_retry: 'Retry',
  resume_refresh: 'Generate new snapshot',
  resume_history: 'History',
  resume_loading_existing: 'Loading resume...',
  resume_loading_existing_desc: 'Fetching the latest snapshots',
  resume_generate_loading: 'Generating...',
  resume_generate_success: 'Snapshot updated',
  resume_generate_failed: 'Failed',
  resume_generate_failed_reason: 'Unable to generate snapshot',
  // T58-7-3: Gap UI denoise
  resume_coverage_label: 'Coverage',
  resume_coverage_tooltip: 'Coverage shows how many sections link to specific nodes or evidence. Add sources to increase it.',
  resume_delta_since: 'Since last snapshot',
  resume_delta_nodes: 'nodes',
  resume_delta_evidence: 'evidence',
  resume_sources_hint: 'Next step: attach evidence to anchor this snapshot.',
  resume_attach_evidence: 'Attach evidence',
  resume_sources_missing_hint: 'Add a source to anchor this item',
  resume_section_now: 'Now + Status',
  resume_section_diary: 'Exploration Diary',
  resume_section_facts: 'Facts vs Inferences',
  resume_section_open_loops: 'Open Loops',
  resume_section_next_actions: 'Next Actions',
  resume_section_artifacts: 'Artifacts / Evidence',
  resume_facts_label: 'Facts',
  resume_inferences_label: 'Inferences',
  resume_empty_diary: 'No entries yet',
  resume_empty_facts: 'No facts or inferences recorded',
  resume_empty_open_loops: 'No open questions',
  resume_empty_actions: 'No suggested actions',
  resume_empty_artifacts: 'No artifacts recorded',
  outcome_no_tree: 'Select a tree to generate an outcome outline.',
  outcome_need_snapshot: 'Generate a snapshot first',
  outcome_need_snapshot_desc: 'Outcome outline builds on a resume snapshot.',
  outcome_outline_title: 'Outcome Outline (Step 1)',
  outcome_outline_subtitle: 'Outline + evidence gaps before writing.',
  outcome_gap_label: 'Gaps',
  outcome_snapshot_label: 'Snapshot',
  outcome_type_label: 'Outcome type',
  outcome_type_brief: 'Brief',
  outcome_type_decision: 'Decision',
  outcome_type_report: 'Report',
  outcome_generate_btn: 'Generate outline',
  outcome_refresh: 'Refresh',
  outcome_snapshot_hint: 'Input snapshot',
  outcome_outline_heading: 'Outline sections',
  outcome_evidence_heading: 'Evidence requirements',
  outcome_outline_empty: 'Outline will appear here after generation.',
  outcome_evidence_empty: 'Evidence requirements will be listed after generation.',
  outcome_status_ready: 'ready',
  outcome_status_gap: 'gap',
  // T57-2: Outcome editable UI
  outcome_edit_section: 'Edit section',
  outcome_edit_placeholder: 'Enter section summary...',
  outcome_gaps: 'gaps',
  outcome_need_material: 'need material',
  outcome_ready: 'ready',
  outcome_ignored: 'ignored',
  outcome_needs_material_hint: 'item(s) marked as needing material',
  outcome_regenerate_with_evidence: 'Add evidence & regenerate',
  outcome_regenerate_hint: 'Coming in T58: Retrieve evidence and regenerate',
  outcome_refresh_with_evidence: 'Recompute gaps',
  outcome_attach_prompt: 'Attach evidence to the current node, then refresh to update gaps.',
  outcome_attach_evidence: 'Attach evidence',
  outcome_refresh_notice: 'Updated gaps / evidence requirements',
  outcome_refresh_conflict: 'Refresh found edits that need manual confirmation.',
  outcome_export: 'Export',
  outcome_export_success: 'Markdown copied to clipboard',
  outcome_export_download: 'Markdown downloaded',
  outcome_export_copied_desc: 'Ready to paste where you need.',
  outcome_export_download_desc: 'Saved as outcome markdown file.',
  outcome_export_retry: 'Retry export',
  outcome_export_retry_desc: 'Please try again.',
  outcome_export_fail: 'Export failed',
  outcome_last_updated: 'Last updated',
  saving: 'Saving...',
  cancel: 'Cancel',
  save: 'Save',
  curation_overlay_title: 'Story Curation',
  keyframes_count_label: 'Keyframes',
  keyframe_annotation_placeholder: 'Add annotation...',
  // T72: Keyframe explainer
  kf_explainer_title: 'Keyframes used',
  kf_reason_first: 'First',
  kf_reason_last: 'Last',
  kf_reason_deepest: 'Deepest',
  kf_reason_fork: 'Fork',
  kf_reason_leaf: 'Leaf',
  kf_reason_retry: 'Retry',
  kf_reason_deep_dive: 'Deep dive',
  kf_reason_attachment: 'Has evidence',
  kf_reason_model_switch: 'Model switched',
  kf_reason_error_kw: 'Error topic',
  kf_reason_decide_kw: 'Decision',
  kf_reason_why_kw: 'Why question',
  kf_reason_summary_kw: 'Summary',
  // Expandable capsule
  capsule_expand: 'Expand panel',
  capsule_collapse: 'Collapse panel',
  // T88: Upload UX polish
  upload_formats_hint: 'Supports: .txt, .md, .json, .csv, .yaml, .pdf',
  upload_max_size_hint: 'Max 5MB per file',
  upload_error_unsupported_type: 'File type not supported',
  upload_error_file_too_large: 'File too large (max 5MB)',
  upload_error_quota_tree_exceeded: 'Tree storage quota exceeded',
  upload_error_quota_user_exceeded: 'User storage quota exceeded',
  upload_error_quota_file_limit: 'Maximum file count reached',
  upload_error_weekly_quota_exceeded: 'Weekly upload limit reached',
  upload_error_parse_failed: 'Failed to parse file',
  upload_error_generic: 'Upload failed',
  upload_attachment_label: 'Attachment',
  // P1-4: Unified toolbox panel
  toolbox_title: 'Exploration Toolbox',
  toolbox_tab_keyframes: 'Annotations',
  toolbox_tab_trail: 'Trail',
  toolbox_tab_snapshot: 'Snapshot',
  toolbox_tab_diff: 'Diff',
  toolbox_snapshot_empty: 'No Snapshots Yet',
  toolbox_snapshot_empty_desc: 'Create a snapshot to capture your current exploration path for replay and comparison.',
  toolbox_snapshot_create: 'Create Snapshot',
  toolbox_snapshot_creating: 'Creating…',
  toolbox_snapshot_view_history: 'View History',
  toolbox_snapshot_created_at: 'Created',
  toolbox_snapshot_keyframes_count: 'annotations',
  toolbox_snapshot_replay: 'Replay',
  toolbox_diff_empty: 'Compare Two Paths',
  toolbox_diff_empty_desc: 'Select two nodes or snapshots to compare their exploration differences.',
  toolbox_diff_select_first: 'Select first path/snapshot',
  toolbox_diff_select_second: 'Select second path/snapshot',
  toolbox_diff_compare: 'Compare',
  toolbox_diff_comparing: 'Comparing…',
  toolbox_diff_use_snapshot: 'Use Snapshot',
  toolbox_back: 'Back',
  // Toast messages
  toast_workspace_switched: 'Workspace switched',
  toast_workspace_switch_failed: 'Failed to switch workspace',
  toast_tree_deleted: 'Tree deleted',
  toast_tree_deleted_desc: 'The tree has been removed from your list.',
  toast_tree_delete_failed: 'Failed to delete tree',
  toast_tree_delete_failed_desc: 'Something went wrong. Please try again.',
  toast_tree_title_required: 'Title required',
  toast_tree_title_required_desc: 'Please enter a title for the tree.',
  toast_tree_renamed: 'Tree renamed',
  toast_tree_renamed_desc: 'The tree title has been updated.',
  toast_tree_rename_failed: 'Failed to rename tree',
  toast_tree_rename_failed_desc: 'Something went wrong. Please try again.',
  toast_exported: 'Exported',
  toast_export_json_desc: 'Tree JSON downloaded.',
  toast_export_md_desc: 'Markdown downloaded.',
  toast_export_failed: 'Export failed',
  toast_export_tree_failed: 'Failed to export tree. Please try again.',
  toast_export_md_failed: 'Failed to export markdown. Please try again.',
  toast_link_copied: 'Link copied',
  toast_copy_failed: 'Failed to copy',
  toast_share_revoked: 'Share revoked',
  toast_share_created_copied: 'Link created & copied',
  toast_share_created: 'Share link created',
  toast_share_update_failed: 'Failed to update share settings',
  toast_upload_no_tree: 'Cannot upload',
  toast_upload_no_tree_desc: 'No active tree',
  toast_kb_no_docs: 'No available documents in this knowledge base',
  toast_kb_docs_processing: 'Some documents are still processing; the answer may be incomplete',
  toast_kb_load_failed: 'Failed to load knowledge base',
  toast_kb_search_failed: 'Search failed',
  toast_kb_redirect_soon: 'Redirecting (Coming soon)',
  toast_kb_redirect_soon_desc: 'Pre-filling your query into chat…',
  toast_kb_docs_load_failed: 'Failed to load documents',
  toast_kb_file_too_large: 'File too large',
  toast_kb_upload_success: 'Upload successful',
  toast_kb_file_duplicate: 'File already exists',
  toast_kb_file_duplicate_desc: 'A matching document already exists',
  toast_kb_upload_failed: 'Upload failed',
  toast_kb_settings_saved: 'Settings saved',
  toast_kb_settings_saved_desc: 'Knowledge base updated successfully',
  toast_kb_save_failed: 'Save failed',
  toast_kb_deleted: 'Deleted',
  toast_kb_deleted_desc: 'Knowledge base removed successfully',
  toast_kb_delete_failed: 'Delete failed',
  toast_kb_doc_renamed: 'Renamed successfully',
  toast_kb_doc_rename_failed: 'Rename failed',
  toast_kb_doc_deleted: 'Document deleted',
  toast_kb_doc_delete_failed: 'Delete failed',
  toast_kb_detail_load_failed: 'Failed to load details',
  toast_kb_load_more_failed: 'Failed to load more',
  toast_kb_created: 'Knowledge base created',
  toast_evidence_title_required: 'Title is required',
  toast_evidence_file_required: 'File is required',
  toast_name_updated: 'Name updated',
  toast_name_updated_desc: 'Your name has been saved.',
  toast_update_failed: 'Update failed',
  toast_update_failed_desc: 'Please try again.',
  toast_delete_protected: 'Cannot delete',
  toast_delete_protected_desc: 'This account is protected and cannot be deleted.',
  toast_account_deleted: 'Account deleted',
  toast_account_deleted_desc: 'Your account and all data have been permanently deleted.',
  toast_delete_failed: 'Delete failed',
  toast_delete_failed_desc: 'Please try again later.',
  toast_oauth_load_failed: 'Failed to load',
  toast_oauth_load_failed_desc: 'Could not load OAuth accounts.',
  toast_oauth_disconnected: 'Disconnected',
  toast_oauth_disconnected_desc: 'account has been disconnected.',
  toast_oauth_disconnect_failed: 'Disconnect failed',
  toast_oauth_disconnect_failed_desc: 'Please try again.',
  toast_oauth_connect_failed: 'Connection failed',
  toast_oauth_connect_failed_desc: 'Please try again.',
  toast_models_fetch_first: 'Please fetch models first',
  toast_models_enabled_saved: 'Model settings saved',
  toast_models_save_failed: 'Failed to save',
  toast_models_fetched_count: 'Models fetched',
  toast_models_fetch_failed: 'Failed to fetch models',
  toast_advanced_blocked: 'Cannot enable advanced mode',
  toast_advanced_updated: 'Settings updated',
  toast_advanced_enabled_desc: 'Advanced context profiles enabled.',
  toast_advanced_disabled_desc: 'Advanced context profiles disabled.',
  toast_advanced_update_failed: 'Update failed',
  toast_byok_key_saved: 'API Key saved',
  toast_byok_key_saved_desc: "Click 'Fetch Models' to continue",
  toast_byok_save_failed: 'Save failed',
  toast_byok_models_fetched: 'Models fetched',
  toast_byok_models_select: 'Please select models to use',
  toast_byok_fetch_failed: 'Failed to fetch models',
  toast_byok_select_first: 'Please select a model first',
  toast_byok_test_success: 'Connection test passed!',
  toast_byok_test_failed: 'Connection test failed',
  toast_byok_test_required: 'Please pass the connection test first',
  toast_byok_enabled: 'Configuration saved and enabled',
  toast_byok_update_failed: 'Update failed',
  toast_byok_deleted: 'Deleted',
  toast_byok_delete_failed: 'Delete failed',
  toast_verify_rate_limit: 'Too many requests',
  toast_verify_rate_limit_desc: 'Please wait a moment before requesting another code.',
  toast_verify_send_failed: 'Failed to send code',
  toast_verify_send_failed_desc: 'Please try again later.',
  toast_verify_already: 'Already verified',
  toast_verify_already_desc: 'Your email is already verified. Please refresh the page.',
  toast_verify_sent: 'Verification code sent',
  toast_verify_sent_desc: 'Please check your inbox for the 6-digit code.',
  toast_verify_error: 'Error',
  toast_verify_error_desc: 'Failed to send verification code. Please try again later.',
  verify_banner_sent_to: 'Verification code sent to',
  verify_banner_fallback_email: 'your email',
  verify_banner_unverified: 'Your email is not verified yet',
  verify_banner_send_code: 'Send verification code',
  verify_banner_sending: 'sending...',
  verify_banner_dismiss: 'Dismiss',
  toast_outcome_suggest_failed: 'Failed to generate suggestions',
  toast_outcome_created: 'Outcome created',
  toast_outcome_created_desc: 'Synchronized to outcomes panel',
  toast_outcome_create_failed: 'Failed to create outcome',
  toast_outcome_published: 'Synced to knowledge base',
  toast_outcome_published_desc: 'You can select "Outcome Assets" in the Knowledge Panel when chatting.',
  toast_outcome_publish_failed: 'Sync failed',
  toast_outcome_unpublished: 'Unpublished',
  toast_outcome_unpublished_desc: 'Outcome document has been removed from the knowledge base.',
  toast_outcome_unpublish_failed: 'Unpublish failed',
  toast_resume_title: '💾 Save your progress?',
  toast_resume_desc: 'You\'ve made good progress. Generate a Resume snapshot to save your exploration.',
  toast_resume_action: 'Generate Resume',
  toast_annotation_failed: 'Operation failed',
  toast_annotation_update_failed: 'Failed to update annotation',
  toast_annotation_delete_failed: 'Failed to delete annotation',
  // Toast: context navigation
  toast_nav_cannot_locate: 'Cannot locate',
  toast_nav_cannot_locate_desc: 'Node not in current tree or not loaded',
  toast_nav_notice: 'Notice',
  toast_nav_notice_desc: 'Message may not be in current view, navigated to node',
  toast_nav_failed: 'Navigation failed',
  toast_nav_failed_desc: 'Showing source info in drawer for troubleshooting',
  toast_nav_cannot_locate_keyframe: 'Cannot locate keyframe',
  toast_nav_cannot_locate_keyframe_desc: 'Keyframe not in current tree or not loaded',
  toast_nav_cannot_open_outcome: 'Cannot open outcome',
  toast_nav_cannot_open_outcome_desc: 'No active tree selected (missing tree_id)',
  toast_nav_open_outcome_failed: 'Failed to open outcome',
  toast_nav_open_outcome_failed_desc: 'Showing source info in drawer for troubleshooting',
  toast_nav_unknown_source: 'Unknown source type',
  // Toast: evidence attach
  toast_evidence_select_node: 'Select a node first',
  toast_evidence_attach_failed: 'Failed to attach evidence',
  // Toast: streaming & generation
  toast_usage_reminder: 'Usage reminder',
  toast_gen_failed: 'Generation failed. Please try again.',
  toast_stream_error: 'Something went wrong while streaming the response.',
  toast_something_wrong: 'Something went wrong while talking to oMyTree. Please try again.',
  // Toast: upload sending guards
  toast_upload_in_progress: 'Uploads in progress',
  toast_upload_in_progress_desc: 'Please wait for uploads to finish before sending.',
  toast_upload_some_failed: 'Some uploads failed',
  toast_upload_some_failed_desc: 'Remove or retry failed files before sending.',
  toast_upload_not_ready: 'Attachments not ready',
  toast_upload_not_ready_desc: 'Ensure files are uploaded successfully before sending.',
  toast_upload_limit_desc: 'Max file(s) per message for your plan.',
  // Toast: upload file type hints
  toast_upload_allowed_in_mode: 'Allowed in this mode: ',
  toast_upload_tip_switch_model: 'Tip: For images/audio, switch to a native-parsing model (e.g., OpenAI / Gemini).',
  toast_upload_supported: 'Supported: ',
  toast_upload_tip_audio: 'Tip: This model/provider may not support audio uploads; try OpenAI / Gemini.',
  // Toast: branch & node management
  toast_branch_deleted: 'Branch deleted',
  toast_branch_deleted_desc: 'Moved focus to the parent node.',
  toast_branch_delete_failed: 'Something went wrong',
  toast_branch_delete_failed_desc: 'Please try again.',
  toast_cannot_delete: 'Cannot delete',
  toast_cannot_delete_desc: 'Can only delete user questions that are not root nodes',
  toast_deleted: 'Deleted',
  toast_deleted_desc: 'Deleted the question and subsequent content',
  toast_delete_failed_generic: 'Deletion failed',
  toast_delete_failed_retry: 'Please try again later',
  toast_cannot_edit: 'Cannot edit',
  toast_cannot_edit_user_only: 'Can only edit user questions',
  toast_question_updated: 'Question updated',
  toast_question_updated_desc: 'AI has regenerated the answer',
  // Toast: image upload (admin editor)
  toast_image_upload_failed: 'Image upload failed',
  // Toast: model settings
  toast_model_save_failed: 'Failed to save',
  toast_operation_failed: 'Operation failed',
  toast_operation_retry: 'Please try again later',
  toast_loading_failed: 'Loading failed. Please try again.',
  toast_tree_loading: 'Tree is still loading. Please wait.',
};

const zh: Messages = {
  landing_title: '把你的 AI 对话变成一棵树。',
  landing_subtitle: 'oMyTree 让你的思考路径一目了然——每个问题都是一个节点。可视化、回溯并复用复杂的 AI 对话。',
  landing_tagline: '看见你的思维如何分叉与生长。',
  landing_cta_start: '开始使用',
  landing_cta_login: '登录',
  landing_feature_tree: '树状可视化',
  landing_feature_tree_zh: '对话变树',
  landing_feature_tree_desc: '将线性对话转化为思维分支树。每个问题都创建新分支，让你的思考可见。',
  landing_feature_path: '路径视图与历史',
  landing_feature_path_zh: '路径视图 & 全历史',
  landing_feature_path_desc: '跳转到任意回合，回放路径，永不丢失上下文。轻松导航你的对话历史。',
  landing_feature_export: '导出与分享',
  landing_feature_export_zh: '导出 & 分享',
  landing_feature_export_desc: '导出树为 JSON 或 Markdown，随处分享。创建公开链接用于协作。',
  landing_feature_keys: '账号与 API 密钥',
  landing_feature_keys_zh: '账号与 API Key',
  landing_feature_keys_desc: '使用你自己的 API 密钥。保持你的提示词和数据在自己掌控中。完全隐私，无中间商。',
  cta_signup: '注册',
  cta_login: '登录',
  cta_go_to: '进入我的树',
  home_welcome: '欢迎回来',
  home_subtitle: '选择一棵树继续，或开始一棵新的树。',
  home_title: '你的树都在这里，一目了然。',
  home_new_tree_title: '新建对话',
  home_new_tree_desc: '从下一个问题开始一棵新的对话树。',
  home_new_tree_cta: '开始新树',
  home_recent_title: '最近的树',
  home_recent_empty: '还没有树，先创建一棵吧。',
  home_recent_open: '打开 →',
  nav_help: '帮助',
  nav_help_desc: '阅读快速入门指南，了解如何将 AI 对话变成树。',
  nav_help_cta: '快速入门',
  // Settings page
  settings_title: '设置',
  settings_subtitle: '管理你的账户基本信息，并预览即将推出的功能。',
  settings_learn_more: '了解更多关于 oMyTree →',
  settings_account: '账户',
  settings_email: '邮箱',
  settings_name: '名称',
  settings_member_since: '注册时间',
  settings_coming_soon: '即将推出',
  settings_theme: '主题',
  settings_theme_desc: 'oMyTree 会记住你在此设备上的主题偏好。',
  settings_theme_current: '当前主题',
  settings_theme_toggle_hint: '使用右上角的切换按钮在浅色和深色之间切换。',
  settings_language: '语言',
  settings_language_desc: '选择核心界面文本的首选语言。',
  settings_language_label: '首选语言',
  settings_language_save: '保存语言',
  settings_language_saving: '保存中...',
  settings_language_updated: '语言已更新',
  settings_language_updated_desc: '之后将使用此语言显示界面。',
  settings_language_failed: '更新语言失败',
  settings_language_failed_desc: '请重试。',
  settings_coming_next: '即将推出',
  settings_coming_api_keys: '外部 LLM 的 API 密钥',
  settings_coming_usage: '用户用量与限制',
  settings_coming_locale: '语言/区域偏好',
  settings_usage_title: 'Usage / 我的用量',
  settings_usage_subtitle: '查看本月在 oMyTree 和你的 API Key 上各自消耗了多少。',
  settings_usage_this_month_requests: '本月请求数',
  settings_usage_this_month_tokens: '本月 Tokens',
  settings_usage_platform_tokens: '平台默认',
  settings_usage_byok_tokens: '你的 API Key',
  settings_usage_table_provider: '服务商',
  settings_usage_table_source: '来源',
  settings_usage_table_requests: '请求数',
  settings_usage_table_tokens: 'Tokens',
  settings_usage_source_platform: '平台',
  settings_usage_source_byok: '你的 Key',
  settings_usage_empty: '本月暂无用量记录。',
  // Shared trees panel
  shared_trees_title: '已分享的树',
  shared_trees_desc: '这些树目前可通过公开链接访问。你可以在这里复制或撤销链接。',
  shared_trees_loading: '加载已分享的树…',
  shared_trees_retry: '重试',
  shared_trees_empty: '暂无已分享的树。你可以在树详情中生成分享链接。',
  shared_trees_shared_at: '分享于',
  shared_trees_created_at: '创建于',
  shared_trees_copy_link: '复制链接',
  shared_trees_revoke: '撤销',
  shared_trees_revoke_title: '撤销此树的分享链接？',
  shared_trees_revoke_desc: '访客将无法再通过此链接查看这棵树。',
  shared_trees_cancel: '取消',
  shared_trees_views: '浏览次数',
  shared_trees_link_copied: '链接已复制',
  shared_trees_copy_failed: '复制失败',
  shared_trees_link_revoked: '链接已撤销',
  shared_trees_revoke_failed: '撤销失败',
  // Chat toolbar
  chat_view_tree: '查看树',
  chat_more_actions: '更多操作',
  chat_current: '当前',
  chat_copy: '复制',
  chat_copy_content: '复制内容',
  chat_generate_report: '新建成果',
  chat_reasoning_label: '思维链',
  chat_reasoning_show: '展开思维链',
  chat_reasoning_hide: '收起思维链',
  chat_reasoning_empty: '暂无思维链',
  chat_tree_growing: '树正在生长…',
  chat_genesis_title: '输入任何问题，让树开始生长...',
  chat_input_placeholder: '输入任何问题，让树生长。',
  ai_thinking: '正在思考…',
  ai_streaming: '正在生成',
  ai_generation_failed: '生成失败',
  upload_hint_native: '文件将由模型原生解析，此供应商不提供本地预览。',
  pins_open_timeline: '打开叙事脉络',
  pins_open_timeline_tooltip: '脉络会自动连接你的批注节点',
  pins_collapse: '收起',
  outcomes_capsule_label: '成果',
  outcomes_capsule_open: '打开成果',
  outcomes_capsule_tooltip: '为选中节点生成并查看成果报告。',
  outcomes_count_unit: '枚成果',
  outcome_time_just_now: '刚刚',
  outcome_time_min_ago: '{count} 分钟前',
  outcome_time_hour_ago: '{count} 小时前',
  outcome_archive_title: '成果归档',
  outcome_empty_title: '暂无归档成果',
  outcome_empty_desc: '对重要节点点击“编写”来沉淀本轮分析',
  outcome_untitled: '未命名分析',
  outcome_detail: '参看详情',
  outcome_report_ready: '报告已就绪',
  outcome_rendering_hint: '画布正在渲染归档视图...',
  story_mode_enable: '开启脉络模式',
  story_mode_disable: '关闭脉络模式',
  llm_error_byok_invalid_key: '你的 {provider} API key 无效或已失效，请到 {provider} 控制台检查并在设置中更新密钥。',
  llm_error_byok_insufficient_quota: '你的 {provider} 账户余额/配额不足，无法继续调用。请在 {provider} 官网充值或降低使用频率。',
  llm_error_provider_unreachable: '当前无法连接到 {provider} 服务，可能是网络或对方服务问题，请稍后再试或切换模型。',
  llm_error_provider_rate_limited: '对 {provider} 的请求过于频繁，请稍后再试或更换模型。',
  llm_error_provider_model_not_found: '所选模型未在 {provider} 中启用，请前往设置重新获取并勾选可用模型。',
  llm_error_file_upload_failed: '{provider} 文件上传失败，请重试或更换模型。',
  llm_error_file_type_unsupported: '{provider} 暂不支持该文件类型，请上传支持的文件格式。',
  llm_error_timeout: '{provider} 响应超时，请稍后再试或换用其他模型。',
  llm_error_internal_error: '与 {provider} 通信时发生未知错误，我们已记录问题，请稍后再试。',
  // T28-4: Header menu actions (whole tree scope)
  header_export_json: '导出整棵树 JSON',
  header_export_markdown: '导出整棵树 Markdown',
  header_share_tree: '分享此树',
  header_copy_share_link: '复制分享链接',
  header_revoke_share: '撤销分享',
  // Context capsule
  context_capsule_title: '上下文信息',
  context_capsule_profile_label: '档位：',
  context_capsule_scope_label: '记忆范围：',
  context_capsule_token_label: 'Token：',
  context_capsule_token_prefix: '大致回答上限',
  context_capsule_scope_branch: '当前分支记忆',
  context_capsule_scope_tree: '整棵树 + 摘要',
  context_capsule_summary_title: '树概况',
  context_capsule_error_retry: '最近一次生成失败，将自动重试。',
  context_capsule_loading: '正在加载...',
  context_capsule_missing: '该树的概况尚未生成或更新，将在后台自动生成。',
  context_capsule_learn_more: '了解上下文档位如何工作 →',
  context_capsule_expand: '展开全文',
  context_capsule_collapse: '收起',
  context_profile_lite_hint: '基础档位，省流但保留上一轮对话，不再断档',
  context_profile_standard_hint: '平衡模式，含近期对话，适合大多数学习树',
  context_profile_max_hint: '深记模式，含树概览与更多细节（BYOK）',
  // Sidebar
  sidebar_my_trees: '我的树',
  sidebar_new_tree: '新建对话',
  sidebar_search_chats: '搜索对话',
  recent_chats: '近期对话',
  search_placeholder: '搜索对话',
  sidebar_knowledge_base: '知识库',
  sidebar_collapse: '收起侧边栏',
  sidebar_expand: '展开侧边栏',
  app_date_today: '今天',
  app_date_yesterday: '昨天',
  app_date_this_week: '本周',
  app_date_last_week: '上周',
  app_date_this_month: '本月',
  app_date_last_month: '上月',
  app_trees_load_failed: '加载会话列表失败',
  app_trees_empty_title: '尚未创建任何对话树',
  app_trees_empty_desc: '点击上方“新树”开始探索',
  app_tree_placeholder_back: '返回该会话',
  app_tree_placeholder_pending: '会话创建中，稍后可切换',
  app_trees_loading_more: '加载中...',
  app_trees_autoload_hint: '下滑自动加载更多对话',
  app_workspace_placeholder: '工作区',
  app_workspace_personal_suffix: '（个人）',
  knowledge_days_ago: '{count} 天前',
  knowledge_status_processing: '处理中',
  knowledge_no_description: '暂无描述',
  knowledge_system_library: '系统库，不可删除',
  knowledge_manage: '管理',
  // Tree actions
  tree_rename: '重命名',
  tree_delete: '删除',
  tree_delete_title: '删除这棵树？',
  tree_delete_desc: '这将永久删除这棵树及其所有分支，无法撤销。',
  tree_delete_confirm: '删除',
  tree_rename_title: '重命名树',
  tree_rename_desc: '为这棵树输入一个新名称。',
  tree_rename_label: '名称',
  tree_rename_save: '保存',
  export_json: '导出 JSON',
  export_markdown: '导出 Markdown',
  tree_view_label: '视图：',
  tree_root_badge: '根',
  tree_view_empty: '开始对话后，树将在此处生长',
  tree_untitled: '未命名',
  tree_view_expand: '展开树视图',
  tree_view_collapse: '收起树视图',
  // User menu
  user_menu_settings: '设置',
  user_menu_signout: '退出登录',
  // Grounding toggle
  grounding_toggle_label: '联网',
  // Auth pages
  auth_login_title: '登录 oMyTree',
  auth_login_desc: '使用邮箱和密码登录。',
  auth_register_title: '创建 oMyTree 账号',
  auth_register_desc: '使用邮箱和密码注册。',
  auth_email: '邮箱',
  auth_email_placeholder: '邮箱@example.com',
  auth_password: '密码',
  auth_password_hint: '密码至少 8 个字符。',
  auth_login_button: '登录',
  auth_login_loading: '登录中...',
  auth_register_button: '创建账号',
  auth_register_loading: '创建中...',
  auth_no_account: '还没有账号？',
  auth_create_one: '立即注册',
  auth_have_account: '已有账号？',
  auth_sign_in: '登录',
  auth_legal_consent_prefix: '创建账号即表示您同意我们的',
  auth_legal_consent_terms: '服务条款',
  auth_legal_consent_and: '和',
  auth_legal_consent_privacy: '隐私政策',
  auth_or_continue_with: '或使用以下方式登录',
  auth_social_coming_soon: '社交登录即将上线',
  auth_registered_success: '账号创建成功！请登录。',
  auth_forgot_password: '忘记密码？',
  auth_error_email_password_required: '请输入邮箱和密码。',
  auth_error_invalid_email: '请输入有效的邮箱地址。',
  auth_error_password_too_short: '密码至少需要 8 个字符。',
  auth_error_network: '网络错误，请稍后重试。',
  auth_error_generic: '出了点问题，请重试。',
  auth_error_email_exists: '该邮箱已注册，请直接登录。',
  auth_error_recaptcha_failed: 'reCAPTCHA 验证失败，请重试。',
  auth_error_verification_failed: '验证失败，请重试。',
  auth_error_credentials: '邮箱或密码不正确。',
  auth_error_access_denied: '访问被拒绝，请重试。',
  auth_error_account_disabled: '该账户已被禁用，请联系支持。',
  auth_error_configuration: '系统配置异常，请稍后再试。',
  auth_error_signin_failed: '登录失败，请重试。',
  auth_verified_success: '邮箱验证成功！请登录继续使用。',
  auth_already_signed_in_title: '你已登录',
  auth_already_signed_in_desc: '正在跳转到你的工作区...',
  // Forgot password page
  auth_forgot_title: '忘记密码？',
  auth_forgot_desc: '输入你的邮箱，我们会发送重置链接给你。',
  auth_forgot_send_link: '发送重置链接',
  auth_forgot_sending: '发送中...',
  auth_forgot_success: '请查收邮件',
  auth_forgot_success_desc: '如果该邮箱已注册，我们已发送重置链接。请查看收件箱和垃圾邮件。',
  auth_forgot_back_to_login: '返回登录',
  auth_forgot_link_expires: '链接24小时内有效',
  // Reset password page
  auth_reset_title: '设置新密码',
  auth_reset_desc: '请为你的账号设置一个安全的新密码。',
  auth_reset_new_password: '新密码',
  auth_reset_confirm_password: '确认密码',
  auth_reset_button: '重置密码',
  auth_reset_loading: '重置中...',
  auth_reset_success: '密码已更新',
  auth_reset_success_desc: '你的密码已成功重置，正在跳转到登录页面...',
  auth_reset_invalid_link: '链接无效或已过期',
  auth_reset_invalid_desc: '该重置链接无效或已过期，请重新申请。',
  auth_reset_request_new: '重新申请链接',
  auth_reset_password_mismatch: '两次输入的密码不一致',
  auth_reset_password_too_short: '密码至少需要8个字符',
  // Verify email result page
  auth_verify_result_ok_title: '邮箱已验证！',
  auth_verify_result_ok_message: '你的邮箱已成功验证，现在可以使用 oMyTree 的全部功能。',
  auth_verify_result_expired_title: '链接已过期',
  auth_verify_result_expired_message: '该验证链接已过期，请登录后重新发送验证邮件。',
  auth_verify_result_invalid_title: '无效链接',
  auth_verify_result_invalid_message: '该验证链接无效或已被使用，请重新获取。',
  auth_verify_result_used_title: '已验证',
  auth_verify_result_used_message: '该验证链接已被使用，你的邮箱已验证。',
  auth_verify_result_error_title: '出了点问题',
  auth_verify_result_error_message: '验证邮箱时发生错误，请稍后重试或联系支持。',
  auth_verify_result_go_to_app: '进入应用',
  auth_verify_result_redirecting: '5 秒后自动跳转到应用...',
  auth_verify_result_go_to_login: '前往登录',
  auth_verify_result_back_home: '返回首页',
  auth_verify_result_trouble: '遇到问题？',
  auth_verify_result_contact_support: '联系支持',
  // Model settings (T27-2)
  models_title: '模型与密钥',
  models_subtitle: '选择 oMyTree 如何连接 AI 模型为你提供对话服务。',
  models_current_provider: '当前对话模型',
  models_use_default: '使用 oMyTree 默认模型',
  models_use_default_desc: '推荐。使用我们托管的 AI 服务，无需任何配置。',
  models_use_own_key: '使用我的 API 密钥',
  models_use_own_key_desc: '使用你自己的 OpenAI 或 Google API 密钥。',
  models_my_api_keys: '我的 API 密钥',
  models_my_api_keys_desc: '配置你的外部 LLM 服务商 API 密钥。',
  models_provider_openai: 'OpenAI',
  models_provider_google: 'Google AI',
  models_api_key: 'API 密钥',
  models_api_key_placeholder: 'sk-... 或 AIza...',
  models_api_key_label: '备注（可选）',
  models_configured: '已配置',
  models_not_configured: '未配置',
  models_save: '保存',
  models_saving: '保存中...',
  models_saved: '已保存！',
  models_test_connection: '测试连接',
  models_testing: '测试中...',
  models_test_success: '连接成功！',
  models_test_failed: '连接失败',
  models_switch_provider: '切换模型',
  models_switch_success: '已切换模型',
  models_switch_failed: '切换失败',
  models_no_key_warning: '请先配置 API 密钥。',
  models_delete_key: '删除密钥',
  models_delete_key_confirm: '确定删除此 API 密钥？',
  models_key_deleted: 'API 密钥已删除',
  models_byok_notice: '使用自己的密钥时，费用由服务商收取。oMyTree 不会存储你的对话内容。',
  models_advanced_title: '高级上下文档位',
  models_advanced_desc: '开启后仅可使用自带 API Key 模型，平台默认模型将被禁用。',
  models_advanced_learn_more: '了解上下文档位如何工作',
  models_advanced_need_key: '需先添加并启用至少一个自带模型 API Key 才能开启高级模式',
  user_menu_models: '模型与密钥',
  byok_connection_success: '连接成功',
  byok_test_failed: '测试失败',
  byok_network_error: '网络错误',
  byok_save_failed: '保存失败',
  byok_fetch_models_failed: '获取模型失败',
  byok_models_count: '{count} 个模型',
  byok_models_found_count: '找到模型（{count}）',
  byok_no_models_found: '没有找到模型',
  byok_select_models_to_enable: '请选择要启用的模型',
  byok_select_at_least_one_model: '请先选择至少一个模型',
  byok_step_fetch_model_list: '获取模型列表',
  byok_fetch_models: '获取模型',
  byok_select_models: '选择模型',
  byok_selected: '已选',
  byok_first_model_for_test: '将使用第一个选中的模型进行连接测试',
  byok_test_connection: '测试连接',
  byok_enable_requires_test: '⚠️ 必须通过连接测试后才能启用此 Provider',
  byok_enable_provider: '启用此 Provider',
  byok_enable_provider_named: '启用 {provider}',
  byok_enable_provider_desc: '启用后，此厂商的模型将出现在对话模型选择器中',
  byok_test_passed: '已通过测试',
  byok_models_enabled_count: '{count} 个模型已启用',
  byok_enabled: '已启用',
  byok_steps_description: '按照步骤配置外部 LLM 服务商：填入密钥 → 获取模型 → 选择模型 → 测试连接 → 启用',
  byok_delete_api_key_title: '删除 API Key',
  byok_delete_api_key_desc: '确定要删除此 API Key 吗？这将同时删除所有已保存的模型设置。',
  byok_pass_test_first: '请先通过连接测试',
  byok_ollama_url_saved: 'Ollama 连接地址已保存',
  byok_ollama_cannot_connect_detail: '无法连接到 Ollama（{baseUrl}）。请确保 Ollama 正在运行。',
  byok_ollama_cannot_connect_title: '无法连接到 Ollama',
  byok_ollama_ensure_local: '请确保 Ollama 正在本地运行',
  byok_ollama_no_models_installed: 'Ollama 没有安装任何模型',
  byok_ollama_install_hint: '请先用 `ollama pull` 安装模型',
  byok_ollama_cannot_connect_short: '无法连接到 Ollama（{baseUrl}）',
  byok_ollama_ensure_running: '请确保 Ollama 正在运行',
  byok_ollama_connection_success_detail: '连接成功（{elapsed}ms，模型：{model}）',
  byok_ollama_connection_success: 'Ollama 连接成功！',
  byok_ollama_configuration_deleted: 'Ollama 配置已删除',
  byok_ollama_local_models: 'Ollama 本地模型',
  byok_ollama_local_models_desc: '连接本地运行的 Ollama 实例，使用自己的模型。无需 API Key，数据不离开本机。',
  byok_connection_url: '连接地址',
  byok_ollama_url_hint: '请确保 Ollama 正在运行。如使用远程机器，请填写对应地址。',
  byok_fetch_local_models: '获取本地模型',
  byok_enable_ollama_requires_test: '⚠️ 必须通过连接测试后才能启用 Ollama',
  byok_enable_ollama: '启用 Ollama',
  byok_enable_ollama_local_models: '启用 Ollama 本地模型',
  byok_enable_ollama_desc: '启用后，本地模型将出现在对话模型选择器中',
  byok_delete_ollama_title: '删除 Ollama 配置',
  byok_delete_ollama_desc: '确定要删除 Ollama 配置吗？这将同时删除所有已保存的模型设置。',
  // Settings navigation (T26-7)
  settings_nav_general: '常规',
  settings_nav_general_desc: '语言、主题和显示偏好',
  settings_nav_conversation: '对话与界面',
  settings_nav_conversation_desc: '树画布和对话偏好',
  settings_nav_models: '模型与 API',
  settings_nav_models_desc: 'LLM 服务商和 API 密钥',
  settings_nav_account: '账号与安全',
  settings_nav_account_desc: '邮箱、名称和密码',
  settings_nav_billing: '计划与费用',
  settings_nav_billing_desc: '订阅和用量',
  settings_nav_data: '数据与导出',
  settings_nav_data_desc: '导出树和管理数据',
  settings_nav_about: '关于 oMyTree',
  settings_nav_about_desc: '版本和链接',
  // Settings sections (T26-7)
  settings_general_title: '常规',
  settings_general_desc: '自定义你的语言和外观偏好。',
  settings_conversation_title: '对话与界面',
  settings_conversation_desc: '配置树画布和对话界面偏好。',
  settings_account_title: '账号与安全',
  settings_account_desc: '管理你的账号信息和安全设置。',
  settings_account_change_password: '修改密码',
  settings_billing_title: '计划与费用',
  settings_billing_desc: '查看你当前的计划和账单信息。',
  settings_billing_plan: '当前计划',
  settings_billing_plan_free: '免费（测试版）',
  settings_billing_plan_desc: '官方模型按周配额计费（周一 00:00 UTC 重置）。使用自带模型（BYOK）则 Turn 不限。',
  settings_weekly_quota_turn_label: '官方模型每周剩余对话次数',
  settings_weekly_quota_summarize_label: '官方模型每周剩余摘要次数',
  settings_weekly_quota_reset_utc: '每周一 00:00 UTC 重置',
  settings_weekly_quota_byok_unlimited: 'BYOK：Turn 无限',
  settings_weekly_quota_byok_unlimited_need_key: 'BYOK：Turn 无限（需先在设置里添加 API Key）',
  settings_data_title: '数据与导出',
  settings_data_desc: '导出你的数据或管理账号。',
  settings_data_export: '导出所有树',
  settings_data_export_desc: '以 JSON 格式下载你的所有树和对话内容。',
  settings_data_delete: '删除账号',
  settings_data_delete_desc: '永久删除你的账号及所有关联数据。此操作不可撤销。',
  settings_data_delete_account: '删除账号',
  settings_data_confirm_delete_title: '确认删除账号',
  settings_data_confirm_delete_desc: '此操作将永久删除你的账号及所有关联数据，包括：',
  settings_data_confirm_delete_item_trees: '所有对话树和节点',
  settings_data_confirm_delete_item_chats: '所有聊天记录',
  settings_data_confirm_delete_item_links: '分享链接和设置',
  settings_data_confirm_delete_item_api: 'API 密钥配置',
  settings_data_confirm_delete_warning: '⚠️ 此操作无法撤销！',
  settings_data_confirm_delete_type: '请输入 DELETE 以确认：',
  settings_data_delete_forever: '永久删除',
  settings_oauth_disconnect_confirm: '确定要断开 {provider} 账户吗？',
  settings_oauth_connected_accounts: '已连接的账户',
  settings_oauth_empty: '你还没有连接任何OAuth账户。',
  settings_oauth_expires_on: '过期于 ',
  settings_oauth_disconnect: '断开连接',
  settings_oauth_add_account: '添加账户',
  settings_oauth_connect_with: '连接 ',
  settings_account_name_placeholder: '输入你的名称',
  settings_account_save: '保存',
  settings_account_checking: '检查中...',
  settings_account_set_password: '设置密码',
  settings_account_loading: '加载中...',
  settings_account_change_password_desc: '更新你的账号密码以确保安全。',
  settings_account_set_password_desc: '为你的账户设置密码，以便使用邮箱和密码登录。',
  settings_about_title: '关于 oMyTree',
  settings_about_desc: '了解更多关于 oMyTree 的信息并联系我们。',
  settings_about_version: '版本',
  settings_about_links: '链接',
  settings_about_docs: '文档',
  settings_about_github: 'GitHub',
  settings_about_twitter: 'X（推特）',
  settings_about_contact: '联系我们',
  // Quota messages (T27-3)
  quota_exceeded_daily: '今日免费请求次数已用完，明天再来吧。或者在设置中绑定自己的 API Key 继续使用。',
  quota_exceeded_monthly: '本月免费请求次数已用完，请在设置中绑定自己的 API Key 继续使用。',
  quota_usage_label: '免费额度用量',
  quota_daily_remaining: '今日：{used} / {limit}',
  quota_monthly_remaining: '本月：{used} / {limit}',
  delete_failed: '删除失败',
  delete_failed_retry: '请稍后重试',
  // Delete branch/from-here dialogs
  delete_branch_title: '确认删除此分支？',
  delete_branch_desc: '这将删除当前节点及其所有子节点。',
  delete_branch_warning: '此操作无法撤销。',
  delete_branch_cancel: '取消',
  delete_branch_confirm: '确认删除',
  delete_branch_deleting: '删除中...',
  delete_from_here_title: '从这里删除？',
  delete_from_here_desc: '这将删除此问题及其后续的所有问答内容。',
  delete_from_here_warning: '此操作无法撤销。',
  // T54-1: Profile capsule for new tree
  profile_lite_desc: '省流模式',
  profile_standard_desc: '平衡上下文',
  profile_max_desc: '深度记忆（BYOK）',
  profile_max_need_byok: '需 BYOK',
  memory_scope_branch: '分支记忆',
  memory_scope_branch_desc: '仅当前分支',
  memory_scope_tree: '全树记忆',
  memory_scope_tree_desc: '附带全树摘要',
  // T56-1: Resume panel
  tab_conversation: '树',
  tab_resume: '简历',
  tab_outcome: '成果',
  tab_evidence: '证据',
  tab_coming_soon: '即将推出...',
  evidence_new: '新增证据',
  evidence_created: '证据已创建！',
  evidence_attach_hint: '现在可以将其挂载到节点。',
  evidence_title_optional: '标题（可选 - 自动从URL填充）',
  evidence_new_url: '链接',
  evidence_new_text: '文本',
  evidence_new_file: '文件',
  evidence_title: '标题',
  evidence_summary: '摘要',
  evidence_url: '来源链接',
  evidence_text: '证据内容',
  evidence_tags_hint: '标签（用逗号分隔）',
  evidence_attach: '挂载到当前节点',
  evidence_attach_existing: '挂载已有证据',
  evidence_attached_count: '已挂载到 {count} 个节点',
  evidence_attached_none: '尚未挂载',
  evidence_empty: '暂无证据',
  evidence_drawer_nodes: '挂载节点',
  evidence_drawer_preview: '预览',
  evidence_type_url: '链接',
  evidence_type_text: '文本',
  evidence_type_file: '文件',
  evidence_loading: '正在加载证据…',
  evidence_current_node: '当前节点',
  evidence_select_placeholder: '先在树上选择一个节点',
  evidence_created_time: '创建时间',
  evidence_open_original: '打开原文',
  evidence_use_selection: '使用所选文本',
  evidence_use_selection_hint: '检测到选中文本',
  resume_empty_title: '暂无简历快照',
  resume_empty_desc: '生成快照以记录您的探索进度、关键见解和待解决的问题。',
  resume_generate_btn: '生成快照',
  resume_loading: '正在生成快照...',
  resume_loading_desc: '分析您的探索轨迹',
  resume_no_tree: '选择一棵树查看其简历',
  resume_retry: '重试',
  resume_refresh: '生成新快照',
  resume_history: '历史记录',
  resume_loading_existing: '正在加载简历...',
  resume_loading_existing_desc: '获取最新快照',
  resume_generate_loading: '生成中...',
  resume_generate_success: '快照已更新',
  resume_generate_failed: '生成失败',
  resume_generate_failed_reason: '无法生成快照',
  // T58-7-3: Gap UI denoise
  resume_coverage_label: '覆盖率',
  resume_coverage_tooltip: '覆盖率表示有多少版块关联到具体节点或证据。补充来源可提升。',
  resume_delta_since: '自上次快照以来',
  resume_delta_nodes: '新节点',
  resume_delta_evidence: '新证据',
  resume_sources_hint: '下一步：挂载证据，让快照更可追溯。',
  resume_attach_evidence: '挂载证据',
  resume_sources_missing_hint: '添加来源以锚定此条目',
  resume_section_now: '现状 + 状态',
  resume_section_diary: '探索日记',
  resume_section_facts: '事实 vs 推断',
  resume_section_open_loops: '未解决问题',
  resume_section_next_actions: '下一步行动',
  resume_section_artifacts: '产物 / 证据',
  resume_facts_label: '事实',
  resume_inferences_label: '推断',
  resume_empty_diary: '暂无记录',
  resume_empty_facts: '暂无事实或推断',
  resume_empty_open_loops: '暂无未解问题',
  resume_empty_actions: '暂无建议行动',
  resume_empty_artifacts: '暂无产物记录',
  outcome_no_tree: '选择一棵树生成成果提纲。',
  outcome_need_snapshot: '请先生成 Snapshot',
  outcome_need_snapshot_desc: 'Outcome 提纲基于 Resume Snapshot 生成。',
  outcome_outline_title: 'Outcome 提纲（步骤1）',
  outcome_outline_subtitle: '先列提纲和证据缺口，再写正文。',
  outcome_gap_label: '缺口',
  outcome_snapshot_label: 'Snapshot',
  outcome_type_label: '成果类型',
  outcome_type_brief: '简报',
  outcome_type_decision: '决策',
  outcome_type_report: '报告',
  outcome_generate_btn: '生成提纲',
  outcome_refresh: '刷新',
  outcome_snapshot_hint: '输入 Snapshot',
  outcome_outline_heading: '提纲分节',
  outcome_evidence_heading: '证据需求',
  outcome_outline_empty: '生成后展示提纲分节。',
  outcome_evidence_empty: '生成后列出证据需求。',
  outcome_status_ready: '就绪',
  outcome_status_gap: '缺口',
  // T57-2: Outcome editable UI
  outcome_edit_section: '编辑分节',
  outcome_edit_placeholder: '输入分节摘要...',
  outcome_gaps: '个缺口',
  outcome_need_material: '需补材料',
  outcome_ready: '就绪',
  outcome_ignored: '已忽略',
  outcome_needs_material_hint: '条标记为需要补充材料',
  outcome_regenerate_with_evidence: '补证据后再生成',
  outcome_regenerate_hint: '即将在T58实现：检索证据并重新生成',
  outcome_refresh_with_evidence: '重新计算缺口',
  outcome_attach_prompt: '先把证据挂到当前节点，再点击刷新更新缺口。',
  outcome_attach_evidence: '挂证据',
  outcome_refresh_notice: '缺口/证据需求已更新',
  outcome_refresh_conflict: '刷新发现需要手动确认的编辑。',
  outcome_export: '导出',
  outcome_export_success: 'Markdown 已复制到剪贴板',
  outcome_export_download: 'Markdown 已下载',
  outcome_export_copied_desc: '已复制，可直接粘贴。',
  outcome_export_download_desc: '已保存为 Markdown 文件。',
  outcome_export_retry: '重试导出',
  outcome_export_retry_desc: '请重试。',
  outcome_export_fail: '导出失败',
  outcome_last_updated: '最后更新',
  saving: '保存中...',
  cancel: '取消',
  save: '保存',
  curation_overlay_title: '故事编排',
  keyframes_count_label: '批注',
  keyframe_annotation_placeholder: '添加批注…',
  // T72: Keyframe explainer
  kf_explainer_title: '关键路径选取',
  kf_reason_first: '开头',
  kf_reason_last: '最新',
  kf_reason_deepest: '最深',
  kf_reason_fork: '分叉点',
  kf_reason_leaf: '叶节点',
  kf_reason_retry: '重试',
  kf_reason_deep_dive: '深入',
  kf_reason_attachment: '有证据',
  kf_reason_model_switch: '切换模型',
  kf_reason_error_kw: '报错话题',
  kf_reason_decide_kw: '决策',
  kf_reason_why_kw: '提问',
  kf_reason_summary_kw: '总结',
  // Expandable capsule
  capsule_expand: '展开面板',
  capsule_collapse: '收起面板',
  // T88: Upload UX polish
  upload_formats_hint: '支持格式：.txt, .md, .json, .csv, .yaml, .pdf',
  upload_max_size_hint: '单文件最大 5MB',
  upload_error_unsupported_type: '不支持的文件类型',
  upload_error_file_too_large: '文件过大（最大 5MB）',
  upload_error_quota_tree_exceeded: '知识树存储空间已满',
  upload_error_quota_user_exceeded: '用户存储空间已满',
  upload_error_quota_file_limit: '已达到最大文件数量',
  upload_error_weekly_quota_exceeded: '本周上传次数已用尽',
  upload_error_parse_failed: '文件解析失败',
  upload_error_generic: '上传失败',
  upload_attachment_label: '附件',
  // P1-4: Unified toolbox panel
  toolbox_title: '探索工具箱',
  toolbox_tab_keyframes: '批注',
  toolbox_tab_trail: '脉络',
  toolbox_tab_snapshot: '快照',
  toolbox_tab_diff: '分支对比',
  toolbox_snapshot_empty: '暂无快照',
  toolbox_snapshot_empty_desc: '创建快照以捕获当前探索路径，便于回放和对比。',
  toolbox_snapshot_create: '创建快照',
  toolbox_snapshot_creating: '创建中…',
  toolbox_snapshot_view_history: '查看历史',
  toolbox_snapshot_created_at: '创建于',
  toolbox_snapshot_keyframes_count: '个批注',
  toolbox_snapshot_replay: '回放',
  toolbox_diff_empty: '对比两条路径',
  toolbox_diff_empty_desc: '选择两个节点或快照来比较它们的探索差异。',
  toolbox_diff_select_first: '选择第一条路径/快照',
  toolbox_diff_select_second: '选择第二条路径/快照',
  toolbox_diff_compare: '开始对比',
  toolbox_diff_comparing: '对比中…',
  toolbox_diff_use_snapshot: '使用快照',
  toolbox_back: '返回',
  // Toast messages
  toast_workspace_switched: '工作区已切换',
  toast_workspace_switch_failed: '切换工作区失败',
  toast_tree_deleted: '已删除',
  toast_tree_deleted_desc: '该知识树已从列表中移除。',
  toast_tree_delete_failed: '删除失败',
  toast_tree_delete_failed_desc: '操作失败，请稍后重试。',
  toast_tree_title_required: '请输入标题',
  toast_tree_title_required_desc: '知识树需要一个标题。',
  toast_tree_renamed: '已重命名',
  toast_tree_renamed_desc: '知识树标题已更新。',
  toast_tree_rename_failed: '重命名失败',
  toast_tree_rename_failed_desc: '操作失败，请稍后重试。',
  toast_exported: '导出成功',
  toast_export_json_desc: 'JSON 文件已下载。',
  toast_export_md_desc: 'Markdown 文件已下载。',
  toast_export_failed: '导出失败',
  toast_export_tree_failed: '导出失败，请重试。',
  toast_export_md_failed: '导出 Markdown 失败，请重试。',
  toast_link_copied: '链接已复制',
  toast_copy_failed: '复制失败',
  toast_share_revoked: '已取消分享',
  toast_share_created_copied: '分享链接已创建并复制',
  toast_share_created: '分享链接已创建',
  toast_share_update_failed: '更新分享设置失败',
  toast_upload_no_tree: '无法上传',
  toast_upload_no_tree_desc: '没有激活的知识树',
  toast_kb_no_docs: '该知识库暂无可用文档',
  toast_kb_docs_processing: '部分文档仍在处理中，回答可能不完整',
  toast_kb_load_failed: '知识库加载失败',
  toast_kb_search_failed: '检索失败',
  toast_kb_redirect_soon: '即将跳转（开发中）',
  toast_kb_redirect_soon_desc: '即将为您预填充到对话输入框。',
  toast_kb_docs_load_failed: '文档加载失败',
  toast_kb_file_too_large: '文件过大',
  toast_kb_upload_success: '上传成功',
  toast_kb_file_duplicate: '文件已存在',
  toast_kb_file_duplicate_desc: '已存在同名或同内容的文档',
  toast_kb_upload_failed: '上传失败',
  toast_kb_settings_saved: '设置已保存',
  toast_kb_settings_saved_desc: '知识库信息已成功更新',
  toast_kb_save_failed: '保存失败',
  toast_kb_deleted: '已删除',
  toast_kb_deleted_desc: '知识库已成功删除',
  toast_kb_delete_failed: '删除失败',
  toast_kb_doc_renamed: '重命名成功',
  toast_kb_doc_rename_failed: '重命名失败',
  toast_kb_doc_deleted: '文档已删除',
  toast_kb_doc_delete_failed: '删除失败',
  toast_kb_detail_load_failed: '详情加载失败',
  toast_kb_load_more_failed: '加载更多失败',
  toast_kb_created: '知识库创建成功',
  toast_evidence_title_required: '请输入标题',
  toast_evidence_file_required: '请选择文件',
  toast_name_updated: '名称已更新',
  toast_name_updated_desc: '你的名称已保存。',
  toast_update_failed: '更新失败',
  toast_update_failed_desc: '请重试。',
  toast_delete_protected: '无法删除',
  toast_delete_protected_desc: '此账号受保护，无法删除。',
  toast_account_deleted: '账号已删除',
  toast_account_deleted_desc: '你的账号及所有数据已被永久删除。',
  toast_delete_failed: '删除失败',
  toast_delete_failed_desc: '请稍后重试。',
  toast_oauth_load_failed: '加载失败',
  toast_oauth_load_failed_desc: '无法加载 OAuth 账户。',
  toast_oauth_disconnected: '已断开连接',
  toast_oauth_disconnected_desc: '账户已断开连接。',
  toast_oauth_disconnect_failed: '断开失败',
  toast_oauth_disconnect_failed_desc: '请重试。',
  toast_oauth_connect_failed: '连接失败',
  toast_oauth_connect_failed_desc: '请重试。',
  toast_models_fetch_first: '请先获取模型列表',
  toast_models_enabled_saved: '模型设置已保存',
  toast_models_save_failed: '保存失败',
  toast_models_fetched_count: '模型已获取',
  toast_models_fetch_failed: '获取模型列表失败',
  toast_advanced_blocked: '无法开启高级模式',
  toast_advanced_updated: '设置已更新',
  toast_advanced_enabled_desc: '已开启高级上下文档位。',
  toast_advanced_disabled_desc: '已关闭高级上下文档位。',
  toast_advanced_update_failed: '更新失败',
  toast_byok_key_saved: 'API Key 已保存',
  toast_byok_key_saved_desc: '请点击「获取模型」继续',
  toast_byok_save_failed: '保存失败',
  toast_byok_models_fetched: '模型已获取',
  toast_byok_models_select: '请选择要使用的模型',
  toast_byok_fetch_failed: '获取模型失败',
  toast_byok_select_first: '请先选择模型',
  toast_byok_test_success: '连接测试成功！',
  toast_byok_test_failed: '连接测试失败',
  toast_byok_test_required: '请先通过连接测试',
  toast_byok_enabled: '配置已保存并启用',
  toast_byok_update_failed: '更新失败',
  toast_byok_deleted: '已删除',
  toast_byok_delete_failed: '删除失败',
  toast_verify_rate_limit: '请求过于频繁',
  toast_verify_rate_limit_desc: '请稍等片刻后再请求新的验证码。',
  toast_verify_send_failed: '发送验证码失败',
  toast_verify_send_failed_desc: '请稍后重试。',
  toast_verify_already: '已验证',
  toast_verify_already_desc: '您的邮箱已经验证过了，请刷新页面。',
  toast_verify_sent: '验证码已发送',
  toast_verify_sent_desc: '请查收邮箱中的 6 位数验证码。',
  toast_verify_error: '错误',
  toast_verify_error_desc: '发送验证码失败，请稍后重试。',
  verify_banner_sent_to: '验证码已发送至',
  verify_banner_fallback_email: '你的邮箱',
  verify_banner_unverified: '你的邮箱尚未验证',
  verify_banner_send_code: '发送验证码',
  verify_banner_sending: '发送中...',
  verify_banner_dismiss: '关闭',
  toast_outcome_suggest_failed: '生成建议失败',
  toast_outcome_created: '成果已创建',
  toast_outcome_created_desc: '已同步到成果面板',
  toast_outcome_create_failed: '创建失败',
  toast_outcome_published: '已同步到知识库',
  toast_outcome_published_desc: '对话时在知识库中选择“成果资产库”即可复用本成果。',
  toast_outcome_publish_failed: '同步失败',
  toast_outcome_unpublished: '已撤回入库',
  toast_outcome_unpublished_desc: '成果文档已从知识库移除。',
  toast_outcome_unpublish_failed: '撤回失败',
  toast_resume_title: '💾 建议保存进度',
  toast_resume_desc: '您已进行了一段探索，生成简历快照可以记录当前进度。',
  toast_resume_action: '生成简历',
  toast_annotation_failed: '操作失败',
  toast_annotation_update_failed: '无法更新批注',
  toast_annotation_delete_failed: '无法删除批注',
  // Toast: context navigation
  toast_nav_cannot_locate: '无法定位',
  toast_nav_cannot_locate_desc: '节点不在当前树中或尚未加载',
  toast_nav_notice: '提示',
  toast_nav_notice_desc: '该消息可能不在当前视图中，已定位到对应节点',
  toast_nav_failed: '跳转失败',
  toast_nav_failed_desc: '已在侧栏显示来源信息，方便排查',
  toast_nav_cannot_locate_keyframe: '无法定位关键帧',
  toast_nav_cannot_locate_keyframe_desc: '关键帧不在当前树中或尚未加载',
  toast_nav_cannot_open_outcome: '无法打开成果',
  toast_nav_cannot_open_outcome_desc: '当前未选中树（tree_id 缺失）',
  toast_nav_open_outcome_failed: '打开成果失败',
  toast_nav_open_outcome_failed_desc: '已在侧栏显示来源信息，方便排查',
  toast_nav_unknown_source: '未知来源类型',
  // Toast: evidence attach
  toast_evidence_select_node: '请先选择一个节点',
  toast_evidence_attach_failed: '关联证据失败',
  // Toast: streaming & generation
  toast_usage_reminder: '使用提醒',
  toast_gen_failed: '生成失败，请稍后重试',
  toast_stream_error: '流式响应出错，请重试',
  toast_something_wrong: '出错了，请重试',
  // Toast: upload sending guards
  toast_upload_in_progress: '文件仍在上传',
  toast_upload_in_progress_desc: '请等待文件上传完成后再发送。',
  toast_upload_some_failed: '存在上传失败的文件',
  toast_upload_some_failed_desc: '请先删除或重试失败文件后再发送。',
  toast_upload_not_ready: '附件尚未就绪',
  toast_upload_not_ready_desc: '请确认文件已上传成功后再发送。',
  toast_upload_limit_desc: '您的套餐每条消息支持的附件数量已达上限。',
  // Toast: upload file type hints
  toast_upload_allowed_in_mode: '当前模式仅支持：',
  toast_upload_tip_switch_model: '提示：图片/音频请切换到支持原生解析的模型（如 OpenAI / Gemini）。',
  toast_upload_supported: '支持：',
  toast_upload_tip_audio: '提示：当前模型/提供方暂不支持音频上传；可切换到 OpenAI / Gemini。',
  // Toast: branch & node management
  toast_branch_deleted: '分支已删除',
  toast_branch_deleted_desc: '已跳转到父节点。',
  toast_branch_delete_failed: '操作失败',
  toast_branch_delete_failed_desc: '请重试。',
  toast_cannot_delete: '无法删除',
  toast_cannot_delete_desc: '只能删除非根节点的用户问题',
  toast_deleted: '已删除',
  toast_deleted_desc: '已删除该问题及其后续内容',
  toast_delete_failed_generic: '删除失败',
  toast_delete_failed_retry: '请稍后重试',
  toast_cannot_edit: '无法编辑',
  toast_cannot_edit_user_only: '只能编辑用户问题',
  toast_question_updated: '问题已更新',
  toast_question_updated_desc: 'AI 已重新生成回答',
  // Toast: image upload (admin editor)
  toast_image_upload_failed: '图片上传失败',
  // Toast: model settings
  toast_model_save_failed: '保存失败',
  toast_operation_failed: '操作失败',
  toast_operation_retry: '请稍后重试',
  toast_loading_failed: '加载失败，请重试',
  toast_tree_loading: '树正在加载中，请稍候',
};

const messages: Record<Lang, Messages> = {
  en,
  'zh-CN': zh,
};

export function t(lang: Lang | undefined | null, key: MessageKey): string {
  const fallback = messages.en[key];
  if (!lang) return fallback;
  const table = messages[lang as Lang];
  return (table && table[key]) || fallback;
}

export function normalizeLang(raw?: string | null): Lang {
  return raw === 'zh-CN' ? 'zh-CN' : 'en';
}
