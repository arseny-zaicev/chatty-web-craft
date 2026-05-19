export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_seo_reports: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          industry: string | null
          lost_monthly_impressions: number | null
          report_data: Json
          status: string
          updated_at: string
          user_id: string
          website_url: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          lost_monthly_impressions?: number | null
          report_data?: Json
          status?: string
          updated_at?: string
          user_id: string
          website_url: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          lost_monthly_impressions?: number | null
          report_data?: Json
          status?: string
          updated_at?: string
          user_id?: string
          website_url?: string
        }
        Relationships: []
      }
      audience_batches: {
        Row: {
          campaign_type: string
          column_mapping: Json
          copy_profile: string | null
          country: string | null
          created_at: string
          derived_variables_preview: Json
          id: string
          is_launch_ready: boolean
          name: string
          notes: string | null
          prep_profile_id: string | null
          source_filename: string | null
          updated_at: string
          user_id: string
          variable_schema: Json
          workspace_id: string
        }
        Insert: {
          campaign_type?: string
          column_mapping?: Json
          copy_profile?: string | null
          country?: string | null
          created_at?: string
          derived_variables_preview?: Json
          id?: string
          is_launch_ready?: boolean
          name: string
          notes?: string | null
          prep_profile_id?: string | null
          source_filename?: string | null
          updated_at?: string
          user_id: string
          variable_schema?: Json
          workspace_id: string
        }
        Update: {
          campaign_type?: string
          column_mapping?: Json
          copy_profile?: string | null
          country?: string | null
          created_at?: string
          derived_variables_preview?: Json
          id?: string
          is_launch_ready?: boolean
          name?: string
          notes?: string | null
          prep_profile_id?: string | null
          source_filename?: string | null
          updated_at?: string
          user_id?: string
          variable_schema?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_batches_prep_profile_id_fkey"
            columns: ["prep_profile_id"]
            isOneToOne: false
            referencedRelation: "audience_prep_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_prep_profiles: {
        Row: {
          campaign_type: string
          created_at: string
          derived_variables: Json
          description: string | null
          fallback_rules: Json
          id: string
          invalid_rules: Json
          name: string
          optional_fields: Json
          quick_replies: Json
          required_fields: Json
          sample_message_template: string | null
          sample_payload: Json
          template_label: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          campaign_type?: string
          created_at?: string
          derived_variables?: Json
          description?: string | null
          fallback_rules?: Json
          id?: string
          invalid_rules?: Json
          name: string
          optional_fields?: Json
          quick_replies?: Json
          required_fields?: Json
          sample_message_template?: string | null
          sample_payload?: Json
          template_label?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          campaign_type?: string
          created_at?: string
          derived_variables?: Json
          description?: string | null
          fallback_rules?: Json
          id?: string
          invalid_rules?: Json
          name?: string
          optional_fields?: Json
          quick_replies?: Json
          required_fields?: Json
          sample_message_template?: string | null
          sample_payload?: Json
          template_label?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      audience_rows: {
        Row: {
          batch_id: string
          created_at: string
          derived_payload: Json
          id: string
          payload: Json
          phone: string
          reserved_at: string | null
          usage_status: Database["public"]["Enums"]["audience_row_usage"]
          used_at: string | null
          used_in_campaign_id: string | null
          validation_status: Database["public"]["Enums"]["audience_row_validation"]
          workspace_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          derived_payload?: Json
          id?: string
          payload?: Json
          phone: string
          reserved_at?: string | null
          usage_status?: Database["public"]["Enums"]["audience_row_usage"]
          used_at?: string | null
          used_in_campaign_id?: string | null
          validation_status?: Database["public"]["Enums"]["audience_row_validation"]
          workspace_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          derived_payload?: Json
          id?: string
          payload?: Json
          phone?: string
          reserved_at?: string | null
          usage_status?: Database["public"]["Enums"]["audience_row_usage"]
          used_at?: string | null
          used_in_campaign_id?: string | null
          validation_status?: Database["public"]["Enums"]["audience_row_validation"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "audience_batch_stats"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "audience_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "audience_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      bm_partner_assignments: {
        Row: {
          business_manager_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          notes: string | null
          partner_id: string
          rate_usd: number
          role: string
        }
        Insert: {
          business_manager_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          partner_id: string
          rate_usd: number
          role: string
        }
        Update: {
          business_manager_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          partner_id?: string
          rate_usd?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "bm_partner_assignments_business_manager_id_fkey"
            columns: ["business_manager_id"]
            isOneToOne: false
            referencedRelation: "business_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bm_partner_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      business_manager_warmup_events: {
        Row: {
          business_manager_id: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json
          workspace_id: string
        }
        Insert: {
          business_manager_id: string
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json
          workspace_id: string
        }
        Update: {
          business_manager_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_manager_warmup_events_business_manager_id_fkey"
            columns: ["business_manager_id"]
            isOneToOne: false
            referencedRelation: "business_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      business_managers: {
        Row: {
          ads_launched_before: boolean
          ads_running: boolean
          created_at: string
          created_by: string
          current_day_sent: number
          daily_warmup_cap: number | null
          external_id: string | null
          health_score: number
          id: string
          last_warmup_action_at: string | null
          meta_bm_id: string | null
          name: string
          next_warmup_run_date: string | null
          notes: string | null
          owner_email: string | null
          provider: string
          status: string
          updated_at: string
          verification_status: string
          warmup_completed_at: string | null
          warmup_stage: string | null
          warmup_started_at: string | null
          warmup_target_date: string | null
          workspace_id: string | null
        }
        Insert: {
          ads_launched_before?: boolean
          ads_running?: boolean
          created_at?: string
          created_by: string
          current_day_sent?: number
          daily_warmup_cap?: number | null
          external_id?: string | null
          health_score?: number
          id?: string
          last_warmup_action_at?: string | null
          meta_bm_id?: string | null
          name: string
          next_warmup_run_date?: string | null
          notes?: string | null
          owner_email?: string | null
          provider?: string
          status?: string
          updated_at?: string
          verification_status?: string
          warmup_completed_at?: string | null
          warmup_stage?: string | null
          warmup_started_at?: string | null
          warmup_target_date?: string | null
          workspace_id?: string | null
        }
        Update: {
          ads_launched_before?: boolean
          ads_running?: boolean
          created_at?: string
          created_by?: string
          current_day_sent?: number
          daily_warmup_cap?: number | null
          external_id?: string | null
          health_score?: number
          id?: string
          last_warmup_action_at?: string | null
          meta_bm_id?: string | null
          name?: string
          next_warmup_run_date?: string | null
          notes?: string | null
          owner_email?: string | null
          provider?: string
          status?: string
          updated_at?: string
          verification_status?: string
          warmup_completed_at?: string | null
          warmup_stage?: string | null
          warmup_started_at?: string | null
          warmup_target_date?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      campaign_dispatch_events: {
        Row: {
          campaign_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          reason: string | null
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          reason?: string | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          reason?: string | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_dispatch_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_insights: {
        Row: {
          campaign_id: string
          generated_at: string
          generated_by: string | null
          metrics: Json
          model: string | null
          summary_md: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          generated_at?: string
          generated_by?: string | null
          metrics?: Json
          model?: string | null
          summary_md?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          generated_at?: string
          generated_by?: string | null
          metrics?: Json
          model?: string | null
          summary_md?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      campaign_number_allocations: {
        Row: {
          allocated_count: number
          campaign_id: string
          created_at: string
          id: string
          is_manual_override: boolean
          sent_count: number
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          allocated_count?: number
          campaign_id: string
          created_at?: string
          id?: string
          is_manual_override?: boolean
          sent_count?: number
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          allocated_count?: number
          campaign_id?: string
          created_at?: string
          id?: string
          is_manual_override?: boolean
          sent_count?: number
          whatsapp_number_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_number_allocations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_name: string | null
          contact_phone: string
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["campaign_recipient_status"]
          updated_at: string
          user_id: string
          variables: Json
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          campaign_id: string
          contact_name?: string | null
          contact_phone: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_recipient_status"]
          updated_at?: string
          user_id: string
          variables?: Json
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          campaign_id?: string
          contact_name?: string | null
          contact_phone?: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_recipient_status"]
          updated_at?: string
          user_id?: string
          variables?: Json
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          allocated_capacity: number | null
          audience_total: number | null
          auto_allocated: boolean
          created_at: string
          delay_max_seconds: number
          delay_min_seconds: number
          dispatch_mode: string
          failed_count: number
          first_scheduled_at: string | null
          id: string
          kill_switch_at: string | null
          kill_switch_by: string | null
          kill_switch_reason: string | null
          kind: string
          last_day_completed_date: string | null
          max_inflight_per_campaign: number
          max_inflight_per_number: number
          name: string
          parent_campaign_id: string | null
          per_number_quota: number
          pipeline_id: string | null
          prepared_at: string | null
          prepared_expires_at: string | null
          prepared_report: Json | null
          prepared_signature: string | null
          recipient_country: string | null
          recurrence: Database["public"]["Enums"]["campaign_recurrence"]
          recurrence_end_at: string | null
          respect_recipient_tz: boolean
          schedule_window_end: string
          schedule_window_start: string
          scheduled_dates: string[]
          scheduled_start_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          today_recipients_count: number
          total_recipients: number
          updated_at: string
          user_id: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          allocated_capacity?: number | null
          audience_total?: number | null
          auto_allocated?: boolean
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          dispatch_mode?: string
          failed_count?: number
          first_scheduled_at?: string | null
          id?: string
          kill_switch_at?: string | null
          kill_switch_by?: string | null
          kill_switch_reason?: string | null
          kind?: string
          last_day_completed_date?: string | null
          max_inflight_per_campaign?: number
          max_inflight_per_number?: number
          name: string
          parent_campaign_id?: string | null
          per_number_quota?: number
          pipeline_id?: string | null
          prepared_at?: string | null
          prepared_expires_at?: string | null
          prepared_report?: Json | null
          prepared_signature?: string | null
          recipient_country?: string | null
          recurrence?: Database["public"]["Enums"]["campaign_recurrence"]
          recurrence_end_at?: string | null
          respect_recipient_tz?: boolean
          schedule_window_end?: string
          schedule_window_start?: string
          scheduled_dates?: string[]
          scheduled_start_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          today_recipients_count?: number
          total_recipients?: number
          updated_at?: string
          user_id: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          allocated_capacity?: number | null
          audience_total?: number | null
          auto_allocated?: boolean
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          dispatch_mode?: string
          failed_count?: number
          first_scheduled_at?: string | null
          id?: string
          kill_switch_at?: string | null
          kill_switch_by?: string | null
          kill_switch_reason?: string | null
          kind?: string
          last_day_completed_date?: string | null
          max_inflight_per_campaign?: number
          max_inflight_per_number?: number
          name?: string
          parent_campaign_id?: string | null
          per_number_quota?: number
          pipeline_id?: string | null
          prepared_at?: string | null
          prepared_expires_at?: string | null
          prepared_report?: Json | null
          prepared_signature?: string | null
          recipient_country?: string | null
          recurrence?: Database["public"]["Enums"]["campaign_recurrence"]
          recurrence_end_at?: string | null
          respect_recipient_tz?: boolean
          schedule_window_end?: string
          schedule_window_start?: string
          scheduled_dates?: string[]
          scheduled_start_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          today_recipients_count?: number
          total_recipients?: number
          updated_at?: string
          user_id?: string
          whatsapp_number_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_parent_campaign_id_fkey"
            columns: ["parent_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_number_usage_summary"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_leads: {
        Row: {
          client_id: string
          created_at: string
          data: Json
          id: string
          row_index: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          data?: Json
          id?: string
          row_index?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          data?: Json
          id?: string
          row_index?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          google_sheet_id: string
          id: string
          sheet_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          google_sheet_id: string
          id?: string
          sheet_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          google_sheet_id?: string
          id?: string
          sheet_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_insights: {
        Row: {
          conversation_id: string
          first_reply_at: string | null
          first_reply_text: string | null
          model: string | null
          raw: Json
          reply_intent: string | null
          reply_sentiment: string | null
          summary: string | null
          tagged_at: string
          tagged_by: string
          tagged_by_user_id: string | null
          time_to_first_reply_seconds: number | null
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          first_reply_at?: string | null
          first_reply_text?: string | null
          model?: string | null
          raw?: Json
          reply_intent?: string | null
          reply_sentiment?: string | null
          summary?: string | null
          tagged_at?: string
          tagged_by?: string
          tagged_by_user_id?: string | null
          time_to_first_reply_seconds?: number | null
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          first_reply_at?: string | null
          first_reply_text?: string | null
          model?: string | null
          raw?: Json
          reply_intent?: string | null
          reply_sentiment?: string | null
          summary?: string | null
          tagged_at?: string
          tagged_by?: string
          tagged_by_user_id?: string | null
          time_to_first_reply_seconds?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          active_responder_at: string | null
          active_responder_id: string | null
          assigned_at: string | null
          assigned_setter_id: string | null
          assigned_user_id: string | null
          contact_name: string | null
          contact_phone: string
          created_at: string
          first_human_reply_at: string | null
          id: string
          is_starred: boolean
          last_auto_positive_alert_at: string | null
          last_human_reply_at: string | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_text: string | null
          pinned_at: string | null
          pipeline_id: string | null
          unread_count: number
          updated_at: string
          user_id: string
          waiting_since: string | null
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          active_responder_at?: string | null
          active_responder_id?: string | null
          assigned_at?: string | null
          assigned_setter_id?: string | null
          assigned_user_id?: string | null
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          first_human_reply_at?: string | null
          id?: string
          is_starred?: boolean
          last_auto_positive_alert_at?: string | null
          last_human_reply_at?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_text?: string | null
          pinned_at?: string | null
          pipeline_id?: string | null
          unread_count?: number
          updated_at?: string
          user_id: string
          waiting_since?: string | null
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          active_responder_at?: string | null
          active_responder_id?: string | null
          assigned_at?: string | null
          assigned_setter_id?: string | null
          assigned_user_id?: string | null
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          first_human_reply_at?: string | null
          id?: string
          is_starred?: boolean
          last_auto_positive_alert_at?: string | null
          last_human_reply_at?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_text?: string | null
          pinned_at?: string | null
          pipeline_id?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string
          waiting_since?: string | null
          whatsapp_number_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_setter_id_fkey"
            columns: ["assigned_setter_id"]
            isOneToOne: false
            referencedRelation: "workspace_setters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_number_usage_summary"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number | null
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          pipeline_id: string | null
          position: number
          stage_id: string
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number | null
          contact_name?: string | null
          contact_phone?: string | null
          conversation_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          pipeline_id?: string | null
          position?: number
          stage_id: string
          title: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number | null
          contact_name?: string | null
          contact_phone?: string | null
          conversation_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          pipeline_id?: string | null
          position?: number
          stage_id?: string
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      fleet_health_snapshots: {
        Row: {
          captured_at: string
          id: number
          summary: Json
        }
        Insert: {
          captured_at?: string
          id?: number
          summary?: Json
        }
        Update: {
          captured_at?: string
          id?: number
          summary?: Json
        }
        Relationships: []
      }
      form_analytics: {
        Row: {
          created_at: string
          event_type: string
          form_type: string
          id: string
          metadata: Json | null
          session_id: string
          step_name: string
          step_number: number
        }
        Insert: {
          created_at?: string
          event_type?: string
          form_type: string
          id?: string
          metadata?: Json | null
          session_id: string
          step_name: string
          step_number: number
        }
        Update: {
          created_at?: string
          event_type?: string
          form_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string
          step_name?: string
          step_number?: number
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          contact_company: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_website: string | null
          created_at: string
          data: Json
          form_type: Database["public"]["Enums"]["form_type"]
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["submission_status"]
          updated_at: string
        }
        Insert: {
          contact_company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          created_at?: string
          data?: Json
          form_type: Database["public"]["Enums"]["form_type"]
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          updated_at?: string
        }
        Update: {
          contact_company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          created_at?: string
          data?: Json
          form_type?: Database["public"]["Enums"]["form_type"]
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          updated_at?: string
        }
        Relationships: []
      }
      gupshup_mail_log: {
        Row: {
          category: Database["public"]["Enums"]["gupshup_mail_category"]
          created_at: string
          from_address: string | null
          gmail_id: string
          id: string
          parsed: Json
          received_at: string
          severity: Database["public"]["Enums"]["gupshup_mail_severity"]
          slack_event_id: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["gupshup_mail_category"]
          created_at?: string
          from_address?: string | null
          gmail_id: string
          id?: string
          parsed?: Json
          received_at: string
          severity?: Database["public"]["Enums"]["gupshup_mail_severity"]
          slack_event_id?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["gupshup_mail_category"]
          created_at?: string
          from_address?: string | null
          gmail_id?: string
          id?: string
          parsed?: Json
          received_at?: string
          severity?: Database["public"]["Enums"]["gupshup_mail_severity"]
          slack_event_id?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gupshup_mail_log_slack_event_id_fkey"
            columns: ["slack_event_id"]
            isOneToOne: false
            referencedRelation: "slack_event_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gupshup_mail_log_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_number_usage_summary"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "gupshup_mail_log_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gupshup_mail_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      gupshup_mail_state: {
        Row: {
          id: number
          last_error: string | null
          last_internal_date_ms: number
          last_run_at: string | null
        }
        Insert: {
          id?: number
          last_error?: string | null
          last_internal_date_ms?: number
          last_run_at?: string | null
        }
        Update: {
          id?: number
          last_error?: string | null
          last_internal_date_ms?: number
          last_run_at?: string | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          accepted: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          pipeline_id: string
          rejected: number
          source_connection_id: string | null
          source_kind: string
          started_at: string
          status: string
          total: number
          workspace_id: string
        }
        Insert: {
          accepted?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          pipeline_id: string
          rejected?: number
          source_connection_id?: string | null
          source_kind: string
          started_at?: string
          status?: string
          total?: number
          workspace_id: string
        }
        Update: {
          accepted?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          pipeline_id?: string
          rejected?: number
          source_connection_id?: string | null
          source_kind?: string
          started_at?: string
          status?: string
          total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_source_connection_id_fkey"
            columns: ["source_connection_id"]
            isOneToOne: false
            referencedRelation: "source_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_imports: {
        Row: {
          batch_id: string | null
          campaign_id: string | null
          campaign_recipient_id: string | null
          conversation_id: string | null
          deal_id: string | null
          error: string | null
          external_id: string | null
          id: string
          imported_at: string
          name: string | null
          payload: Json
          phone: string
          pipeline_id: string
          scheduled_at: string | null
          sent_at: string | null
          source_connection_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          batch_id?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          conversation_id?: string | null
          deal_id?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          imported_at?: string
          name?: string | null
          payload?: Json
          phone: string
          pipeline_id: string
          scheduled_at?: string | null
          sent_at?: string | null
          source_connection_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          batch_id?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          conversation_id?: string | null
          deal_id?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          imported_at?: string
          name?: string | null
          payload?: Json
          phone?: string
          pipeline_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          source_connection_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_imports_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_imports_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_imports_source_connection_id_fkey"
            columns: ["source_connection_id"]
            isOneToOne: false
            referencedRelation: "source_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string | null
          buttons: Json
          category: Database["public"]["Enums"]["template_category"]
          created_at: string
          external_id: string | null
          footer_text: string | null
          header_text: string | null
          id: string
          language: string
          last_notified_status: string | null
          name: string
          namespace: string | null
          provider_template_id: string | null
          quality: string | null
          raw: Json | null
          status: string
          sync_warning: string | null
          synced_at: string | null
          updated_at: string
          user_id: string
          variables: Json
          variables_sample: Json
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          buttons?: Json
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          external_id?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          last_notified_status?: string | null
          name: string
          namespace?: string | null
          provider_template_id?: string | null
          quality?: string | null
          raw?: Json | null
          status?: string
          sync_warning?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
          variables?: Json
          variables_sample?: Json
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          buttons?: Json
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          external_id?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          last_notified_status?: string | null
          name?: string
          namespace?: string | null
          provider_template_id?: string | null
          quality?: string | null
          raw?: Json | null
          status?: string
          sync_warning?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
          variables?: Json
          variables_sample?: Json
          whatsapp_number_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_number_usage_summary"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "message_templates_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          media_type: string | null
          media_url: string | null
          metadata: Json
          provider_message_id: string | null
          sent_by_user_id: string | null
          status: Database["public"]["Enums"]["message_status"]
          user_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json
          provider_message_id?: string | null
          sent_by_user_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          user_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_type?: string | null
          media_url?: string | null
          metadata?: Json
          provider_message_id?: string | null
          sent_by_user_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      number_ownership: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          partner_id: string
          whatsapp_number_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          partner_id: string
          whatsapp_number_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          partner_id?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_ownership_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          partner_id: string
          rate_usd: number
          scope: string
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          partner_id: string
          rate_usd: number
          scope: string
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          partner_id?: string
          rate_usd?: number
          scope?: string
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_rates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          auto_post_slack: boolean
          cadence: string
          cadence_anchor: number | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_payout_rate_usd: number
          id: string
          kind: string
          last_run_period_to: string | null
          name: string
          notes: string | null
          payment_notes: string | null
          referral_rate_usd: number
          referrer_partner_id: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_post_slack?: boolean
          cadence?: string
          cadence_anchor?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_payout_rate_usd?: number
          id?: string
          kind?: string
          last_run_period_to?: string | null
          name: string
          notes?: string | null
          payment_notes?: string | null
          referral_rate_usd?: number
          referrer_partner_id?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_post_slack?: boolean
          cadence?: string
          cadence_anchor?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_payout_rate_usd?: number
          id?: string
          kind?: string
          last_run_period_to?: string | null
          name?: string
          notes?: string | null
          payment_notes?: string | null
          referral_rate_usd?: number
          referrer_partner_id?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_referrer_partner_id_fkey"
            columns: ["referrer_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_line_items: {
        Row: {
          billed_usd: number
          client_rate_usd: number
          created_at: string
          day: string
          delivered: number
          failed: number
          id: string
          is_adjustment: boolean
          margin_usd: number
          notes: string | null
          partner_rate_usd: number
          payout_run_id: string
          payout_usd: number
          role: string | null
          sent: number
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          billed_usd?: number
          client_rate_usd?: number
          created_at?: string
          day: string
          delivered?: number
          failed?: number
          id?: string
          is_adjustment?: boolean
          margin_usd?: number
          notes?: string | null
          partner_rate_usd?: number
          payout_run_id: string
          payout_usd?: number
          role?: string | null
          sent?: number
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          billed_usd?: number
          client_rate_usd?: number
          created_at?: string
          day?: string
          delivered?: number
          failed?: number
          id?: string
          is_adjustment?: boolean
          margin_usd?: number
          notes?: string | null
          partner_rate_usd?: number
          payout_run_id?: string
          payout_usd?: number
          role?: string | null
          sent?: number
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_line_items_payout_run_id_fkey"
            columns: ["payout_run_id"]
            isOneToOne: false
            referencedRelation: "payout_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_run_audit: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          id: string
          note: string | null
          payout_run_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          note?: string | null
          payout_run_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          note?: string | null
          payout_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_run_audit_payout_run_id_fkey"
            columns: ["payout_run_id"]
            isOneToOne: false
            referencedRelation: "payout_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean
          cadence: string | null
          csv_storage_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          manager_pdf_storage_path: string | null
          margin_usd: number
          notes: string | null
          paid_amount_usd: number | null
          paid_at: string | null
          paid_by: string | null
          paid_reference: string | null
          partner_id: string
          partner_pdf_storage_path: string | null
          pdf_storage_path: string | null
          period_from: string
          period_to: string
          role: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          source_data_hash: string | null
          source_event_count: number
          status: string
          total_billed_usd: number
          total_payout_usd: number
          totals_delivered: number
          totals_failed: number
          totals_sent: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_generated?: boolean
          cadence?: string | null
          csv_storage_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          manager_pdf_storage_path?: string | null
          margin_usd?: number
          notes?: string | null
          paid_amount_usd?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_reference?: string | null
          partner_id: string
          partner_pdf_storage_path?: string | null
          pdf_storage_path?: string | null
          period_from: string
          period_to: string
          role?: string | null
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          source_data_hash?: string | null
          source_event_count?: number
          status?: string
          total_billed_usd?: number
          total_payout_usd?: number
          totals_delivered?: number
          totals_failed?: number
          totals_sent?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_generated?: boolean
          cadence?: string | null
          csv_storage_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          manager_pdf_storage_path?: string | null
          margin_usd?: number
          notes?: string | null
          paid_amount_usd?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_reference?: string | null
          partner_id?: string
          partner_pdf_storage_path?: string | null
          pdf_storage_path?: string | null
          period_from?: string
          period_to?: string
          role?: string | null
          slack_channel_id?: string | null
          slack_message_ts?: string | null
          source_data_hash?: string | null
          source_event_count?: number
          status?: string
          total_billed_usd?: number
          total_payout_usd?: number
          totals_delivered?: number
          totals_failed?: number
          totals_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_runs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_follow_ups: {
        Row: {
          campaign_recipient_id: string | null
          cancelled_reason: string | null
          conversation_id: string
          created_at: string
          first_touch_recipient_id: string | null
          id: string
          lead_import_id: string | null
          pipeline_id: string
          scheduled_at: string
          status: string
          updated_at: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          campaign_recipient_id?: string | null
          cancelled_reason?: string | null
          conversation_id: string
          created_at?: string
          first_touch_recipient_id?: string | null
          id?: string
          lead_import_id?: string | null
          pipeline_id: string
          scheduled_at: string
          status?: string
          updated_at?: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          campaign_recipient_id?: string | null
          cancelled_reason?: string | null
          conversation_id?: string
          created_at?: string
          first_touch_recipient_id?: string | null
          id?: string
          lead_import_id?: string | null
          pipeline_id?: string
          scheduled_at?: string
          status?: string
          updated_at?: string
          whatsapp_number_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          pipeline_id: string | null
          position: number
          stage_type: Database["public"]["Enums"]["stage_type"]
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          pipeline_id?: string | null
          position?: number
          stage_type?: Database["public"]["Enums"]["stage_type"]
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          pipeline_id?: string | null
          position?: number
          stage_type?: Database["public"]["Enums"]["stage_type"]
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      pipelines: {
        Row: {
          auto_outreach_enabled: boolean
          color: string
          created_at: string
          daily_cap: number | null
          default_sender_number_ids: string[]
          expected_country_codes: string[]
          failed_stage_id: string | null
          first_touch_template_group_id: string | null
          first_touch_template_id: string | null
          follow_up_curfew_end: string
          follow_up_delay_minutes: number
          follow_up_enabled: boolean
          follow_up_resume_at: string
          follow_up_template_group_id: string | null
          follow_up_template_id: string | null
          follow_up_timezone: string
          id: string
          is_default: boolean
          name: string
          position: number
          sending_window: Json | null
          slack_channel_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          auto_outreach_enabled?: boolean
          color?: string
          created_at?: string
          daily_cap?: number | null
          default_sender_number_ids?: string[]
          expected_country_codes?: string[]
          failed_stage_id?: string | null
          first_touch_template_group_id?: string | null
          first_touch_template_id?: string | null
          follow_up_curfew_end?: string
          follow_up_delay_minutes?: number
          follow_up_enabled?: boolean
          follow_up_resume_at?: string
          follow_up_template_group_id?: string | null
          follow_up_template_id?: string | null
          follow_up_timezone?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          sending_window?: Json | null
          slack_channel_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          auto_outreach_enabled?: boolean
          color?: string
          created_at?: string
          daily_cap?: number | null
          default_sender_number_ids?: string[]
          expected_country_codes?: string[]
          failed_stage_id?: string | null
          first_touch_template_group_id?: string | null
          first_touch_template_id?: string | null
          follow_up_curfew_end?: string
          follow_up_delay_minutes?: number
          follow_up_enabled?: boolean
          follow_up_resume_at?: string
          follow_up_template_group_id?: string | null
          follow_up_template_id?: string | null
          follow_up_timezone?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          sending_window?: Json | null
          slack_channel_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_failed_stage_id_fkey"
            columns: ["failed_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_first_touch_template_group_id_fkey"
            columns: ["first_touch_template_group_id"]
            isOneToOne: false
            referencedRelation: "template_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_follow_up_template_group_id_fkey"
            columns: ["follow_up_template_group_id"]
            isOneToOne: false
            referencedRelation: "template_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_backoff: {
        Row: {
          attempt_count: number
          last_error: string | null
          last_status: number | null
          retry_after: string
          updated_at: string
          whatsapp_number_id: string
        }
        Insert: {
          attempt_count?: number
          last_error?: string | null
          last_status?: number | null
          retry_after: string
          updated_at?: string
          whatsapp_number_id: string
        }
        Update: {
          attempt_count?: number
          last_error?: string | null
          last_status?: number | null
          retry_after?: string
          updated_at?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_backoff_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_number_usage_summary"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "provider_backoff_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          position: number
          priority: number
          status: Database["public"]["Enums"]["roadmap_status"]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          why: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          priority?: number
          status?: Database["public"]["Enums"]["roadmap_status"]
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          why?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          priority?: number
          status?: Database["public"]["Enums"]["roadmap_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          why?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      slack_dispatch_kick: {
        Row: {
          id: boolean
          last_kicked_at: string
        }
        Insert: {
          id?: boolean
          last_kicked_at?: string
        }
        Update: {
          id?: boolean
          last_kicked_at?: string
        }
        Relationships: []
      }
      slack_event_queue: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          event_type: string
          id: string
          max_attempts: number
          payload: Json
          processed_at: string | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          status?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      source_connections: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          id: string
          kind: string
          last_error: string | null
          last_ingest_at: string | null
          name: string
          pipeline_id: string
          secret_token: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by: string
          id?: string
          kind: string
          last_error?: string | null
          last_ingest_at?: string | null
          name: string
          pipeline_id: string
          secret_token: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_ingest_at?: string | null
          name?: string
          pipeline_id?: string
          secret_token?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_connections_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_automations: {
        Row: {
          created_at: string
          delay_minutes: number | null
          id: string
          is_active: boolean
          pipeline_id: string | null
          source_stage_id: string | null
          target_stage_id: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_value: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          delay_minutes?: number | null
          id?: string
          is_active?: boolean
          pipeline_id?: string | null
          source_stage_id?: string | null
          target_stage_id: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_value?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          delay_minutes?: number | null
          id?: string
          is_active?: boolean
          pipeline_id?: string | null
          source_stage_id?: string | null
          target_stage_id?: string
          trigger?: Database["public"]["Enums"]["automation_trigger"]
          trigger_value?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_automations_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_automations_source_stage_id_fkey"
            columns: ["source_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_automations_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          kind: string
          last_sent_at: string
        }
        Insert: {
          kind: string
          last_sent_at?: string
        }
        Update: {
          kind?: string
          last_sent_at?: string
        }
        Relationships: []
      }
      system_flags: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      system_heartbeats: {
        Row: {
          last_run_at: string
          name: string
          payload: Json
        }
        Insert: {
          last_run_at?: string
          name: string
          payload?: Json
        }
        Update: {
          last_run_at?: string
          name?: string
          payload?: Json
        }
        Relationships: []
      }
      template_groups: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          template_names: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          template_names?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          template_names?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      tv_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          label: string | null
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          label?: string | null
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          revoked_at?: string | null
          token?: string
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          created_at: string
          day: string
          id: string
          last_seen_at: string
          minutes_active: number
          sessions: number
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          last_seen_at?: string
          minutes_active?: number
          sessions?: number
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          last_seen_at?: string
          minutes_active?: number
          sessions?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_message_events: {
        Row: {
          campaign_recipient_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          event_type: string
          id: string
          message_id: string | null
          provider_message_id: string | null
          raw: Json
          received_at: string
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Insert: {
          campaign_recipient_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          message_id?: string | null
          provider_message_id?: string | null
          raw?: Json
          received_at?: string
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          campaign_recipient_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          message_id?: string | null
          provider_message_id?: string | null
          raw?: Json
          received_at?: string
          whatsapp_number_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      whatsapp_numbers: {
        Row: {
          assigned_ref: string | null
          bm_name: string | null
          business_manager_id: string | null
          connected_in_gupshup: boolean
          connected_in_iskra: boolean
          country_code: string | null
          created_at: string
          daily_send_limit: number
          display_name: string | null
          display_name_checked_at: string | null
          display_name_status: string
          id: string
          is_active: boolean
          is_warming: boolean
          label: string | null
          last_health_sync_at: string | null
          last_health_sync_error: string | null
          messaging_limit: string | null
          notes: string | null
          partner_source: string | null
          paused_at: string | null
          paused_reason: string | null
          phone_number: string
          profile_avatar: string | null
          provided_by: string | null
          provider: string
          provider_api_key: string | null
          provider_app_id: string | null
          provider_waba_id: string | null
          quality_rating: string | null
          restricted_at: string | null
          status: Database["public"]["Enums"]["whatsapp_number_status"]
          unrestricted_at: string | null
          updated_at: string
          usage_type: Database["public"]["Enums"]["whatsapp_number_usage"]
          user_id: string
          webhook_connected: boolean
          workspace_id: string | null
        }
        Insert: {
          assigned_ref?: string | null
          bm_name?: string | null
          business_manager_id?: string | null
          connected_in_gupshup?: boolean
          connected_in_iskra?: boolean
          country_code?: string | null
          created_at?: string
          daily_send_limit?: number
          display_name?: string | null
          display_name_checked_at?: string | null
          display_name_status?: string
          id?: string
          is_active?: boolean
          is_warming?: boolean
          label?: string | null
          last_health_sync_at?: string | null
          last_health_sync_error?: string | null
          messaging_limit?: string | null
          notes?: string | null
          partner_source?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          phone_number: string
          profile_avatar?: string | null
          provided_by?: string | null
          provider?: string
          provider_api_key?: string | null
          provider_app_id?: string | null
          provider_waba_id?: string | null
          quality_rating?: string | null
          restricted_at?: string | null
          status?: Database["public"]["Enums"]["whatsapp_number_status"]
          unrestricted_at?: string | null
          updated_at?: string
          usage_type?: Database["public"]["Enums"]["whatsapp_number_usage"]
          user_id: string
          webhook_connected?: boolean
          workspace_id?: string | null
        }
        Update: {
          assigned_ref?: string | null
          bm_name?: string | null
          business_manager_id?: string | null
          connected_in_gupshup?: boolean
          connected_in_iskra?: boolean
          country_code?: string | null
          created_at?: string
          daily_send_limit?: number
          display_name?: string | null
          display_name_checked_at?: string | null
          display_name_status?: string
          id?: string
          is_active?: boolean
          is_warming?: boolean
          label?: string | null
          last_health_sync_at?: string | null
          last_health_sync_error?: string | null
          messaging_limit?: string | null
          notes?: string | null
          partner_source?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          phone_number?: string
          profile_avatar?: string | null
          provided_by?: string | null
          provider?: string
          provider_api_key?: string | null
          provider_app_id?: string | null
          provider_waba_id?: string | null
          quality_rating?: string | null
          restricted_at?: string | null
          status?: Database["public"]["Enums"]["whatsapp_number_status"]
          unrestricted_at?: string | null
          updated_at?: string
          usage_type?: Database["public"]["Enums"]["whatsapp_number_usage"]
          user_id?: string
          webhook_connected?: boolean
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_numbers_business_manager_id_fkey"
            columns: ["business_manager_id"]
            isOneToOne: false
            referencedRelation: "business_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_failures: {
        Row: {
          app_name: string | null
          created_at: string
          destination: string | null
          event_type: string | null
          id: string
          matched_whatsapp_number_id: string | null
          payload: Json
          reason: string
          replay_error: string | null
          replay_status: string
          replayed_at: string | null
          source: string | null
        }
        Insert: {
          app_name?: string | null
          created_at?: string
          destination?: string | null
          event_type?: string | null
          id?: string
          matched_whatsapp_number_id?: string | null
          payload: Json
          reason: string
          replay_error?: string | null
          replay_status?: string
          replayed_at?: string | null
          source?: string | null
        }
        Update: {
          app_name?: string | null
          created_at?: string
          destination?: string | null
          event_type?: string | null
          id?: string
          matched_whatsapp_number_id?: string | null
          payload?: Json
          reason?: string
          replay_error?: string | null
          replay_status?: string
          replayed_at?: string | null
          source?: string | null
        }
        Relationships: []
      }
      workspace_billing_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          rate_usd: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          rate_usd: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          rate_usd?: number
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_files: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_invite_links: {
        Row: {
          allowed_pipeline_ids: string[] | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          max_uses: number
          revoked_at: string | null
          role: string
          token: string
          used_count: number
          workspace_id: string
        }
        Insert: {
          allowed_pipeline_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: string
          token: string
          used_count?: number
          workspace_id: string
        }
        Update: {
          allowed_pipeline_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: string
          token?: string
          used_count?: number
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_library_fields: {
        Row: {
          created_at: string
          id: string
          is_builtin: boolean
          key: string
          label: string
          position: number
          type: string
          updated_at: string
          value: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_builtin?: boolean
          key: string
          label: string
          position?: number
          type?: string
          updated_at?: string
          value?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_builtin?: boolean
          key?: string
          label?: string
          position?: number
          type?: string
          updated_at?: string
          value?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          allowed_pipeline_ids: string[] | null
          can_view_stats: boolean
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          perm_campaigns_view: boolean
          perm_data: boolean
          perm_inbox: boolean
          perm_launch: boolean
          perm_materials: boolean
          perm_overview: boolean
          perm_pipeline: boolean
          perm_quick_replies_manage: boolean
          perm_quick_replies_use: boolean
          perm_settings: boolean
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          allowed_pipeline_ids?: string[] | null
          can_view_stats?: boolean
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          perm_campaigns_view?: boolean
          perm_data?: boolean
          perm_inbox?: boolean
          perm_launch?: boolean
          perm_materials?: boolean
          perm_overview?: boolean
          perm_pipeline?: boolean
          perm_quick_replies_manage?: boolean
          perm_quick_replies_use?: boolean
          perm_settings?: boolean
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          allowed_pipeline_ids?: string[] | null
          can_view_stats?: boolean
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          perm_campaigns_view?: boolean
          perm_data?: boolean
          perm_inbox?: boolean
          perm_launch?: boolean
          perm_materials?: boolean
          perm_overview?: boolean
          perm_pipeline?: boolean
          perm_quick_replies_manage?: boolean
          perm_quick_replies_use?: boolean
          perm_settings?: boolean
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          position: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_saved_replies: {
        Row: {
          body: string
          created_at: string
          folder: string | null
          id: string
          is_favorite: boolean
          last_used_at: string | null
          position: number
          scope: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          folder?: string | null
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          position?: number
          scope?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          folder?: string | null
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          position?: number
          scope?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_setters: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          external: boolean
          id: string
          is_active: boolean
          linked_user_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          external?: boolean
          id?: string
          is_active?: boolean
          linked_user_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          external?: boolean
          id?: string
          is_active?: boolean
          linked_user_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_setters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          color: string
          created_at: string
          delivered_rate_usd: number
          id: string
          inbox_alerts_enabled: boolean
          internal_code: string | null
          is_active: boolean
          last_inbox_spike_alert_at: string | null
          last_positive_lead_alert_at: string | null
          logo_url: string | null
          name: string
          owner_user_id: string
          slack_channel_id: string | null
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          delivered_rate_usd?: number
          id?: string
          inbox_alerts_enabled?: boolean
          internal_code?: string | null
          is_active?: boolean
          last_inbox_spike_alert_at?: string | null
          last_positive_lead_alert_at?: string | null
          logo_url?: string | null
          name: string
          owner_user_id: string
          slack_channel_id?: string | null
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          delivered_rate_usd?: number
          id?: string
          inbox_alerts_enabled?: boolean
          internal_code?: string | null
          is_active?: boolean
          last_inbox_spike_alert_at?: string | null
          last_positive_lead_alert_at?: string | null
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          slack_channel_id?: string | null
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      audience_batch_stats: {
        Row: {
          batch_id: string | null
          duplicates: number | null
          invalid: number | null
          reserved: number | null
          scheduled: number | null
          total: number | null
          unused: number | null
          used: number | null
          valid: number | null
          workspace_id: string | null
        }
        Relationships: []
      }
      campaign_report_rows: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          delivery_status: string | null
          error_message: string | null
          first_reply_at: string | null
          first_reply_text: string | null
          last_message_at: string | null
          lead_payload: Json | null
          pipeline_id: string | null
          provider_message_id: string | null
          recipient_id: string | null
          replied: boolean | null
          reply_intent: string | null
          reply_sentiment: string | null
          scheduled_at: string | null
          sent_at: string | null
          template_body: string | null
          template_id: string | null
          template_name: string | null
          time_to_first_reply_seconds: number | null
          unread_count: number | null
          whatsapp_number: string | null
          whatsapp_number_id: string | null
          whatsapp_number_label: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_metrics_alltime: {
        Row: {
          campaign_id: string | null
          delivered_alltime: number | null
          failed_alltime: number | null
          sent_alltime: number | null
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      v_metrics_today: {
        Row: {
          delivered_today: number | null
          failed_today: number | null
          replies_today: number | null
          sent_today: number | null
          workspace_id: string | null
        }
        Relationships: []
      }
      v_metrics_today_by_campaign: {
        Row: {
          campaign_id: string | null
          failed_today: number | null
          sent_today: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      v_metrics_today_by_number: {
        Row: {
          delivered_today: number | null
          failed_today: number | null
          sent_today: number | null
          whatsapp_number_id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      whatsapp_number_usage_summary: {
        Row: {
          active_campaign_count: number | null
          last_campaign_id: string | null
          last_used_at: string | null
          last_workspace_id: string | null
          number_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["last_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _conversation_is_lost: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      _is_auto_reply_text: { Args: { _text: string }; Returns: boolean }
      _is_negative_reply_text: { Args: { _text: string }; Returns: boolean }
      _is_positive_reply_text: { Args: { _text: string }; Returns: boolean }
      admin_reconcile_daily: {
        Args: {
          _from: string
          _partner_id?: string
          _to: string
          _workspace_id?: string
        }
        Returns: {
          day: string
          display_name: string
          drift_sent: number
          events_delivered: number
          events_failed: number
          events_sent: number
          partner_id: string
          partner_name: string
          phone_number: string
          recipients_failed: number
          recipients_sent: number
          whatsapp_number_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_reconcile_orphans: {
        Args: { _from: string; _to: string }
        Returns: {
          campaign_id: string
          contact_phone: string
          phone_number: string
          provider_message_id: string
          recipient_id: string
          sent_at: string
          whatsapp_number_id: string
          workspace_id: string
        }[]
      }
      admin_reconcile_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          drift_pct: number
          drift_sent: number
          events_delivered: number
          events_failed: number
          events_sent: number
          orphan_count: number
          recipients_failed: number
          recipients_sent: number
        }[]
      }
      apply_assignment_automations: {
        Args: {
          _actor: string
          _conversation_id: string
          _new_assignee: string
          _prev_assignee: string
        }
        Returns: undefined
      }
      approve_payout_run: {
        Args: { _run_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean
          cadence: string | null
          csv_storage_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          manager_pdf_storage_path: string | null
          margin_usd: number
          notes: string | null
          paid_amount_usd: number | null
          paid_at: string | null
          paid_by: string | null
          paid_reference: string | null
          partner_id: string
          partner_pdf_storage_path: string | null
          pdf_storage_path: string | null
          period_from: string
          period_to: string
          role: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          source_data_hash: string | null
          source_event_count: number
          status: string
          total_billed_usd: number
          total_payout_usd: number
          totals_delivered: number
          totals_failed: number
          totals_sent: number
        }
        SetofOptions: {
          from: "*"
          to: "payout_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bm_assignment_rate_at: {
        Args: { _at: string; _bm: string; _partner: string; _role: string }
        Returns: number
      }
      campaign_live_counts: {
        Args: { p_campaign_ids: string[] }
        Returns: {
          campaign_id: string
          failed: number
          meeting: number
          pending: number
          positive: number
          replied: number
          sent: number
          tagged: number
          total: number
          warm: number
        }[]
      }
      campaign_live_status: { Args: { _campaign_id: string }; Returns: string }
      campaign_overflow_clusters: {
        Args: { _threshold?: number }
        Returns: {
          campaign_id: string
          n: number
          scheduled_at: string
        }[]
      }
      campaign_recipient_counts: {
        Args: { p_campaign_ids: string[] }
        Returns: {
          campaign_id: string
          failed_count: number
          pending_count: number
          sent_count: number
        }[]
      }
      can_access_pipeline: {
        Args: { _pipeline_id: string; _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      count_sent_today_for_number: {
        Args: { _number_id: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dubai_start_of_day: { Args: { _at?: string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_deal_for_conversation: {
        Args: { _conversation_id: string }
        Returns: string
      }
      ensure_pipeline_stage: { Args: { _user_id: string }; Returns: string }
      fleet_number_summaries: {
        Args: never
        Returns: {
          active_campaigns: Json
          errors_since_unban: number
          last_campaign_at: string
          last_campaign_name: string
          number_id: string
          outbound_messages: number
          recipients_failed: number
          recipients_pending: number
          recipients_sent: number
          templates_approved: number
          templates_total: number
          webhook_errors: number
        }[]
      }
      generate_payout_run: {
        Args: { _from: string; _partner_id: string; _to: string }
        Returns: string
      }
      generate_payout_run_role: {
        Args: {
          _auto?: boolean
          _cadence?: string
          _from: string
          _partner_id: string
          _role: string
          _to: string
        }
        Returns: string
      }
      get_campaign_report: {
        Args: { p_campaign_id: string }
        Returns: {
          campaign_id: string | null
          campaign_name: string | null
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string | null
          delivery_status: string | null
          error_message: string | null
          first_reply_at: string | null
          first_reply_text: string | null
          last_message_at: string | null
          lead_payload: Json | null
          pipeline_id: string | null
          provider_message_id: string | null
          recipient_id: string | null
          replied: boolean | null
          reply_intent: string | null
          reply_sentiment: string | null
          scheduled_at: string | null
          sent_at: string | null
          template_body: string | null
          template_id: string | null
          template_name: string | null
          time_to_first_reply_seconds: number | null
          unread_count: number | null
          whatsapp_number: string | null
          whatsapp_number_id: string | null
          whatsapp_number_label: string | null
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "campaign_report_rows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_fleet_reply_stats: {
        Args: { _since: string }
        Returns: {
          replied_convos: number
          sent_convos: number
          whatsapp_number_id: string
          workspace_id: string
        }[]
      }
      get_workspace_member_display: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_permission: {
        Args: { _perm: string; _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_manager: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      mark_audience_rows_used: {
        Args: { _campaign_id: string; _row_ids: string[] }
        Returns: number
      }
      mark_membership_joined: { Args: never; Returns: number }
      mark_payout_run_paid: {
        Args: { _amount_usd: number; _reference: string; _run_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean
          cadence: string | null
          csv_storage_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          manager_pdf_storage_path: string | null
          margin_usd: number
          notes: string | null
          paid_amount_usd: number | null
          paid_at: string | null
          paid_by: string | null
          paid_reference: string | null
          partner_id: string
          partner_pdf_storage_path: string | null
          pdf_storage_path: string | null
          period_from: string
          period_to: string
          role: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          source_data_hash: string | null
          source_event_count: number
          status: string
          total_billed_usd: number
          total_payout_usd: number
          totals_delivered: number
          totals_failed: number
          totals_sent: number
        }
        SetofOptions: {
          from: "*"
          to: "payout_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      member_pipeline_scope: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: string[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      number_live_stats: {
        Args: { p_number_ids: string[] }
        Returns: {
          daily_send_limit: number
          failed_7d: number
          failed_today: number
          last_failed_at: string
          last_sent_at: string
          pending_now: number
          restricted_at: string
          sent_7d: number
          sent_all: number
          sent_today: number
          status: string
          whatsapp_number_id: string
        }[]
      }
      number_owner_at: {
        Args: { _at: string; _whatsapp_number_id: string }
        Returns: string
      }
      ops_operator_assigned_conversations: {
        Args: { _user_id: string }
        Returns: {
          assigned_at: string
          contact_name: string
          contact_phone: string
          conversation_id: string
          last_human_reply_at: string
          last_inbound_at: string
          pipeline_id: string
          pipeline_name: string
          unread_count: number
          waiting_since: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      ops_operator_performance: {
        Args: { _window_end: string; _window_start: string }
        Returns: {
          active_now: number
          assigned_now: number
          email: string
          full_name: string
          human_replies_window: number
          median_first_response_seconds: number
          median_response_seconds: number
          meetings_now: number
          oldest_waiting_at: string
          overdue_now: number
          positive_replies_window: number
          unread_now: number
          user_id: string
          waiting_now: number
        }[]
      }
      partner_rate_at: {
        Args: {
          _at: string
          _partner_id: string
          _whatsapp_number_id: string
          _workspace_id: string
        }
        Returns: number
      }
      pending_classification_conversations: {
        Args: { _limit?: number }
        Returns: {
          contact_phone: string
          id: string
          workspace_id: string
        }[]
      }
      pipeline_follow_up_send_at: {
        Args: { _base_ts: string; _pipeline_id: string }
        Returns: string
      }
      purge_pending_leads_for_source: {
        Args: { _source_id: string }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reap_finished_campaigns: {
        Args: { p_idle_minutes?: number }
        Returns: number
      }
      reap_stuck_sending_recipients: {
        Args: { p_idle_minutes?: number }
        Returns: number
      }
      recompute_payout_run: {
        Args: { _run_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean
          cadence: string | null
          csv_storage_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          manager_pdf_storage_path: string | null
          margin_usd: number
          notes: string | null
          paid_amount_usd: number | null
          paid_at: string | null
          paid_by: string | null
          paid_reference: string | null
          partner_id: string
          partner_pdf_storage_path: string | null
          pdf_storage_path: string | null
          period_from: string
          period_to: string
          role: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          source_data_hash: string | null
          source_event_count: number
          status: string
          total_billed_usd: number
          total_payout_usd: number
          totals_delivered: number
          totals_failed: number
          totals_sent: number
        }
        SetofOptions: {
          from: "*"
          to: "payout_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recompute_payout_run_role: {
        Args: { _run_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean
          cadence: string | null
          csv_storage_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          manager_pdf_storage_path: string | null
          margin_usd: number
          notes: string | null
          paid_amount_usd: number | null
          paid_at: string | null
          paid_by: string | null
          paid_reference: string | null
          partner_id: string
          partner_pdf_storage_path: string | null
          pdf_storage_path: string | null
          period_from: string
          period_to: string
          role: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          source_data_hash: string | null
          source_event_count: number
          status: string
          total_billed_usd: number
          total_payout_usd: number
          totals_delivered: number
          totals_failed: number
          totals_sent: number
        }
        SetofOptions: {
          from: "*"
          to: "payout_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_heartbeat: { Args: never; Returns: undefined }
      release_audience_rows: { Args: { _row_ids: string[] }; Returns: number }
      release_job_lock: { Args: { _job_name: string }; Returns: boolean }
      release_stale_reservations: {
        Args: { _older_than_minutes?: number }
        Returns: number
      }
      reserve_audience_rows: {
        Args: { _batch_id: string; _quantity: number }
        Returns: {
          batch_id: string
          created_at: string
          derived_payload: Json
          id: string
          payload: Json
          phone: string
          reserved_at: string | null
          usage_status: Database["public"]["Enums"]["audience_row_usage"]
          used_at: string | null
          used_in_campaign_id: string | null
          validation_status: Database["public"]["Enums"]["audience_row_validation"]
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "audience_rows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      retry_lead_import: {
        Args: { p_lead_id: string; p_new_phone?: string }
        Returns: undefined
      }
      setter_performance: {
        Args: {
          _from: string
          _pipeline_id?: string
          _setter_id?: string
          _to: string
          _workspace_id: string
        }
        Returns: {
          active_chats: number
          avatar_url: string
          avg_first_response_seconds: number
          avg_reply_seconds: number
          conv_booked: number
          conv_closed: number
          conv_showed: number
          display_name: string
          is_external: boolean
          linked_user_id: string
          median_first_response_seconds: number
          median_reply_seconds: number
          replies_in_window: number
          setter_id: string
        }[]
      }
      should_notify_lead_reply: {
        Args: { _conversation_id: string; _reply_text: string }
        Returns: boolean
      }
      try_job_lock: { Args: { _job_name: string }; Returns: boolean }
      verify_payout_run: {
        Args: { _run_id: string }
        Returns: {
          drift: boolean
          live_delivered: number
          live_hash: string
          live_payout: number
          stored_delivered: number
          stored_hash: string
          stored_payout: number
        }[]
      }
      void_payout_run: {
        Args: { _reason: string; _run_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean
          cadence: string | null
          csv_storage_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          manager_pdf_storage_path: string | null
          margin_usd: number
          notes: string | null
          paid_amount_usd: number | null
          paid_at: string | null
          paid_by: string | null
          paid_reference: string | null
          partner_id: string
          partner_pdf_storage_path: string | null
          pdf_storage_path: string | null
          period_from: string
          period_to: string
          role: string | null
          slack_channel_id: string | null
          slack_message_ts: string | null
          source_data_hash: string | null
          source_event_count: number
          status: string
          total_billed_usd: number
          total_payout_usd: number
          totals_delivered: number
          totals_failed: number
          totals_sent: number
        }
        SetofOptions: {
          from: "*"
          to: "payout_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workspace_billing_rate_at: {
        Args: { _at: string; _workspace_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "viewer"
      audience_row_usage: "unused" | "reserved" | "scheduled" | "used"
      audience_row_validation: "valid" | "invalid" | "duplicate"
      automation_trigger:
        | "button_click"
        | "inbound_keyword"
        | "inbound_any"
        | "follow_up_sent"
        | "time_no_inbound"
        | "time_in_stage"
        | "conversation_assigned"
        | "conversation_claimed_self"
      campaign_recipient_status:
        | "pending"
        | "scheduled"
        | "sending"
        | "sent"
        | "failed"
        | "replied"
      campaign_recurrence: "none" | "daily" | "weekly" | "monthly"
      campaign_status:
        | "draft"
        | "running"
        | "paused"
        | "completed"
        | "failed"
        | "scheduled"
        | "cancelled"
      form_type: "qualification" | "seller_leads" | "demo_request" | "bm_access"
      gupshup_mail_category:
        | "quality_drop"
        | "restriction"
        | "block"
        | "template_rejected"
        | "template_approved"
        | "billing"
        | "account_review"
        | "other"
        | "number_approved"
        | "display_name_approved"
        | "display_name_rejected"
        | "waba_restricted"
        | "waba_blocked"
        | "quality_changed"
        | "tier_upgraded"
        | "waba_status_other"
        | "dropped"
      gupshup_mail_severity: "info" | "warning" | "critical"
      message_direction: "inbound" | "outbound"
      message_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "deleted"
      roadmap_status: "idea" | "planned" | "in_progress" | "shipped"
      stage_type: "open" | "won" | "lost"
      submission_status:
        | "new"
        | "contacted"
        | "converted"
        | "rejected"
        | "qualified"
        | "not_qualified"
        | "in_progress"
        | "meeting_booked"
        | "started"
      template_category: "marketing" | "utility" | "authentication"
      whatsapp_number_status:
        | "draft"
        | "ready"
        | "warming"
        | "restricted"
        | "banned"
        | "inactive"
        | "active"
        | "stock"
      whatsapp_number_usage: "marketing" | "utility" | "both"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "viewer"],
      audience_row_usage: ["unused", "reserved", "scheduled", "used"],
      audience_row_validation: ["valid", "invalid", "duplicate"],
      automation_trigger: [
        "button_click",
        "inbound_keyword",
        "inbound_any",
        "follow_up_sent",
        "time_no_inbound",
        "time_in_stage",
        "conversation_assigned",
        "conversation_claimed_self",
      ],
      campaign_recipient_status: [
        "pending",
        "scheduled",
        "sending",
        "sent",
        "failed",
        "replied",
      ],
      campaign_recurrence: ["none", "daily", "weekly", "monthly"],
      campaign_status: [
        "draft",
        "running",
        "paused",
        "completed",
        "failed",
        "scheduled",
        "cancelled",
      ],
      form_type: ["qualification", "seller_leads", "demo_request", "bm_access"],
      gupshup_mail_category: [
        "quality_drop",
        "restriction",
        "block",
        "template_rejected",
        "template_approved",
        "billing",
        "account_review",
        "other",
        "number_approved",
        "display_name_approved",
        "display_name_rejected",
        "waba_restricted",
        "waba_blocked",
        "quality_changed",
        "tier_upgraded",
        "waba_status_other",
        "dropped",
      ],
      gupshup_mail_severity: ["info", "warning", "critical"],
      message_direction: ["inbound", "outbound"],
      message_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "deleted",
      ],
      roadmap_status: ["idea", "planned", "in_progress", "shipped"],
      stage_type: ["open", "won", "lost"],
      submission_status: [
        "new",
        "contacted",
        "converted",
        "rejected",
        "qualified",
        "not_qualified",
        "in_progress",
        "meeting_booked",
        "started",
      ],
      template_category: ["marketing", "utility", "authentication"],
      whatsapp_number_status: [
        "draft",
        "ready",
        "warming",
        "restricted",
        "banned",
        "inactive",
        "active",
        "stock",
      ],
      whatsapp_number_usage: ["marketing", "utility", "both"],
    },
  },
} as const
