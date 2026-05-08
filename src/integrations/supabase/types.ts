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
          auto_allocated: boolean
          created_at: string
          delay_max_seconds: number
          delay_min_seconds: number
          failed_count: number
          id: string
          name: string
          parent_campaign_id: string | null
          per_number_quota: number
          recurrence: Database["public"]["Enums"]["campaign_recurrence"]
          recurrence_end_at: string | null
          scheduled_start_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          total_recipients: number
          updated_at: string
          user_id: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          auto_allocated?: boolean
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          failed_count?: number
          id?: string
          name: string
          parent_campaign_id?: string | null
          per_number_quota?: number
          recurrence?: Database["public"]["Enums"]["campaign_recurrence"]
          recurrence_end_at?: string | null
          scheduled_start_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          user_id: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          auto_allocated?: boolean
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          failed_count?: number
          id?: string
          name?: string
          parent_campaign_id?: string | null
          per_number_quota?: number
          recurrence?: Database["public"]["Enums"]["campaign_recurrence"]
          recurrence_end_at?: string | null
          scheduled_start_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
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
      conversations: {
        Row: {
          contact_name: string | null
          contact_phone: string
          created_at: string
          id: string
          is_starred: boolean
          last_message_at: string | null
          last_message_text: string | null
          pinned_at: string | null
          unread_count: number
          updated_at: string
          user_id: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          id?: string
          is_starred?: boolean
          last_message_at?: string | null
          last_message_text?: string | null
          pinned_at?: string | null
          unread_count?: number
          updated_at?: string
          user_id: string
          whatsapp_number_id: string
          workspace_id: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          id?: string
          is_starred?: boolean
          last_message_at?: string | null
          last_message_text?: string | null
          pinned_at?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string
          whatsapp_number_id?: string
          workspace_id?: string
        }
        Relationships: [
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
      message_templates: {
        Row: {
          body: string | null
          buttons: Json
          category: Database["public"]["Enums"]["template_category"]
          created_at: string
          external_id: string | null
          id: string
          language: string
          name: string
          namespace: string | null
          provider_template_id: string | null
          quality: string | null
          raw: Json | null
          status: string
          synced_at: string | null
          updated_at: string
          user_id: string
          variables: Json
          whatsapp_number_id: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          buttons?: Json
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          external_id?: string | null
          id?: string
          language?: string
          name: string
          namespace?: string | null
          provider_template_id?: string | null
          quality?: string | null
          raw?: Json | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          user_id: string
          variables?: Json
          whatsapp_number_id?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          buttons?: Json
          category?: Database["public"]["Enums"]["template_category"]
          created_at?: string
          external_id?: string | null
          id?: string
          language?: string
          name?: string
          namespace?: string | null
          provider_template_id?: string | null
          quality?: string | null
          raw?: Json | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          user_id?: string
          variables?: Json
          whatsapp_number_id?: string | null
          workspace_id?: string
        }
        Relationships: [
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
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
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
          position?: number
          stage_type?: Database["public"]["Enums"]["stage_type"]
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
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
      stage_automations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          target_stage_id: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_value: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          target_stage_id: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          trigger_value?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          target_stage_id?: string
          trigger?: Database["public"]["Enums"]["automation_trigger"]
          trigger_value?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_automations_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
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
          connected_in_gupshup: boolean
          connected_in_iskra: boolean
          country_code: string | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          is_warming: boolean
          label: string | null
          messaging_limit: string | null
          notes: string | null
          partner_source: string | null
          phone_number: string
          profile_avatar: string | null
          provided_by: string | null
          provider: string
          provider_api_key: string | null
          provider_app_id: string | null
          provider_waba_id: string | null
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
          connected_in_gupshup?: boolean
          connected_in_iskra?: boolean
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          is_warming?: boolean
          label?: string | null
          messaging_limit?: string | null
          notes?: string | null
          partner_source?: string | null
          phone_number: string
          profile_avatar?: string | null
          provided_by?: string | null
          provider?: string
          provider_api_key?: string | null
          provider_app_id?: string | null
          provider_waba_id?: string | null
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
          connected_in_gupshup?: boolean
          connected_in_iskra?: boolean
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          is_warming?: boolean
          label?: string | null
          messaging_limit?: string | null
          notes?: string | null
          partner_source?: string | null
          phone_number?: string
          profile_avatar?: string | null
          provided_by?: string | null
          provider?: string
          provider_api_key?: string | null
          provider_app_id?: string | null
          provider_waba_id?: string | null
          restricted_at?: string | null
          status?: Database["public"]["Enums"]["whatsapp_number_status"]
          unrestricted_at?: string | null
          updated_at?: string
          usage_type?: Database["public"]["Enums"]["whatsapp_number_usage"]
          user_id?: string
          webhook_connected?: boolean
          workspace_id?: string | null
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
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      workspace_saved_replies: {
        Row: {
          body: string
          created_at: string
          folder: string | null
          id: string
          is_favorite: boolean
          last_used_at: string | null
          position: number
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
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          owner_user_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_deal_for_conversation: {
        Args: { _conversation_id: string }
        Returns: string
      }
      ensure_pipeline_stage: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "viewer"
      automation_trigger: "button_click" | "inbound_keyword" | "inbound_any"
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
      form_type: "qualification" | "seller_leads" | "demo_request" | "bm_access"
      message_direction: "inbound" | "outbound"
      message_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "deleted"
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
      automation_trigger: ["button_click", "inbound_keyword", "inbound_any"],
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
      ],
      form_type: ["qualification", "seller_leads", "demo_request", "bm_access"],
      message_direction: ["inbound", "outbound"],
      message_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "deleted",
      ],
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
      ],
      whatsapp_number_usage: ["marketing", "utility", "both"],
    },
  },
} as const
