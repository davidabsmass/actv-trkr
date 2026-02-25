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
          client_id: string
          created_at: string
          date: string
          details: Json | null
          dismissed: boolean
          id: string
          severity: string
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          date: string
          details?: Json | null
          dismissed?: boolean
          id?: string
          severity?: string
          title: string
        }
        Update: {
          client_id?: string
          created_at?: string
          date?: string
          details?: Json | null
          dismissed?: boolean
          id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          api_key: string
          created_at: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          api_key?: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      forecasts: {
        Row: {
          client_id: string
          horizon_days: number
          id: string
          metric: string
          model_info: Json | null
          points: Json
          run_at: string
          start_date: string
        }
        Insert: {
          client_id: string
          horizon_days?: number
          id?: string
          metric: string
          model_info?: Json | null
          points?: Json
          run_at?: string
          start_date: string
        }
        Update: {
          client_id?: string
          horizon_days?: number
          id?: string
          metric?: string
          model_info?: Json | null
          points?: Json
          run_at?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_daily: {
        Row: {
          client_id: string
          date: string
          dimension: string | null
          id: string
          metric: string
          updated_at: string
          value: number
        }
        Insert: {
          client_id: string
          date: string
          dimension?: string | null
          id?: string
          metric: string
          updated_at?: string
          value?: number
        }
        Update: {
          client_id?: string
          date?: string
          dimension?: string | null
          id?: string
          metric?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          client_id: string
          created_at: string
          fields: Json | null
          form_id: string | null
          form_title: string | null
          id: string
          page_path: string | null
          page_url: string | null
          raw_payload: Json | null
          referrer: string | null
          session_id: string | null
          source_id: string | null
          submitted_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          fields?: Json | null
          form_id?: string | null
          form_title?: string | null
          id?: string
          page_path?: string | null
          page_url?: string | null
          raw_payload?: Json | null
          referrer?: string | null
          session_id?: string | null
          source_id?: string | null
          submitted_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          fields?: Json | null
          form_id?: string | null
          form_title?: string | null
          id?: string
          page_path?: string | null
          page_url?: string | null
          raw_payload?: Json | null
          referrer?: string | null
          session_id?: string | null
          source_id?: string | null
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
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      pageviews: {
        Row: {
          client_id: string
          created_at: string
          device: string | null
          event_id: string | null
          id: string
          ip_hash: string | null
          occurred_at: string
          page_path: string | null
          page_url: string | null
          raw_payload: Json | null
          referrer: string | null
          referrer_domain: string | null
          session_id: string | null
          source_id: string | null
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
          client_id: string
          created_at?: string
          device?: string | null
          event_id?: string | null
          id?: string
          ip_hash?: string | null
          occurred_at: string
          page_path?: string | null
          page_url?: string | null
          raw_payload?: Json | null
          referrer?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          source_id?: string | null
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
          client_id?: string
          created_at?: string
          device?: string | null
          event_id?: string | null
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          page_path?: string | null
          page_url?: string | null
          raw_payload?: Json | null
          referrer?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          source_id?: string | null
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
            foreignKeyName: "pageviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pageviews_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
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
      sessions: {
        Row: {
          client_id: string
          created_at: string
          ended_at: string
          id: string
          landing_page_path: string | null
          landing_referrer_domain: string | null
          pageview_count: number
          session_id: string
          source_id: string | null
          started_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          ended_at: string
          id?: string
          landing_page_path?: string | null
          landing_referrer_domain?: string | null
          pageview_count?: number
          session_id: string
          source_id?: string | null
          started_at: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          ended_at?: string
          id?: string
          landing_page_path?: string | null
          landing_referrer_domain?: string | null
          pageview_count?: number
          session_id?: string
          source_id?: string | null
          started_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          client_id: string
          created_at: string
          domain: string
          id: string
          plugin_version: string | null
          site_id: string | null
          source_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          domain: string
          id?: string
          plugin_version?: string | null
          site_id?: string | null
          source_type?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          domain?: string
          id?: string
          plugin_version?: string | null
          site_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_daily: {
        Row: {
          client_id: string
          date: string
          dimension: string | null
          id: string
          metric: string
          updated_at: string
          value: number
        }
        Insert: {
          client_id: string
          date: string
          dimension?: string | null
          id?: string
          metric: string
          updated_at?: string
          value?: number
        }
        Update: {
          client_id?: string
          date?: string
          dimension?: string | null
          id?: string
          metric?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "traffic_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      upsert_session: {
        Args: {
          p_client_id: string
          p_occurred_at: string
          p_page_path: string
          p_referrer_domain: string
          p_session_id: string
          p_source_id: string
          p_utm_campaign: string
          p_utm_medium: string
          p_utm_source: string
          p_visitor_id: string
        }
        Returns: undefined
      }
      validate_api_key: { Args: { key: string }; Returns: string }
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
