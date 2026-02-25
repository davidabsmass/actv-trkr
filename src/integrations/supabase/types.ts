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
      alerts: {
        Row: {
          created_at: string
          date: string
          details: Json | null
          id: string
          org_id: string
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          date: string
          details?: Json | null
          id?: string
          org_id: string
          severity?: string
          title: string
        }
        Update: {
          created_at?: string
          date?: string
          details?: Json | null
          id?: string
          org_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          label: string
          org_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          label?: string
          org_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          label?: string
          org_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          error: string | null
          file_path: string | null
          format: string
          id: string
          org_id: string
          row_count: number | null
          saved_view_id: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          error?: string | null
          file_path?: string | null
          format?: string
          id?: string
          org_id: string
          row_count?: number | null
          saved_view_id?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          file_path?: string | null
          format?: string
          id?: string
          org_id?: string
          row_count?: number | null
          saved_view_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_saved_view_id_fkey"
            columns: ["saved_view_id"]
            isOneToOne: false
            referencedRelation: "saved_views"
            referencedColumns: ["id"]
          },
        ]
      }
      field_mappings: {
        Row: {
          external_field_id: string
          external_field_label: string | null
          field_type: string | null
          form_id: string
          id: string
          mapped_to: string
          org_id: string
          required: boolean | null
          transform: Json | null
        }
        Insert: {
          external_field_id: string
          external_field_label?: string | null
          field_type?: string | null
          form_id: string
          id?: string
          mapped_to: string
          org_id: string
          required?: boolean | null
          transform?: Json | null
        }
        Update: {
          external_field_id?: string
          external_field_label?: string | null
          field_type?: string | null
          form_id?: string
          id?: string
          mapped_to?: string
          org_id?: string
          required?: boolean | null
          transform?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "field_mappings_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          external_form_id: string
          form_category: string
          id: string
          lead_weight: number
          name: string
          org_id: string
          provider: string
          site_id: string
        }
        Insert: {
          created_at?: string
          external_form_id: string
          form_category?: string
          id?: string
          lead_weight?: number
          name?: string
          org_id: string
          provider?: string
          site_id: string
        }
        Update: {
          created_at?: string
          external_form_id?: string
          form_category?: string
          id?: string
          lead_weight?: number
          name?: string
          org_id?: string
          provider?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          id: string
          month: string
          org_id: string
          target_leads: number
        }
        Insert: {
          id?: string
          month: string
          org_id: string
          target_leads: number
        }
        Update: {
          id?: string
          month?: string
          org_id?: string
          target_leads?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_daily: {
        Row: {
          date: string
          dimension: string | null
          id: string
          metric: string
          org_id: string
          value: number
        }
        Insert: {
          date: string
          dimension?: string | null
          id?: string
          metric: string
          org_id: string
          value?: number
        }
        Update: {
          date?: string
          dimension?: string | null
          id?: string
          metric?: string
          org_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events_raw: {
        Row: {
          context: Json | null
          external_entry_id: string
          form_id: string
          id: string
          org_id: string
          payload: Json | null
          received_at: string
          session_id: string | null
          site_id: string
          submitted_at: string | null
          visitor_id: string | null
        }
        Insert: {
          context?: Json | null
          external_entry_id: string
          form_id: string
          id?: string
          org_id: string
          payload?: Json | null
          received_at?: string
          session_id?: string | null
          site_id: string
          submitted_at?: string | null
          visitor_id?: string | null
        }
        Update: {
          context?: Json | null
          external_entry_id?: string
          form_id?: string
          id?: string
          org_id?: string
          payload?: Json | null
          received_at?: string
          session_id?: string | null
          site_id?: string
          submitted_at?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_raw_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_raw_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_raw_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_fields_flat: {
        Row: {
          created_at: string
          field_key: string
          field_label: string | null
          field_type: string | null
          id: string
          lead_id: string
          org_id: string
          value_bool: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          field_key: string
          field_label?: string | null
          field_type?: string | null
          id?: string
          lead_id: string
          org_id: string
          value_bool?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          field_key?: string
          field_label?: string | null
          field_type?: string | null
          id?: string
          lead_id?: string
          org_id?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_fields_flat_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_fields_flat_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          campaign: string | null
          created_at: string
          data: Json | null
          form_id: string
          id: string
          lead_score: number | null
          lead_type: string | null
          location: string | null
          medium: string | null
          org_id: string
          page_path: string | null
          page_url: string | null
          physician: string | null
          referrer: string | null
          referrer_domain: string | null
          service: string | null
          session_id: string | null
          site_id: string
          source: string | null
          status: string
          submitted_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          data?: Json | null
          form_id: string
          id?: string
          lead_score?: number | null
          lead_type?: string | null
          location?: string | null
          medium?: string | null
          org_id: string
          page_path?: string | null
          page_url?: string | null
          physician?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          service?: string | null
          session_id?: string | null
          site_id: string
          source?: string | null
          status?: string
          submitted_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          campaign?: string | null
          created_at?: string
          data?: Json | null
          form_id?: string
          id?: string
          lead_score?: number | null
          lead_type?: string | null
          location?: string | null
          medium?: string | null
          org_id?: string
          page_path?: string | null
          page_url?: string | null
          physician?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          service?: string | null
          session_id?: string | null
          site_id?: string
          source?: string | null
          status?: string
          submitted_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      org_users: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      pageviews: {
        Row: {
          country_code: string | null
          country_name: string | null
          device: string | null
          event_id: string
          id: string
          ip_hash: string | null
          occurred_at: string
          org_id: string
          page_path: string | null
          page_url: string | null
          referrer: string | null
          referrer_domain: string | null
          session_id: string | null
          site_id: string
          title: string | null
          user_agent_hash: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          country_code?: string | null
          country_name?: string | null
          device?: string | null
          event_id: string
          id?: string
          ip_hash?: string | null
          occurred_at: string
          org_id: string
          page_path?: string | null
          page_url?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          site_id: string
          title?: string | null
          user_agent_hash?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          country_code?: string | null
          country_name?: string | null
          device?: string | null
          event_id?: string
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          org_id?: string
          page_path?: string | null
          page_url?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          site_id?: string
          title?: string | null
          user_agent_hash?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pageviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pageviews_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          error: string | null
          file_path: string | null
          id: string
          org_id: string
          params: Json | null
          status: string
          template_slug: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          error?: string | null
          file_path?: string | null
          id?: string
          org_id: string
          params?: Json | null
          status?: string
          template_slug: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          file_path?: string | null
          id?: string
          org_id?: string
          params?: Json | null
          status?: string
          template_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_runs_template_slug_fkey"
            columns: ["template_slug"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["slug"]
          },
        ]
      }
      report_schedules: {
        Row: {
          enabled: boolean
          format: string
          frequency: string
          id: string
          last_run_at: string | null
          next_run_at: string | null
          org_id: string
          params: Json | null
          recipients: Json | null
          run_at_local_time: string
          template_slug: string
          timezone: string
        }
        Insert: {
          enabled?: boolean
          format?: string
          frequency: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          org_id: string
          params?: Json | null
          recipients?: Json | null
          run_at_local_time?: string
          template_slug: string
          timezone?: string
        }
        Update: {
          enabled?: boolean
          format?: string
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          org_id?: string
          params?: Json | null
          recipients?: Json | null
          run_at_local_time?: string
          template_slug?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_template_slug_fkey"
            columns: ["template_slug"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["slug"]
          },
        ]
      }
      report_templates: {
        Row: {
          default_params: Json | null
          name: string
          slug: string
        }
        Insert: {
          default_params?: Json | null
          name: string
          slug: string
        }
        Update: {
          default_params?: Json | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          columns: Json | null
          created_at: string
          created_by: string
          filters: Json | null
          form_id: string | null
          id: string
          name: string
          org_id: string
          sort: Json | null
        }
        Insert: {
          columns?: Json | null
          created_at?: string
          created_by: string
          filters?: Json | null
          form_id?: string | null
          id?: string
          name: string
          org_id: string
          sort?: Json | null
        }
        Update: {
          columns?: Json | null
          created_at?: string
          created_by?: string
          filters?: Json | null
          form_id?: string | null
          id?: string
          name?: string
          org_id?: string
          sort?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          ended_at: string
          id: string
          landing_page_path: string | null
          landing_referrer_domain: string | null
          org_id: string
          session_id: string
          site_id: string
          started_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Insert: {
          ended_at: string
          id?: string
          landing_page_path?: string | null
          landing_referrer_domain?: string | null
          org_id: string
          session_id: string
          site_id: string
          started_at: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Update: {
          ended_at?: string
          id?: string
          landing_page_path?: string | null
          landing_referrer_domain?: string | null
          org_id?: string
          session_id?: string
          site_id?: string
          started_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          created_at: string
          domain: string
          id: string
          org_id: string
          plugin_version: string | null
          type: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          org_id: string
          plugin_version?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          org_id?: string
          plugin_version?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_daily: {
        Row: {
          date: string
          dimension: string | null
          id: string
          metric: string
          org_id: string
          value: number
        }
        Insert: {
          date: string
          dimension?: string | null
          id?: string
          metric: string
          org_id: string
          value?: number
        }
        Update: {
          date?: string
          dimension?: string | null
          id?: string
          metric?: string
          org_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "traffic_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      url_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          maps_to: string
          org_id: string
          pattern: string
          priority: number
          rule_type: string
          value: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          maps_to: string
          org_id: string
          pattern: string
          priority?: number
          rule_type: string
          value: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          maps_to?: string
          org_id?: string
          pattern?: string
          priority?: number
          rule_type?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "url_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      upsert_session: {
        Args: {
          p_occurred_at: string
          p_org_id: string
          p_page_path: string
          p_referrer_domain: string
          p_session_id: string
          p_site_id: string
          p_utm_campaign: string
          p_utm_medium: string
          p_utm_source: string
          p_visitor_id: string
        }
        Returns: undefined
      }
      user_org_role: { Args: { _org_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
