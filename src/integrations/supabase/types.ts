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
      ad_spend: {
        Row: {
          created_at: string
          id: string
          month: string
          org_id: string
          site_id: string
          source: string
          spend: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          org_id: string
          site_id: string
          source: string
          spend?: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          org_id?: string
          site_id?: string
          source?: string
          spend?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_spend_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_spend_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
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
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      archive_manifest: {
        Row: {
          archived_at: string
          checksum: string | null
          end_date: string
          file_format: string
          id: string
          object_path: string
          org_id: string
          row_count: number
          size_bytes: number
          start_date: string
          table_name: string
        }
        Insert: {
          archived_at?: string
          checksum?: string | null
          end_date: string
          file_format?: string
          id?: string
          object_path: string
          org_id: string
          row_count?: number
          size_bytes?: number
          start_date: string
          table_name: string
        }
        Update: {
          archived_at?: string
          checksum?: string | null
          end_date?: string
          file_format?: string
          id?: string
          object_path?: string
          org_id?: string
          row_count?: number
          size_bytes?: number
          start_date?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_manifest_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      broken_links: {
        Row: {
          broken_url: string
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrences: number
          org_id: string
          site_id: string
          source_page: string
          status_code: number | null
        }
        Insert: {
          broken_url: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          org_id: string
          site_id: string
          source_page: string
          status_code?: number | null
        }
        Update: {
          broken_url?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          org_id?: string
          site_id?: string
          source_page?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "broken_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broken_links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      conversions_daily: {
        Row: {
          conversion_rate: number
          day: string
          form_id: string | null
          id: string
          org_id: string
          page_url: string | null
          pageviews: number
          site_id: string
          submissions: number
        }
        Insert: {
          conversion_rate?: number
          day: string
          form_id?: string | null
          id?: string
          org_id: string
          page_url?: string | null
          pageviews?: number
          site_id: string
          submissions?: number
        }
        Update: {
          conversion_rate?: number
          day?: string
          form_id?: string | null
          id?: string
          org_id?: string
          page_url?: string | null
          pageviews?: number
          site_id?: string
          submissions?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversions_daily_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversions_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversions_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_snapshots: {
        Row: {
          created_at: string
          created_by: string
          date_range_end: string
          date_range_start: string
          expires_at: string
          id: string
          org_id: string
          snapshot_data: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          date_range_end: string
          date_range_start: string
          expires_at: string
          id?: string
          org_id: string
          snapshot_data?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          date_range_end?: string
          date_range_start?: string
          expires_at?: string
          id?: string
          org_id?: string
          snapshot_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_audit: {
        Row: {
          action: string
          details: Json | null
          executed_at: string
          id: string
          org_id: string
        }
        Insert: {
          action: string
          details?: Json | null
          executed_at?: string
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          details?: Json | null
          executed_at?: string
          id?: string
          org_id?: string
        }
        Relationships: []
      }
      domain_health: {
        Row: {
          days_to_domain_expiry: number | null
          domain: string
          domain_expiry_date: string | null
          id: string
          last_checked_at: string
          org_id: string
          site_id: string
          source: string
        }
        Insert: {
          days_to_domain_expiry?: number | null
          domain: string
          domain_expiry_date?: string | null
          id?: string
          last_checked_at?: string
          org_id: string
          site_id: string
          source?: string
        }
        Update: {
          days_to_domain_expiry?: number | null
          domain?: string
          domain_expiry_date?: string | null
          id?: string
          last_checked_at?: string
          org_id?: string
          site_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_health_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_health_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          event_type: string
          id: string
          meta: Json | null
          occurred_at: string
          org_id: string
          page_path: string | null
          page_url: string | null
          session_id: string | null
          site_id: string
          target_text: string | null
          visitor_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          org_id: string
          page_path?: string | null
          page_url?: string | null
          session_id?: string | null
          site_id: string
          target_text?: string | null
          visitor_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          org_id?: string
          page_path?: string | null
          page_url?: string | null
          session_id?: string | null
          site_id?: string
          target_text?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          end_date: string | null
          error: string | null
          file_path: string | null
          filters_json: Json | null
          format: string
          id: string
          org_id: string
          output_size_bytes: number | null
          request_type: string
          row_count: number | null
          saved_view_id: string | null
          start_date: string | null
          status: string
          table_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          end_date?: string | null
          error?: string | null
          file_path?: string | null
          filters_json?: Json | null
          format?: string
          id?: string
          org_id: string
          output_size_bytes?: number | null
          request_type?: string
          row_count?: number | null
          saved_view_id?: string | null
          start_date?: string | null
          status?: string
          table_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          error?: string | null
          file_path?: string | null
          filters_json?: Json | null
          format?: string
          id?: string
          org_id?: string
          output_size_bytes?: number | null
          request_type?: string
          row_count?: number | null
          saved_view_id?: string | null
          start_date?: string | null
          status?: string
          table_name?: string | null
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
      form_submission_logs: {
        Row: {
          error_message: string | null
          form_id: string | null
          id: string
          meta: Json | null
          occurred_at: string
          org_id: string
          page_url: string | null
          site_id: string
          status: string
        }
        Insert: {
          error_message?: string | null
          form_id?: string | null
          id?: string
          meta?: Json | null
          occurred_at?: string
          org_id: string
          page_url?: string | null
          site_id: string
          status?: string
        }
        Update: {
          error_message?: string | null
          form_id?: string | null
          id?: string
          meta?: Json | null
          occurred_at?: string
          org_id?: string
          page_url?: string | null
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submission_logs_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submission_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submission_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          archived: boolean
          created_at: string
          estimated_value: number | null
          external_form_id: string
          form_category: string
          id: string
          is_primary_lead: boolean
          lead_weight: number
          name: string
          org_id: string
          provider: string
          site_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          estimated_value?: number | null
          external_form_id: string
          form_category?: string
          id?: string
          is_primary_lead?: boolean
          lead_weight?: number
          name?: string
          org_id: string
          provider?: string
          site_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          estimated_value?: number | null
          external_form_id?: string
          form_category?: string
          id?: string
          is_primary_lead?: boolean
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
      incidents: {
        Row: {
          details: Json | null
          id: string
          last_seen_at: string
          org_id: string
          resolved_at: string | null
          severity: string
          site_id: string
          started_at: string
          type: string
        }
        Insert: {
          details?: Json | null
          id?: string
          last_seen_at?: string
          org_id: string
          resolved_at?: string | null
          severity?: string
          site_id: string
          started_at?: string
          type: string
        }
        Update: {
          details?: Json | null
          id?: string
          last_seen_at?: string
          org_id?: string
          resolved_at?: string | null
          severity?: string
          site_id?: string
          started_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          org_id: string
          use_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          org_id: string
          use_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          org_id?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_org_id_fkey"
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
          engagement_score: number | null
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
          engagement_score?: number | null
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
          engagement_score?: number | null
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
      monitoring_alerts: {
        Row: {
          alert_type: string
          created_at: string
          error: string | null
          id: string
          incident_id: string | null
          message: string
          org_id: string
          sent_at: string | null
          severity: string
          site_id: string
          status: string
          subject: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          error?: string | null
          id?: string
          incident_id?: string | null
          message?: string
          org_id: string
          sent_at?: string | null
          severity?: string
          site_id: string
          status?: string
          subject: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          error?: string | null
          id?: string
          incident_id?: string | null
          message?: string
          org_id?: string
          sent_at?: string | null
          severity?: string
          site_id?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_alerts_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_aggregates: {
        Row: {
          dimension: string | null
          id: string
          metric: string
          month: string
          org_id: string
          value: number
        }
        Insert: {
          dimension?: string | null
          id?: string
          metric: string
          month: string
          org_id: string
          value?: number
        }
        Update: {
          dimension?: string | null
          id?: string
          metric?: string
          month?: string
          org_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_aggregates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_inbox: {
        Row: {
          alert_id: string | null
          body: string
          created_at: string
          id: string
          is_read: boolean
          site_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          site_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          alert_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          site_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_inbox_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "monitoring_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_inbox_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_responses: {
        Row: {
          completed_at: string
          id: string
          notification_prefs_json: Json
          org_id: string
          primary_focus: string
          raw_answers_json: Json
          selected_forms_json: Json
          user_id: string | null
        }
        Insert: {
          completed_at?: string
          id?: string
          notification_prefs_json?: Json
          org_id: string
          primary_focus: string
          raw_answers_json?: Json
          selected_forms_json?: Json
          user_id?: string | null
        }
        Update: {
          completed_at?: string
          id?: string
          notification_prefs_json?: Json
          org_id?: string
          primary_focus?: string
          raw_answers_json?: Json
          selected_forms_json?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
          active_seconds: number | null
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
          active_seconds?: number | null
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
          active_seconds?: number | null
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
      renewals: {
        Row: {
          auto_renew: boolean
          created_at: string
          id: string
          is_enabled: boolean
          notes: string | null
          notify_emails: Json | null
          org_id: string
          provider_name: string | null
          renewal_date: string | null
          site_id: string
          type: string
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          notify_emails?: Json | null
          org_id: string
          provider_name?: string | null
          renewal_date?: string | null
          site_id: string
          type?: string
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          notify_emails?: Json | null
          org_id?: string
          provider_name?: string | null
          renewal_date?: string | null
          site_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
          run_day_of_month: number
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
          run_day_of_month?: number
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
          run_day_of_month?: number
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
      site_heartbeats: {
        Row: {
          id: string
          meta: Json | null
          received_at: string
          site_id: string
          source: string
        }
        Insert: {
          id?: string
          meta?: Json | null
          received_at?: string
          site_id: string
          source?: string
        }
        Update: {
          id?: string
          meta?: Json | null
          received_at?: string
          site_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_heartbeats_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_notification_rules: {
        Row: {
          alert_type: string
          channel: string
          id: string
          is_enabled: boolean
          org_id: string
          site_id: string
          threshold_json: Json | null
        }
        Insert: {
          alert_type: string
          channel?: string
          id?: string
          is_enabled?: boolean
          org_id: string
          site_id: string
          threshold_json?: Json | null
        }
        Update: {
          alert_type?: string
          channel?: string
          id?: string
          is_enabled?: boolean
          org_id?: string
          site_id?: string
          threshold_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "site_notification_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_notification_rules_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          archive_enabled: boolean
          archive_format: string
          created_at: string
          id: string
          notification_preferences: Json
          onboarding_completed: boolean
          org_id: string
          primary_focus: string
          primary_goal: string
          raw_retention_days: number
          updated_at: string
        }
        Insert: {
          archive_enabled?: boolean
          archive_format?: string
          created_at?: string
          id?: string
          notification_preferences?: Json
          onboarding_completed?: boolean
          org_id: string
          primary_focus?: string
          primary_goal?: string
          raw_retention_days?: number
          updated_at?: string
        }
        Update: {
          archive_enabled?: boolean
          archive_format?: string
          created_at?: string
          id?: string
          notification_preferences?: Json
          onboarding_completed?: boolean
          org_id?: string
          primary_focus?: string
          primary_goal?: string
          raw_retention_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          created_at: string
          domain: string
          down_after_minutes: number
          heartbeat_interval_minutes: number
          id: string
          last_heartbeat_at: string | null
          name: string | null
          org_id: string
          plan_tier: string
          plugin_version: string | null
          status: string
          type: string
          url: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          down_after_minutes?: number
          heartbeat_interval_minutes?: number
          id?: string
          last_heartbeat_at?: string | null
          name?: string | null
          org_id: string
          plan_tier?: string
          plugin_version?: string | null
          status?: string
          type?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          down_after_minutes?: number
          heartbeat_interval_minutes?: number
          id?: string
          last_heartbeat_at?: string | null
          name?: string | null
          org_id?: string
          plan_tier?: string
          plugin_version?: string | null
          status?: string
          type?: string
          url?: string | null
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
      ssl_health: {
        Row: {
          days_to_ssl_expiry: number | null
          id: string
          issuer: string | null
          last_checked_at: string
          org_id: string
          site_id: string
          ssl_expiry_date: string | null
        }
        Insert: {
          days_to_ssl_expiry?: number | null
          id?: string
          issuer?: string | null
          last_checked_at?: string
          org_id: string
          site_id: string
          ssl_expiry_date?: string | null
        }
        Update: {
          days_to_ssl_expiry?: number | null
          id?: string
          issuer?: string | null
          last_checked_at?: string
          org_id?: string
          site_id?: string
          ssl_expiry_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ssl_health_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssl_health_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_status: {
        Row: {
          canceled_at: string | null
          created_at: string
          grace_end_at: string | null
          id: string
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          grace_end_at?: string | null
          id?: string
          org_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          grace_end_at?: string | null
          id?: string
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
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
      user_input_events: {
        Row: {
          created_at: string
          event_payload: Json
          event_type: string
          id: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_payload?: Json
          event_type: string
          id?: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_payload?: Json
          event_type?: string
          id?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_input_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          channel: string
          id: string
          is_enabled: boolean
          phone: string | null
          user_id: string
        }
        Insert: {
          channel?: string
          id?: string
          is_enabled?: boolean
          phone?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          is_enabled?: boolean
          phone?: string | null
          user_id?: string
        }
        Relationships: []
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
      user_site_subscriptions: {
        Row: {
          alert_type: string
          channel: string
          id: string
          is_enabled: boolean
          site_id: string
          user_id: string
        }
        Insert: {
          alert_type: string
          channel?: string
          id?: string
          is_enabled?: boolean
          site_id: string
          user_id: string
        }
        Update: {
          alert_type?: string
          channel?: string
          id?: string
          is_enabled?: boolean
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_site_subscriptions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_summaries: {
        Row: {
          conversion_anomalies: Json | null
          created_at: string
          id: string
          leads_change: number | null
          org_id: string
          risk_alert: string | null
          sessions_change: number | null
          site_id: string
          summary_text: string
          top_opportunity: string | null
          week_start: string
        }
        Insert: {
          conversion_anomalies?: Json | null
          created_at?: string
          id?: string
          leads_change?: number | null
          org_id: string
          risk_alert?: string | null
          sessions_change?: number | null
          site_id: string
          summary_text: string
          top_opportunity?: string | null
          week_start: string
        }
        Update: {
          conversion_anomalies?: Json | null
          created_at?: string
          id?: string
          leads_change?: number | null
          org_id?: string
          risk_alert?: string | null
          sessions_change?: number | null
          site_id?: string
          summary_text?: string
          top_opportunity?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_summaries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_summaries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_engagement_score: {
        Args: { p_org_id: string; p_session_id: string }
        Returns: number
      }
      call_edge_function: {
        Args: { body?: Json; function_name: string }
        Returns: undefined
      }
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
