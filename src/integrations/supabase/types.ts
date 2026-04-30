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
      acquisition_anomalies: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          context: Json
          created_at: string
          delta_pct: number | null
          description: string | null
          detected_at: string
          id: string
          linked_customer_id: string | null
          linked_org_id: string | null
          metric_value: number | null
          notified_at: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          rule_key: string
          severity: string
          status: string
          threshold_value: number | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          context?: Json
          created_at?: string
          delta_pct?: number | null
          description?: string | null
          detected_at?: string
          id?: string
          linked_customer_id?: string | null
          linked_org_id?: string | null
          metric_value?: number | null
          notified_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          rule_key: string
          severity: string
          status?: string
          threshold_value?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          context?: Json
          created_at?: string
          delta_pct?: number | null
          description?: string | null
          detected_at?: string
          id?: string
          linked_customer_id?: string | null
          linked_org_id?: string | null
          metric_value?: number | null
          notified_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          rule_key?: string
          severity?: string
          status?: string
          threshold_value?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_anomalies_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "acquisition_anomaly_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      acquisition_anomaly_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          metric_category: string
          notify_email: boolean
          notify_in_app: boolean
          rule_key: string
          rule_name: string
          severity: string
          threshold_operator: string
          threshold_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metric_category: string
          notify_email?: boolean
          notify_in_app?: boolean
          rule_key: string
          rule_name: string
          severity?: string
          threshold_operator?: string
          threshold_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metric_category?: string
          notify_email?: boolean
          notify_in_app?: boolean
          rule_key?: string
          rule_name?: string
          severity?: string
          threshold_operator?: string
          threshold_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      acquisition_contract_flags: {
        Row: {
          contract_id: string | null
          created_at: string
          customer_id: string
          description: string | null
          flag_type: string
          id: string
          resolved: boolean
          severity: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          flag_type: string
          id?: string
          resolved?: boolean
          severity?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          flag_type?: string
          id?: string
          resolved?: boolean
          severity?: string
        }
        Relationships: []
      }
      acquisition_metric_snapshots: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          metric_date: string
          metric_key: string
          metric_name: string
          metric_value: number | null
          notes: string | null
          org_id: string | null
          plan: string | null
          segment: string | null
          site_id: string | null
          source_system: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          metric_date: string
          metric_key: string
          metric_name: string
          metric_value?: number | null
          notes?: string | null
          org_id?: string | null
          plan?: string | null
          segment?: string | null
          site_id?: string | null
          source_system?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          metric_date?: string
          metric_key?: string
          metric_name?: string
          metric_value?: number | null
          notes?: string | null
          org_id?: string | null
          plan?: string | null
          segment?: string | null
          site_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_metric_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      acquisition_risk_flags: {
        Row: {
          auto_generated: boolean
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          linked_customer_id: string | null
          linked_org_id: string | null
          linked_site_id: string | null
          linked_ticket_id: string | null
          linked_vendor_id: string | null
          mitigation_plan: string | null
          owner_user_id: string | null
          resolved_at: string | null
          risk_type: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_customer_id?: string | null
          linked_org_id?: string | null
          linked_site_id?: string | null
          linked_ticket_id?: string | null
          linked_vendor_id?: string | null
          mitigation_plan?: string | null
          owner_user_id?: string | null
          resolved_at?: string | null
          risk_type: string
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_customer_id?: string | null
          linked_org_id?: string | null
          linked_site_id?: string | null
          linked_ticket_id?: string | null
          linked_vendor_id?: string | null
          mitigation_plan?: string | null
          owner_user_id?: string | null
          resolved_at?: string | null
          risk_type?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_risk_flags_linked_org_id_fkey"
            columns: ["linked_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
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
      admin_digest_log: {
        Row: {
          digest_date: string
          digest_type: string
          id: string
          payload: Json | null
          recipient_email: string
          sent_at: string
        }
        Insert: {
          digest_date: string
          digest_type: string
          id?: string
          payload?: Json | null
          recipient_email: string
          sent_at?: string
        }
        Update: {
          digest_date?: string
          digest_type?: string
          id?: string
          payload?: Json | null
          recipient_email?: string
          sent_at?: string
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          author_email: string | null
          author_id: string | null
          body: string
          body_encrypted: string | null
          category: string
          created_at: string
          id: string
          org_id: string | null
          subscriber_email: string | null
          subscriber_id: string | null
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          body: string
          body_encrypted?: string | null
          category?: string
          created_at?: string
          id?: string
          org_id?: string | null
          subscriber_email?: string | null
          subscriber_id?: string | null
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          body?: string
          body_encrypted?: string | null
          category?: string
          created_at?: string
          id?: string
          org_id?: string | null
          subscriber_email?: string | null
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notes_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_step_up_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          ip_hash: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip_hash?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          cached: boolean
          created_at: string
          function_name: string
          id: string
          metrics_hash: string | null
          org_id: string
          response_cache: Json | null
        }
        Insert: {
          cached?: boolean
          created_at?: string
          function_name: string
          id?: string
          metrics_hash?: string | null
          org_id: string
          response_cache?: Json | null
        }
        Update: {
          cached?: boolean
          created_at?: string
          function_name?: string
          id?: string
          metrics_hash?: string | null
          org_id?: string
          response_cache?: Json | null
        }
        Relationships: []
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
          signing_secret: string
          site_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          label?: string
          org_id: string
          revoked_at?: string | null
          signing_secret?: string
          site_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          label?: string
          org_id?: string
          revoked_at?: string | null
          signing_secret?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      app_bible_reviews: {
        Row: {
          app_version: string
          id: string
          notes: string | null
          reviewed_at: string
          reviewed_by: string
          reviewer_email: string | null
          section_key: string
        }
        Insert: {
          app_version: string
          id?: string
          notes?: string | null
          reviewed_at?: string
          reviewed_by: string
          reviewer_email?: string | null
          section_key: string
        }
        Update: {
          app_version?: string
          id?: string
          notes?: string | null
          reviewed_at?: string
          reviewed_by?: string
          reviewer_email?: string | null
          section_key?: string
        }
        Relationships: []
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
      auth_email_change_pending: {
        Row: {
          applied_at: string | null
          cancel_token_hash: string
          cancelled_at: string | null
          created_at: string
          effective_at: string
          id: string
          ip_hash: string | null
          new_email: string
          old_email: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          cancel_token_hash: string
          cancelled_at?: string | null
          created_at?: string
          effective_at: string
          id?: string
          ip_hash?: string | null
          new_email: string
          old_email: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          cancel_token_hash?: string
          cancelled_at?: string | null
          created_at?: string
          effective_at?: string
          id?: string
          ip_hash?: string | null
          new_email?: string
          old_email?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_event_alerts: {
        Row: {
          created_at: string
          email_sent_at: string
          event_type: string
          geo_hint: string | null
          id: string
          ip_hash: string | null
          kill_token_consumed_at: string | null
          kill_token_expires_at: string | null
          kill_token_hash: string | null
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email_sent_at?: string
          event_type: string
          geo_hint?: string | null
          id?: string
          ip_hash?: string | null
          kill_token_consumed_at?: string | null
          kill_token_expires_at?: string | null
          kill_token_hash?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email_sent_at?: string
          event_type?: string
          geo_hint?: string | null
          id?: string
          ip_hash?: string | null
          kill_token_consumed_at?: string | null
          kill_token_expires_at?: string | null
          kill_token_hash?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_password_reset_log: {
        Row: {
          email: string
          id: string
          ip_hash: string | null
          requested_at: string
          user_agent: string | null
        }
        Insert: {
          email: string
          id?: string
          ip_hash?: string | null
          requested_at?: string
          user_agent?: string | null
        }
        Update: {
          email?: string
          id?: string
          ip_hash?: string | null
          requested_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      auth_recent_sessions: {
        Row: {
          device_fingerprint: string | null
          geo_hint: string | null
          id: string
          ip_hash: string | null
          last_seen_at: string
          revoke_reason: string | null
          revoked_at: string | null
          signed_in_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_fingerprint?: string | null
          geo_hint?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          signed_in_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_fingerprint?: string | null
          geo_hint?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          signed_in_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_trusted_devices: {
        Row: {
          created_at: string
          device_token_hash: string
          expires_at: string
          id: string
          ip_hash: string | null
          label: string | null
          last_used_at: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_token_hash: string
          expires_at: string
          id?: string
          ip_hash?: string | null
          label?: string | null
          last_used_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_token_hash?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          label?: string | null
          last_used_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backup_health: {
        Row: {
          id: string
          last_backup_at: string | null
          last_restore_test_at: string | null
          metadata: Json
          org_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          last_backup_at?: string | null
          last_restore_test_at?: string | null
          metadata?: Json
          org_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          last_backup_at?: string | null
          last_restore_test_at?: string | null
          metadata?: Json
          org_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_health_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_recovery_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          customer_id: string | null
          details: Json
          event_type: string
          id: string
          occurred_at: string
          org_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          details?: Json
          event_type: string
          id?: string
          occurred_at?: string
          org_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          details?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          org_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_recovery_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_recovery_events_org_id_fkey"
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
      cancellation_feedback: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          org_id: string
          outcome: string
          reason: string
          reason_detail: string | null
          selected_offer: string | null
          subscription_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          org_id: string
          outcome?: string
          reason: string
          reason_detail?: string | null
          selected_offer?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          org_id?: string
          outcome?: string
          reason?: string
          reason_detail?: string | null
          selected_offer?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_config: {
        Row: {
          consent_mode: string
          created_at: string
          id: string
          limited_pre_consent_enabled: boolean
          org_id: string
          require_consent_before_tracking: boolean
          retention_months: number
          updated_at: string
        }
        Insert: {
          consent_mode?: string
          created_at?: string
          id?: string
          limited_pre_consent_enabled?: boolean
          org_id: string
          require_consent_before_tracking?: boolean
          retention_months?: number
          updated_at?: string
        }
        Update: {
          consent_mode?: string
          created_at?: string
          id?: string
          limited_pre_consent_enabled?: boolean
          org_id?: string
          require_consent_before_tracking?: boolean
          retention_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_goals: {
        Row: {
          conversion_value: number | null
          created_at: string
          description: string
          goal_type: string
          id: string
          is_active: boolean
          is_conversion: boolean
          name: string
          org_id: string
          priority_level: string | null
          tracking_rules: Json
          updated_at: string
        }
        Insert: {
          conversion_value?: number | null
          created_at?: string
          description?: string
          goal_type?: string
          id?: string
          is_active?: boolean
          is_conversion?: boolean
          name: string
          org_id: string
          priority_level?: string | null
          tracking_rules?: Json
          updated_at?: string
        }
        Update: {
          conversion_value?: number | null
          created_at?: string
          description?: string
          goal_type?: string
          id?: string
          is_active?: boolean
          is_conversion?: boolean
          name?: string
          org_id?: string
          priority_level?: string | null
          tracking_rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
      credential_rotation_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          org_id: string | null
          site_credential_id: string | null
          site_id: string | null
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          org_id?: string | null
          site_credential_id?: string | null
          site_id?: string | null
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          org_id?: string | null
          site_credential_id?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credential_rotation_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_rotation_events_site_credential_id_fkey"
            columns: ["site_credential_id"]
            isOneToOne: false
            referencedRelation: "site_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_rotation_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contracts: {
        Row: {
          acv: number | null
          auto_renew: boolean | null
          billing_frequency: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          custom_terms: string | null
          customer_id: string
          customer_name: string
          geography: string | null
          id: string
          industry: string | null
          mrr: number | null
          notes: string | null
          org_id: string | null
          plan: string | null
          updated_at: string
        }
        Insert: {
          acv?: number | null
          auto_renew?: boolean | null
          billing_frequency?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          custom_terms?: string | null
          customer_id: string
          customer_name: string
          geography?: string | null
          id?: string
          industry?: string | null
          mrr?: number | null
          notes?: string | null
          org_id?: string | null
          plan?: string | null
          updated_at?: string
        }
        Update: {
          acv?: number | null
          auto_renew?: boolean | null
          billing_frequency?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          custom_terms?: string | null
          customer_id?: string
          customer_name?: string
          geography?: string | null
          id?: string
          industry?: string | null
          mrr?: number | null
          notes?: string | null
          org_id?: string | null
          plan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_health_snapshots: {
        Row: {
          arr: number | null
          created_at: string
          customer_id: string
          expansion_potential: string | null
          health_score: number | null
          id: string
          org_id: string | null
          renewal_risk: string | null
          snapshot_date: string
          support_score: number | null
          usage_score: number | null
        }
        Insert: {
          arr?: number | null
          created_at?: string
          customer_id: string
          expansion_potential?: string | null
          health_score?: number | null
          id?: string
          org_id?: string | null
          renewal_risk?: string | null
          snapshot_date: string
          support_score?: number | null
          usage_score?: number | null
        }
        Update: {
          arr?: number | null
          created_at?: string
          customer_id?: string
          expansion_potential?: string | null
          health_score?: number | null
          id?: string
          org_id?: string | null
          renewal_risk?: string | null
          snapshot_date?: string
          support_score?: number | null
          usage_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_health_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          acquisition_source: string | null
          completed_at: string | null
          created_at: string
          customer_type: string | null
          dismissed_count: number
          id: string
          last_prompted_at: string | null
          org_id: string
          skipped_at: string | null
          updated_at: string
          website_count_range: string | null
        }
        Insert: {
          acquisition_source?: string | null
          completed_at?: string | null
          created_at?: string
          customer_type?: string | null
          dismissed_count?: number
          id?: string
          last_prompted_at?: string | null
          org_id: string
          skipped_at?: string | null
          updated_at?: string
          website_count_range?: string | null
        }
        Update: {
          acquisition_source?: string | null
          completed_at?: string | null
          created_at?: string
          customer_type?: string | null
          dismissed_count?: number
          id?: string
          last_prompted_at?: string | null
          org_id?: string
          skipped_at?: string | null
          updated_at?: string
          website_count_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_access_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          grant_id: string | null
          id: string
          metadata: Json
          occurred_at: string
          org_id: string
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          grant_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          org_id: string
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          grant_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          org_id?: string
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_access_audit_log_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_access_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_access_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_at: string
          granted_by_user_id: string
          id: string
          org_id: string
          reason: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          source: string
          summary_email_sent_at: string | null
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_at?: string
          granted_by_user_id: string
          id?: string
          org_id: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          source?: string
          summary_email_sent_at?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_at?: string
          granted_by_user_id?: string
          id?: string
          org_id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          source?: string
          summary_email_sent_at?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_access_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_access_grants_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_access_grants_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "v_my_unread_support_replies"
            referencedColumns: ["ticket_id"]
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
      data_room_access_log: {
        Row: {
          action: string
          error_message: string | null
          id: string
          ip_address: string | null
          ip_hash: string | null
          link_id: string | null
          occurred_at: string
          referrer: string | null
          section_key: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          action: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          ip_hash?: string | null
          link_id?: string | null
          occurred_at?: string
          referrer?: string | null
          section_key?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          action?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          ip_hash?: string | null
          link_id?: string | null
          occurred_at?: string
          referrer?: string | null
          section_key?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_room_access_log_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "data_room_links"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_links: {
        Row: {
          allowed_sections: string[]
          created_at: string
          created_by_user_id: string
          expires_at: string
          id: string
          label: string
          max_views: number | null
          notes: string | null
          recipient_company: string | null
          recipient_email: string | null
          recipient_name: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          token_hash: string
          updated_at: string
          view_count: number
          watermark_text: string | null
        }
        Insert: {
          allowed_sections?: string[]
          created_at?: string
          created_by_user_id: string
          expires_at: string
          id?: string
          label: string
          max_views?: number | null
          notes?: string | null
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          token_hash: string
          updated_at?: string
          view_count?: number
          watermark_text?: string | null
        }
        Update: {
          allowed_sections?: string[]
          created_at?: string
          created_by_user_id?: string
          expires_at?: string
          id?: string
          label?: string
          max_views?: number | null
          notes?: string | null
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          token_hash?: string
          updated_at?: string
          view_count?: number
          watermark_text?: string | null
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          activity_type: string
          body: string | null
          created_at: string
          created_by_user_id: string | null
          deal_id: string
          id: string
          metadata: Json
          occurred_at: string
          title: string
        }
        Insert: {
          activity_type: string
          body?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deal_id: string
          id?: string
          metadata?: Json
          occurred_at?: string
          title: string
        }
        Update: {
          activity_type?: string
          body?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deal_id?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_documents: {
        Row: {
          created_at: string
          deal_id: string
          document_name: string
          document_type: string
          document_url: string | null
          effective_date: string | null
          expiration_date: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          document_name: string
          document_type: string
          document_url?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          document_name?: string
          document_type?: string
          document_url?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          sort_order: number
          stage_key: string
          stage_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          sort_order?: number
          stage_key: string
          stage_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          sort_order?: number
          stage_key?: string
          stage_name?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          actual_close_date: string | null
          buyer_company: string | null
          buyer_email: string | null
          buyer_name: string
          buyer_type: string
          created_at: string
          created_by_user_id: string | null
          currency: string
          data_room_link_id: string | null
          deal_name: string
          deal_value: number | null
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          owner_user_id: string | null
          probability: number
          source: string | null
          stage_key: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_close_date?: string | null
          buyer_company?: string | null
          buyer_email?: string | null
          buyer_name: string
          buyer_type?: string
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          data_room_link_id?: string | null
          deal_name: string
          deal_value?: number | null
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_user_id?: string | null
          probability?: number
          source?: string | null
          stage_key?: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_close_date?: string | null
          buyer_company?: string | null
          buyer_email?: string | null
          buyer_name?: string
          buyer_type?: string
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          data_room_link_id?: string | null
          deal_name?: string
          deal_value?: number | null
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_user_id?: string | null
          probability?: number
          source?: string | null
          stage_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_data_room_link_id_fkey"
            columns: ["data_room_link_id"]
            isOneToOne: false
            referencedRelation: "data_room_links"
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
      diligence_checklist_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          linked_document_url: string | null
          notes: string | null
          owner_user_id: string | null
          readiness_status: string
          section_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          linked_document_url?: string | null
          notes?: string | null
          owner_user_id?: string | null
          readiness_status?: string
          section_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          linked_document_url?: string | null
          notes?: string | null
          owner_user_id?: string | null
          readiness_status?: string
          section_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      domain_allowlist: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          id: string
          notes: string | null
          org_id: string
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          notes?: string | null
          org_id: string
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          notes?: string | null
          org_id?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_allowlist_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_allowlist_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
      error_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          subscriber_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          subscriber_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
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
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      feature_flags: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          notes: string | null
          org_id: string | null
          scope: string
          site_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          notes?: string | null
          org_id?: string | null
          scope: string
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          scope?: string
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          business_reason: string | null
          created_at: string
          id: string
          org_id: string
          product_status: string
          request_summary: string
          site_id: string | null
          ticket_id: string
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          business_reason?: string | null
          created_at?: string
          id?: string
          org_id: string
          product_status?: string
          request_summary: string
          site_id?: string | null
          ticket_id: string
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          business_reason?: string | null
          created_at?: string
          id?: string
          org_id?: string
          product_status?: string
          request_summary?: string
          site_id?: string | null
          ticket_id?: string
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "v_my_unread_support_replies"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          org_id: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          message: string
          org_id: string
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          org_id?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
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
      finance_monthly: {
        Row: {
          cash_balance: number | null
          cogs_ai: number | null
          cogs_hosting: number | null
          cogs_other: number | null
          cogs_support: number | null
          created_at: string
          headcount: number | null
          id: string
          month: string
          notes: string | null
          opex_ga: number | null
          opex_rd: number | null
          opex_sm: number | null
          revenue: number | null
          updated_at: string
        }
        Insert: {
          cash_balance?: number | null
          cogs_ai?: number | null
          cogs_hosting?: number | null
          cogs_other?: number | null
          cogs_support?: number | null
          created_at?: string
          headcount?: number | null
          id?: string
          month: string
          notes?: string | null
          opex_ga?: number | null
          opex_rd?: number | null
          opex_sm?: number | null
          revenue?: number | null
          updated_at?: string
        }
        Update: {
          cash_balance?: number | null
          cogs_ai?: number | null
          cogs_hosting?: number | null
          cogs_other?: number | null
          cogs_support?: number | null
          created_at?: string
          headcount?: number | null
          id?: string
          month?: string
          notes?: string | null
          opex_ga?: number | null
          opex_rd?: number | null
          opex_sm?: number | null
          revenue?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      forecast_assumptions: {
        Row: {
          actual_value: number | null
          created_at: string
          forecast_value: number | null
          id: string
          metric_key: string
          notes: string | null
          owner_user_id: string | null
          period_label: string
          scenario: string
          updated_at: string
        }
        Insert: {
          actual_value?: number | null
          created_at?: string
          forecast_value?: number | null
          id?: string
          metric_key: string
          notes?: string | null
          owner_user_id?: string | null
          period_label: string
          scenario?: string
          updated_at?: string
        }
        Update: {
          actual_value?: number | null
          created_at?: string
          forecast_value?: number | null
          id?: string
          metric_key?: string
          notes?: string | null
          owner_user_id?: string | null
          period_label?: string
          scenario?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_entries: {
        Row: {
          builder_type: string
          created_at: string
          form_integration_id: string
          id: string
          normalized_data: Json
          org_id: string
          site_id: string
          source_entry_id: string
          submitted_at: string | null
        }
        Insert: {
          builder_type: string
          created_at?: string
          form_integration_id: string
          id?: string
          normalized_data?: Json
          org_id: string
          site_id: string
          source_entry_id: string
          submitted_at?: string | null
        }
        Update: {
          builder_type?: string
          created_at?: string
          form_integration_id?: string
          id?: string
          normalized_data?: Json
          org_id?: string
          site_id?: string
          source_entry_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_entries_form_integration_id_fkey"
            columns: ["form_integration_id"]
            isOneToOne: false
            referencedRelation: "form_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      form_health_checks: {
        Row: {
          form_id: string
          id: string
          is_rendered: boolean
          last_checked_at: string
          last_failure_reason: string | null
          last_http_status: number | null
          last_rendered_at: string | null
          org_id: string
          page_url: string | null
          site_id: string
        }
        Insert: {
          form_id: string
          id?: string
          is_rendered?: boolean
          last_checked_at?: string
          last_failure_reason?: string | null
          last_http_status?: number | null
          last_rendered_at?: string | null
          org_id: string
          page_url?: string | null
          site_id: string
        }
        Update: {
          form_id?: string
          id?: string
          is_rendered?: boolean
          last_checked_at?: string
          last_failure_reason?: string | null
          last_http_status?: number | null
          last_rendered_at?: string | null
          org_id?: string
          page_url?: string | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_health_checks_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_health_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_health_checks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      form_import_jobs: {
        Row: {
          adaptive_batch_size: number | null
          auto_resume_enabled: boolean | null
          batch_size: number
          cancel_reason: string | null
          created_at: string
          cursor: string | null
          form_integration_id: string
          heartbeat_at: string | null
          id: string
          last_batch_at: string | null
          last_error: string | null
          lock_token: string | null
          locked_at: string | null
          next_run_at: string | null
          org_id: string
          retry_count: number
          site_id: string
          status: string
          total_expected: number
          total_processed: number
          updated_at: string
        }
        Insert: {
          adaptive_batch_size?: number | null
          auto_resume_enabled?: boolean | null
          batch_size?: number
          cancel_reason?: string | null
          created_at?: string
          cursor?: string | null
          form_integration_id: string
          heartbeat_at?: string | null
          id?: string
          last_batch_at?: string | null
          last_error?: string | null
          lock_token?: string | null
          locked_at?: string | null
          next_run_at?: string | null
          org_id: string
          retry_count?: number
          site_id: string
          status?: string
          total_expected?: number
          total_processed?: number
          updated_at?: string
        }
        Update: {
          adaptive_batch_size?: number | null
          auto_resume_enabled?: boolean | null
          batch_size?: number
          cancel_reason?: string | null
          created_at?: string
          cursor?: string | null
          form_integration_id?: string
          heartbeat_at?: string | null
          id?: string
          last_batch_at?: string | null
          last_error?: string | null
          lock_token?: string | null
          locked_at?: string | null
          next_run_at?: string | null
          org_id?: string
          retry_count?: number
          site_id?: string
          status?: string
          total_expected?: number
          total_processed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_import_jobs_form_integration_id_fkey"
            columns: ["form_integration_id"]
            isOneToOne: false
            referencedRelation: "form_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_import_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_import_jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      form_integrations: {
        Row: {
          builder_type: string
          created_at: string
          external_form_id: string
          form_id: string | null
          form_name: string
          id: string
          is_active: boolean
          last_error: string | null
          last_synced_at: string | null
          org_id: string
          site_id: string
          status: string
          total_entries_estimated: number
          total_entries_imported: number
          updated_at: string
        }
        Insert: {
          builder_type?: string
          created_at?: string
          external_form_id: string
          form_id?: string | null
          form_name?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          org_id: string
          site_id: string
          status?: string
          total_entries_estimated?: number
          total_entries_imported?: number
          updated_at?: string
        }
        Update: {
          builder_type?: string
          created_at?: string
          external_form_id?: string
          form_id?: string | null
          form_name?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          org_id?: string
          site_id?: string
          status?: string
          total_entries_estimated?: number
          total_entries_imported?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_integrations_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_integrations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
          health_check_disabled: boolean
          health_check_disabled_at: string | null
          health_check_disabled_by: string | null
          health_check_disabled_reason: string | null
          id: string
          is_active: boolean
          is_primary_lead: boolean
          lead_weight: number
          name: string
          org_id: string
          page_url: string | null
          provider: string
          site_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          estimated_value?: number | null
          external_form_id: string
          form_category?: string
          health_check_disabled?: boolean
          health_check_disabled_at?: string | null
          health_check_disabled_by?: string | null
          health_check_disabled_reason?: string | null
          id?: string
          is_active?: boolean
          is_primary_lead?: boolean
          lead_weight?: number
          name?: string
          org_id: string
          page_url?: string | null
          provider?: string
          site_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          estimated_value?: number | null
          external_form_id?: string
          form_category?: string
          health_check_disabled?: boolean
          health_check_disabled_at?: string | null
          health_check_disabled_by?: string | null
          health_check_disabled_reason?: string | null
          id?: string
          is_active?: boolean
          is_primary_lead?: boolean
          lead_weight?: number
          name?: string
          org_id?: string
          page_url?: string | null
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
      founder_dependencies: {
        Row: {
          category: string
          created_at: string
          dependency_level: string
          documentation_status: string
          id: string
          notes: string | null
          process_name: string
          runbook_url: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          dependency_level?: string
          documentation_status?: string
          id?: string
          notes?: string | null
          process_name: string
          runbook_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          dependency_level?: string
          documentation_status?: string
          id?: string
          notes?: string | null
          process_name?: string
          runbook_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      goal_completions: {
        Row: {
          completed_at: string
          dedupe_key: string | null
          device_type: string | null
          event_type: string
          goal_id: string
          id: string
          landing_page: string | null
          org_id: string
          page_path: string | null
          page_url: string | null
          referrer: string | null
          session_id: string | null
          site_id: string
          target_text: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Insert: {
          completed_at?: string
          dedupe_key?: string | null
          device_type?: string | null
          event_type: string
          goal_id: string
          id?: string
          landing_page?: string | null
          org_id: string
          page_path?: string | null
          page_url?: string | null
          referrer?: string | null
          session_id?: string | null
          site_id: string
          target_text?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Update: {
          completed_at?: string
          dedupe_key?: string | null
          device_type?: string | null
          event_type?: string
          goal_id?: string
          id?: string
          landing_page?: string | null
          org_id?: string
          page_path?: string | null
          page_url?: string | null
          referrer?: string | null
          session_id?: string | null
          site_id?: string
          target_text?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_completions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "conversion_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_completions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_completions_site_id_fkey"
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
      goals_config: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_conversion: boolean
          match_type: string
          match_value: string
          name: string
          org_id: string
          site_id: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          is_conversion?: boolean
          match_type?: string
          match_value: string
          name: string
          org_id: string
          site_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_conversion?: boolean
          match_type?: string
          match_value?: string
          name?: string
          org_id?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_config_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      ingestion_anomalies: {
        Row: {
          anomaly_type: string
          details: Json
          detected_at: string
          id: string
          org_id: string
          site_id: string | null
        }
        Insert: {
          anomaly_type: string
          details?: Json
          detected_at?: string
          id?: string
          org_id: string
          site_id?: string | null
        }
        Update: {
          anomaly_type?: string
          details?: Json
          detected_at?: string
          id?: string
          org_id?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_anomalies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_anomalies_site_id_fkey"
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
      ip_assignments: {
        Row: {
          asset_name: string
          asset_type: string
          assignment_status: string
          created_at: string
          document_url: string | null
          id: string
          notes: string | null
          owner_name: string | null
          updated_at: string
        }
        Insert: {
          asset_name: string
          asset_type: string
          assignment_status?: string
          created_at?: string
          document_url?: string | null
          id?: string
          notes?: string | null
          owner_name?: string | null
          updated_at?: string
        }
        Update: {
          asset_name?: string
          asset_type?: string
          assignment_status?: string
          created_at?: string
          document_url?: string | null
          id?: string
          notes?: string | null
          owner_name?: string | null
          updated_at?: string
        }
        Relationships: []
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
          customer_marketing_consent_field_name: string | null
          customer_marketing_consent_status: string
          customer_marketing_consent_text: string | null
          customer_marketing_consent_timestamp: string | null
          data: Json | null
          engagement_score: number | null
          external_entry_id: string | null
          external_entry_key: string | null
          form_id: string
          id: string
          lead_score: number | null
          lead_type: string | null
          location: string | null
          medium: string | null
          notes: string | null
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
          tags: string[]
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
          customer_marketing_consent_field_name?: string | null
          customer_marketing_consent_status?: string
          customer_marketing_consent_text?: string | null
          customer_marketing_consent_timestamp?: string | null
          data?: Json | null
          engagement_score?: number | null
          external_entry_id?: string | null
          external_entry_key?: string | null
          form_id: string
          id?: string
          lead_score?: number | null
          lead_type?: string | null
          location?: string | null
          medium?: string | null
          notes?: string | null
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
          tags?: string[]
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
          customer_marketing_consent_field_name?: string | null
          customer_marketing_consent_status?: string
          customer_marketing_consent_text?: string | null
          customer_marketing_consent_timestamp?: string | null
          data?: Json | null
          engagement_score?: number | null
          external_entry_id?: string | null
          external_entry_key?: string | null
          form_id?: string
          id?: string
          lead_score?: number | null
          lead_type?: string | null
          location?: string | null
          medium?: string | null
          notes?: string | null
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
          tags?: string[]
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
      leads_predupe_backup_2026_04_29: {
        Row: {
          campaign: string | null
          created_at: string | null
          customer_marketing_consent_field_name: string | null
          customer_marketing_consent_status: string | null
          customer_marketing_consent_text: string | null
          customer_marketing_consent_timestamp: string | null
          data: Json | null
          engagement_score: number | null
          external_entry_id: string | null
          external_entry_key: string | null
          form_id: string | null
          id: string | null
          lead_score: number | null
          lead_type: string | null
          location: string | null
          medium: string | null
          notes: string | null
          org_id: string | null
          page_path: string | null
          page_url: string | null
          physician: string | null
          referrer: string | null
          referrer_domain: string | null
          service: string | null
          session_id: string | null
          site_id: string | null
          source: string | null
          status: string | null
          submitted_at: string | null
          tags: string[] | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          campaign?: string | null
          created_at?: string | null
          customer_marketing_consent_field_name?: string | null
          customer_marketing_consent_status?: string | null
          customer_marketing_consent_text?: string | null
          customer_marketing_consent_timestamp?: string | null
          data?: Json | null
          engagement_score?: number | null
          external_entry_id?: string | null
          external_entry_key?: string | null
          form_id?: string | null
          id?: string | null
          lead_score?: number | null
          lead_type?: string | null
          location?: string | null
          medium?: string | null
          notes?: string | null
          org_id?: string | null
          page_path?: string | null
          page_url?: string | null
          physician?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          service?: string | null
          session_id?: string | null
          site_id?: string | null
          source?: string | null
          status?: string | null
          submitted_at?: string | null
          tags?: string[] | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          campaign?: string | null
          created_at?: string | null
          customer_marketing_consent_field_name?: string | null
          customer_marketing_consent_status?: string | null
          customer_marketing_consent_text?: string | null
          customer_marketing_consent_timestamp?: string | null
          data?: Json | null
          engagement_score?: number | null
          external_entry_id?: string | null
          external_entry_key?: string | null
          form_id?: string | null
          id?: string | null
          lead_score?: number | null
          lead_type?: string | null
          location?: string | null
          medium?: string | null
          notes?: string | null
          org_id?: string | null
          page_path?: string | null
          page_url?: string | null
          physician?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          service?: string | null
          session_id?: string | null
          site_id?: string | null
          source?: string | null
          status?: string | null
          submitted_at?: string | null
          tags?: string[] | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      login_events: {
        Row: {
          email: string | null
          full_name: string | null
          id: string
          ip_address: string | null
          ip_hash: string | null
          logged_in_at: string
          org_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          email?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          ip_hash?: string | null
          logged_in_at?: string
          org_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          email?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          ip_hash?: string | null
          logged_in_at?: string
          org_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      magic_login_tokens: {
        Row: {
          consumed_at: string | null
          consumed_ip_hash: string | null
          expires_at: string
          id: string
          issued_at: string
          org_id: string
          requested_by_email: string | null
          requested_by_user_id: string
          requestor_ip_hash: string | null
          requestor_user_agent: string | null
          revoked_at: string | null
          revoked_reason: string | null
          site_id: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_ip_hash?: string | null
          expires_at: string
          id?: string
          issued_at?: string
          org_id: string
          requested_by_email?: string | null
          requested_by_user_id: string
          requestor_ip_hash?: string | null
          requestor_user_agent?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          site_id: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          consumed_ip_hash?: string | null
          expires_at?: string
          id?: string
          issued_at?: string
          org_id?: string
          requested_by_email?: string | null
          requested_by_user_id?: string
          requestor_ip_hash?: string | null
          requestor_user_agent?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          site_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "magic_login_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magic_login_tokens_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contact_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          contact_id: string | null
          email_lower: string | null
          event_type: Database["public"]["Enums"]["mc_event_type"]
          id: string
          metadata: Json
          occurred_at: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          contact_id?: string | null
          email_lower?: string | null
          event_type: Database["public"]["Enums"]["mc_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          contact_id?: string | null
          email_lower?: string | null
          event_type?: Database["public"]["Enums"]["mc_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contact_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contacts: {
        Row: {
          bounced_at: string | null
          company_name: string | null
          complained_at: string | null
          consent_ip_hash: string | null
          created_at: string
          email: string
          email_lower: string | null
          email_provider: Database["public"]["Enums"]["mc_email_provider"]
          email_provider_contact_id: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lifecycle_stage: Database["public"]["Enums"]["mc_lifecycle_stage"]
          marketing_consent_source: string | null
          marketing_consent_status: Database["public"]["Enums"]["mc_consent_status"]
          marketing_consent_text: string | null
          marketing_consent_timestamp: string | null
          marketing_consent_url: string | null
          org_id: string | null
          role: string | null
          source: Database["public"]["Enums"]["mc_source"]
          unsubscribed_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bounced_at?: string | null
          company_name?: string | null
          complained_at?: string | null
          consent_ip_hash?: string | null
          created_at?: string
          email: string
          email_lower?: string | null
          email_provider?: Database["public"]["Enums"]["mc_email_provider"]
          email_provider_contact_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["mc_lifecycle_stage"]
          marketing_consent_source?: string | null
          marketing_consent_status?: Database["public"]["Enums"]["mc_consent_status"]
          marketing_consent_text?: string | null
          marketing_consent_timestamp?: string | null
          marketing_consent_url?: string | null
          org_id?: string | null
          role?: string | null
          source?: Database["public"]["Enums"]["mc_source"]
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bounced_at?: string | null
          company_name?: string | null
          complained_at?: string | null
          consent_ip_hash?: string | null
          created_at?: string
          email?: string
          email_lower?: string | null
          email_provider?: Database["public"]["Enums"]["mc_email_provider"]
          email_provider_contact_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["mc_lifecycle_stage"]
          marketing_consent_source?: string | null
          marketing_consent_status?: Database["public"]["Enums"]["mc_consent_status"]
          marketing_consent_text?: string | null
          marketing_consent_timestamp?: string | null
          marketing_consent_url?: string | null
          org_id?: string | null
          role?: string | null
          source?: Database["public"]["Enums"]["mc_source"]
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_definitions: {
        Row: {
          category: string
          caveats: string | null
          created_at: string
          description: string | null
          formula: string | null
          id: string
          metric_key: string
          metric_name: string
          owner_user_id: string | null
          source_systems: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          caveats?: string | null
          created_at?: string
          description?: string | null
          formula?: string | null
          id?: string
          metric_key: string
          metric_name: string
          owner_user_id?: string | null
          source_systems?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          caveats?: string | null
          created_at?: string
          description?: string | null
          formula?: string | null
          id?: string
          metric_key?: string
          metric_name?: string
          owner_user_id?: string | null
          source_systems?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mfa_email_codes: {
        Row: {
          attempts: number
          challenge_token_hash: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_hash: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          challenge_token_hash: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          challenge_token_hash?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
      monthly_summaries: {
        Row: {
          focus_areas: Json
          generated_at: string
          id: string
          metrics_json: Json
          month: string
          org_id: string
          summary_text: string
          top_performers: Json
        }
        Insert: {
          focus_areas?: Json
          generated_at?: string
          id?: string
          metrics_json?: Json
          month: string
          org_id: string
          summary_text?: string
          top_performers?: Json
        }
        Update: {
          focus_areas?: Json
          generated_at?: string
          id?: string
          metrics_json?: Json
          month?: string
          org_id?: string
          summary_text?: string
          top_performers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "monthly_summaries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      nightly_summaries: {
        Row: {
          findings: Json
          generated_at: string
          id: string
          insights: Json
          metrics_snapshot: Json
          org_id: string
          period_end: string
          period_start: string
          seo_snapshot: Json | null
          suggested_actions: Json
          summary_text: string
          top_findings: Json
        }
        Insert: {
          findings?: Json
          generated_at?: string
          id?: string
          insights?: Json
          metrics_snapshot?: Json
          org_id: string
          period_end: string
          period_start: string
          seo_snapshot?: Json | null
          suggested_actions?: Json
          summary_text?: string
          top_findings?: Json
        }
        Update: {
          findings?: Json
          generated_at?: string
          id?: string
          insights?: Json
          metrics_snapshot?: Json
          org_id?: string
          period_end?: string
          period_start?: string
          seo_snapshot?: Json | null
          suggested_actions?: Json
          summary_text?: string
          top_findings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "nightly_summaries_org_id_fkey"
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
          lead_id: string | null
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
          lead_id?: string | null
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
          lead_id?: string | null
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
            foreignKeyName: "notification_inbox_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      operational_documents: {
        Row: {
          created_at: string
          document_type: string
          id: string
          linked_url: string | null
          notes: string | null
          owner_user_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          linked_url?: string | null
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          linked_url?: string | null
          notes?: string | null
          owner_user_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          org_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          order_id: string
          org_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sku?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          org_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_email: string | null
          customer_email_hash: string | null
          customer_name: string | null
          external_order_id: string
          id: string
          landing_page: string | null
          ordered_at: string
          org_id: string
          payment_method: string | null
          referrer_domain: string | null
          session_id: string | null
          site_id: string
          status: string
          total: number
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_email_hash?: string | null
          customer_name?: string | null
          external_order_id: string
          id?: string
          landing_page?: string | null
          ordered_at?: string
          org_id: string
          payment_method?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          site_id: string
          status?: string
          total?: number
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_email_hash?: string | null
          customer_name?: string | null
          external_order_id?: string
          id?: string
          landing_page?: string | null
          ordered_at?: string
          org_id?: string
          payment_method?: string | null
          referrer_domain?: string | null
          session_id?: string | null
          site_id?: string
          status?: string
          total?: number
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_site_id_fkey"
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
          invite_accepted_at: string | null
          invited_at: string | null
          invited_by: string | null
          is_owner: boolean
          org_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_accepted_at?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_owner?: boolean
          org_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_accepted_at?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_owner?: boolean
          org_id?: string
          role?: string
          status?: string
          updated_at?: string
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
          archived_at: string | null
          billing_exempt: boolean
          cancellation_email_sent_at: string | null
          created_at: string
          day25_email_sent_at: string | null
          day80_email_sent_at: string | null
          grace_period_ends_at: string | null
          id: string
          lifecycle_email_cancelled_sent_at: string | null
          lifecycle_email_day25_sent_at: string | null
          lifecycle_email_day80_sent_at: string | null
          name: string
          seo_visibility_level: string
          status: Database["public"]["Enums"]["org_lifecycle_status"]
          status_change_reason: string | null
          status_changed_at: string
          timezone: string
        }
        Insert: {
          archived_at?: string | null
          billing_exempt?: boolean
          cancellation_email_sent_at?: string | null
          created_at?: string
          day25_email_sent_at?: string | null
          day80_email_sent_at?: string | null
          grace_period_ends_at?: string | null
          id?: string
          lifecycle_email_cancelled_sent_at?: string | null
          lifecycle_email_day25_sent_at?: string | null
          lifecycle_email_day80_sent_at?: string | null
          name: string
          seo_visibility_level?: string
          status?: Database["public"]["Enums"]["org_lifecycle_status"]
          status_change_reason?: string | null
          status_changed_at?: string
          timezone?: string
        }
        Update: {
          archived_at?: string | null
          billing_exempt?: boolean
          cancellation_email_sent_at?: string | null
          created_at?: string
          day25_email_sent_at?: string | null
          day80_email_sent_at?: string | null
          grace_period_ends_at?: string | null
          id?: string
          lifecycle_email_cancelled_sent_at?: string | null
          lifecycle_email_day25_sent_at?: string | null
          lifecycle_email_day80_sent_at?: string | null
          name?: string
          seo_visibility_level?: string
          status?: Database["public"]["Enums"]["org_lifecycle_status"]
          status_change_reason?: string | null
          status_changed_at?: string
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
      password_reset_links: {
        Row: {
          consumed_at: string | null
          consumed_ip_hash: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_ip_hash?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          consumed_ip_hash?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      plugin_download_failures: {
        Row: {
          created_at: string
          download_url: string | null
          error_message: string | null
          failure_stage: string
          http_status: number | null
          id: string
          notified_at: string | null
          org_id: string | null
          surface: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          download_url?: string | null
          error_message?: string | null
          failure_stage: string
          http_status?: number | null
          id?: string
          notified_at?: string | null
          org_id?: string | null
          surface?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          download_url?: string | null
          error_message?: string | null
          failure_stage?: string
          http_status?: number | null
          id?: string
          notified_at?: string | null
          org_id?: string | null
          surface?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plugin_download_failures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_health_reports: {
        Row: {
          blocked_versions: string[]
          boot_failure_count: number
          created_at: string
          disabled_modules: string[]
          domain: string
          forced_safe_mode: boolean
          id: string
          in_boot_loop: boolean
          last_error: string | null
          last_healthy_version: string | null
          migration_lock_held: boolean
          migration_version: number | null
          mode: string
          open_breakers: string[]
          org_id: string | null
          plugin_version: string | null
          reported_at: string
          site_id: string | null
        }
        Insert: {
          blocked_versions?: string[]
          boot_failure_count?: number
          created_at?: string
          disabled_modules?: string[]
          domain: string
          forced_safe_mode?: boolean
          id?: string
          in_boot_loop?: boolean
          last_error?: string | null
          last_healthy_version?: string | null
          migration_lock_held?: boolean
          migration_version?: number | null
          mode?: string
          open_breakers?: string[]
          org_id?: string | null
          plugin_version?: string | null
          reported_at?: string
          site_id?: string | null
        }
        Update: {
          blocked_versions?: string[]
          boot_failure_count?: number
          created_at?: string
          disabled_modules?: string[]
          domain?: string
          forced_safe_mode?: boolean
          id?: string
          in_boot_loop?: boolean
          last_error?: string | null
          last_healthy_version?: string | null
          migration_lock_held?: boolean
          migration_version?: number | null
          mode?: string
          open_breakers?: string[]
          org_id?: string | null
          plugin_version?: string | null
          reported_at?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plugin_health_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plugin_health_reports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_release_keys: {
        Row: {
          algorithm: string
          created_at: string
          id: string
          key_fingerprint: string
          notes: string | null
          retired_at: string | null
          status: string
        }
        Insert: {
          algorithm?: string
          created_at?: string
          id?: string
          key_fingerprint: string
          notes?: string | null
          retired_at?: string | null
          status?: string
        }
        Update: {
          algorithm?: string
          created_at?: string
          id?: string
          key_fingerprint?: string
          notes?: string | null
          retired_at?: string | null
          status?: string
        }
        Relationships: []
      }
      plugin_update_fetches: {
        Row: {
          current_version: string | null
          domain: string | null
          id: string
          ip_hash: string | null
          occurred_at: string
          served_version: string | null
          signature_alg: string | null
          signature_issued: boolean
          user_agent: string | null
        }
        Insert: {
          current_version?: string | null
          domain?: string | null
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          served_version?: string | null
          signature_alg?: string | null
          signature_issued?: boolean
          user_agent?: string | null
        }
        Update: {
          current_version?: string | null
          domain?: string | null
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          served_version?: string | null
          signature_alg?: string | null
          signature_issued?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      processed_stripe_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
          summary: Json
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
          summary?: Json
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
          summary?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          marketing_consent_source: string | null
          marketing_consent_status: string
          marketing_consent_timestamp: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          unsubscribed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_consent_source?: string | null
          marketing_consent_status?: string
          marketing_consent_timestamp?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_consent_source?: string | null
          marketing_consent_status?: string
          marketing_consent_timestamp?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_log: {
        Row: {
          bucket_key: string | null
          bucket_type: string
          details: Json
          endpoint: string
          id: number
          observed_count: number
          occurred_at: string
          org_id: string | null
          site_id: string | null
          threshold: number | null
          would_block: boolean
        }
        Insert: {
          bucket_key?: string | null
          bucket_type: string
          details?: Json
          endpoint: string
          id?: number
          observed_count?: number
          occurred_at?: string
          org_id?: string | null
          site_id?: string | null
          threshold?: number | null
          would_block?: boolean
        }
        Update: {
          bucket_key?: string | null
          bucket_type?: string
          details?: Json
          endpoint?: string
          id?: number
          observed_count?: number
          occurred_at?: string
          org_id?: string | null
          site_id?: string | null
          threshold?: number | null
          would_block?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_limit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          function_name: string
          id: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          function_name: string
          id?: string
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          function_name?: string
          id?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      reconciliation_status: {
        Row: {
          created_at: string
          discrepancy_amount: number | null
          id: string
          last_reconciled_at: string | null
          metric_key: string
          notes: string | null
          owner_user_id: string | null
          period_end: string | null
          period_start: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discrepancy_amount?: number | null
          id?: string
          last_reconciled_at?: string | null
          metric_key: string
          notes?: string | null
          owner_user_id?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discrepancy_amount?: number | null
          id?: string
          last_reconciled_at?: string | null
          metric_key?: string
          notes?: string | null
          owner_user_id?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      release_gate_checks: {
        Row: {
          check_name: string
          created_at: string
          details: Json
          id: string
          release_ref: string
          status: string
        }
        Insert: {
          check_name: string
          created_at?: string
          details?: Json
          id?: string
          release_ref: string
          status: string
        }
        Update: {
          check_name?: string
          created_at?: string
          details?: Json
          id?: string
          release_ref?: string
          status?: string
        }
        Relationships: []
      }
      release_qa_manual_signoff: {
        Row: {
          app_version: string
          check_key: string
          evidence: Json
          id: string
          notes: string | null
          signed_off_at: string
          signed_off_by: string | null
          signed_off_by_email: string | null
        }
        Insert: {
          app_version: string
          check_key: string
          evidence?: Json
          id?: string
          notes?: string | null
          signed_off_at?: string
          signed_off_by?: string | null
          signed_off_by_email?: string | null
        }
        Update: {
          app_version?: string
          check_key?: string
          evidence?: Json
          id?: string
          notes?: string | null
          signed_off_at?: string
          signed_off_by?: string | null
          signed_off_by_email?: string | null
        }
        Relationships: []
      }
      release_qa_results: {
        Row: {
          category_key: string
          check_key: string
          check_type: string
          duration_ms: number | null
          evidence: Json
          id: string
          message: string | null
          ran_at: string
          run_id: string
          severity: string
          status: Database["public"]["Enums"]["release_qa_check_status"]
        }
        Insert: {
          category_key: string
          check_key: string
          check_type: string
          duration_ms?: number | null
          evidence?: Json
          id?: string
          message?: string | null
          ran_at?: string
          run_id: string
          severity: string
          status: Database["public"]["Enums"]["release_qa_check_status"]
        }
        Update: {
          category_key?: string
          check_key?: string
          check_type?: string
          duration_ms?: number | null
          evidence?: Json
          id?: string
          message?: string | null
          ran_at?: string
          run_id?: string
          severity?: string
          status?: Database["public"]["Enums"]["release_qa_check_status"]
        }
        Relationships: [
          {
            foreignKeyName: "release_qa_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "release_qa_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      release_qa_runs: {
        Row: {
          app_version: string
          completed_at: string | null
          id: string
          notes: string | null
          scope: string
          ship_blocked: boolean
          started_at: string
          started_by: string | null
          started_by_email: string | null
          status: Database["public"]["Enums"]["release_qa_status"]
          totals: Json
        }
        Insert: {
          app_version: string
          completed_at?: string | null
          id?: string
          notes?: string | null
          scope?: string
          ship_blocked?: boolean
          started_at?: string
          started_by?: string | null
          started_by_email?: string | null
          status?: Database["public"]["Enums"]["release_qa_status"]
          totals?: Json
        }
        Update: {
          app_version?: string
          completed_at?: string | null
          id?: string
          notes?: string | null
          scope?: string
          ship_blocked?: boolean
          started_at?: string
          started_by?: string | null
          started_by_email?: string | null
          status?: Database["public"]["Enums"]["release_qa_status"]
          totals?: Json
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
      report_custom_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          sections_config: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          org_id: string
          sections_config?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sections_config?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_custom_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      retention_account_flow_status: {
        Row: {
          current_step: number
          entered_at: string
          exited_at: string | null
          flow_id: string
          id: string
          metadata: Json
          org_id: string
          status: string
        }
        Insert: {
          current_step?: number
          entered_at?: string
          exited_at?: string | null
          flow_id: string
          id?: string
          metadata?: Json
          org_id: string
          status?: string
        }
        Update: {
          current_step?: number
          entered_at?: string
          exited_at?: string | null
          flow_id?: string
          id?: string
          metadata?: Json
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_account_flow_status_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "retention_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_account_flow_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_account_health: {
        Row: {
          activation_stage: string
          billing_risk: boolean
          cancellation_intent: boolean
          churn_risk_reasons: Json
          computed_at: string
          created_at: string
          customer_id: string | null
          engagement_risk: boolean
          health_score: number
          id: string
          internal_note: string | null
          last_data_received_at: string | null
          last_login_at: string | null
          last_payment_failed_at: string | null
          last_summary_opened_at: string | null
          lifecycle_stage: string
          org_id: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          risk_level: string
          setup_risk: boolean
          updated_at: string
        }
        Insert: {
          activation_stage?: string
          billing_risk?: boolean
          cancellation_intent?: boolean
          churn_risk_reasons?: Json
          computed_at?: string
          created_at?: string
          customer_id?: string | null
          engagement_risk?: boolean
          health_score?: number
          id?: string
          internal_note?: string | null
          last_data_received_at?: string | null
          last_login_at?: string | null
          last_payment_failed_at?: string | null
          last_summary_opened_at?: string | null
          lifecycle_stage?: string
          org_id: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          risk_level?: string
          setup_risk?: boolean
          updated_at?: string
        }
        Update: {
          activation_stage?: string
          billing_risk?: boolean
          cancellation_intent?: boolean
          churn_risk_reasons?: Json
          computed_at?: string
          created_at?: string
          customer_id?: string | null
          engagement_risk?: boolean
          health_score?: number
          id?: string
          internal_note?: string | null
          last_data_received_at?: string | null
          last_login_at?: string | null
          last_payment_failed_at?: string | null
          last_summary_opened_at?: string | null
          lifecycle_stage?: string
          org_id?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          risk_level?: string
          setup_risk?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_account_health_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_account_health_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_events: {
        Row: {
          created_at: string
          customer_id: string | null
          event_category: string
          event_name: string
          event_value: Json
          id: string
          occurred_at: string
          org_id: string
          site_id: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          event_category?: string
          event_name: string
          event_value?: Json
          id?: string
          occurred_at?: string
          org_id: string
          site_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          event_category?: string
          event_name?: string
          event_value?: Json
          id?: string
          occurred_at?: string
          org_id?: string
          site_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_flow_steps: {
        Row: {
          body: string
          channel: string
          created_at: string
          delay_minutes: number
          flow_id: string
          id: string
          internal_name: string | null
          is_active: boolean
          send_condition: Json
          step_order: number
          subject: string | null
          template_name: string | null
          updated_at: string
        }
        Insert: {
          body?: string
          channel?: string
          created_at?: string
          delay_minutes?: number
          flow_id: string
          id?: string
          internal_name?: string | null
          is_active?: boolean
          send_condition?: Json
          step_order: number
          subject?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          delay_minutes?: number
          flow_id?: string
          id?: string
          internal_name?: string | null
          is_active?: boolean
          send_condition?: Json
          step_order?: number
          subject?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "retention_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_flows: {
        Row: {
          absence_event: string | null
          absence_window_hours: number | null
          audience_filter: Json
          audience_type: string | null
          created_at: string
          description: string | null
          goal: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          trigger_event: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          absence_event?: string | null
          absence_window_hours?: number | null
          audience_filter?: Json
          audience_type?: string | null
          created_at?: string
          description?: string | null
          goal?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          trigger_event?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          absence_event?: string | null
          absence_window_hours?: number | null
          audience_filter?: Json
          audience_type?: string | null
          created_at?: string
          description?: string | null
          goal?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          trigger_event?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      retention_message_log: {
        Row: {
          details: Json
          event_timestamp: string
          event_type: string
          id: string
          message_id: string
        }
        Insert: {
          details?: Json
          event_timestamp?: string
          event_type: string
          id?: string
          message_id: string
        }
        Update: {
          details?: Json
          event_timestamp?: string
          event_type?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_message_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "retention_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_messages: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          customer_id: string | null
          email_message_id: string | null
          flow_id: string | null
          flow_step_id: string | null
          id: string
          message_type: string
          metadata: Json
          org_id: string
          recipient_email: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          email_message_id?: string | null
          flow_id?: string | null
          flow_step_id?: string | null
          id?: string
          message_type?: string
          metadata?: Json
          org_id: string
          recipient_email: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          email_message_id?: string | null
          flow_id?: string | null
          flow_step_id?: string | null
          id?: string
          message_type?: string
          metadata?: Json
          org_id?: string
          recipient_email?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_messages_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "retention_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_messages_flow_step_id_fkey"
            columns: ["flow_step_id"]
            isOneToOne: false
            referencedRelation: "retention_flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_settings: {
        Row: {
          default_pause_days: number
          default_save_offer: string
          id: number
          inactivity_warning_days: number
          no_data_rescue_hours: number
          no_second_login_hours: number
          reply_to_email: string | null
          sender_email: string
          sender_name: string
          updated_at: string
          updated_by: string | null
          weekly_summary_enabled: boolean
        }
        Insert: {
          default_pause_days?: number
          default_save_offer?: string
          id?: number
          inactivity_warning_days?: number
          no_data_rescue_hours?: number
          no_second_login_hours?: number
          reply_to_email?: string | null
          sender_email?: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
          weekly_summary_enabled?: boolean
        }
        Update: {
          default_pause_days?: number
          default_save_offer?: string
          id?: number
          inactivity_warning_days?: number
          no_data_rescue_hours?: number
          no_second_login_hours?: number
          reply_to_email?: string | null
          sender_email?: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
          weekly_summary_enabled?: boolean
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          columns: Json | null
          created_at: string
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      security_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          metadata: Json
          org_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          site_id: string | null
          status: string
          summary: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          metadata?: Json
          org_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          site_id?: string | null
          status?: string
          summary: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          metadata?: Json
          org_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          site_id?: string | null
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          actor_type: string
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          message: string | null
          metadata: Json
          org_id: string | null
          request_id: string | null
          severity: string
          site_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          actor_type?: string
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          message?: string | null
          metadata?: Json
          org_id?: string | null
          request_id?: string | null
          severity?: string
          site_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          message?: string | null
          metadata?: Json
          org_id?: string | null
          request_id?: string | null
          severity?: string
          site_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_audit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          occurred_at: string
          org_id: string
          reviewed_at: string | null
          severity: string
          site_id: string
          title: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          occurred_at?: string
          org_id: string
          reviewed_at?: string | null
          severity?: string
          site_id: string
          title?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          occurred_at?: string
          org_id?: string
          reviewed_at?: string | null
          severity?: string
          site_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      security_findings: {
        Row: {
          created_at: string
          dedupe_key: string | null
          description: string
          id: string
          metadata: Json
          org_id: string
          recommended_fix: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          description: string
          id?: string
          metadata?: Json
          org_id: string
          recommended_fix?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          source?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          description?: string
          id?: string
          metadata?: Json
          org_id?: string
          recommended_fix?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_findings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incidents: {
        Row: {
          created_at: string
          id: string
          identified_at: string
          owner_user_id: string | null
          remediation_notes: string | null
          resolved_at: string | null
          severity: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identified_at?: string
          owner_user_id?: string | null
          remediation_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identified_at?: string
          owner_user_id?: string | null
          remediation_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_release_checks: {
        Row: {
          checked_by: string | null
          created_at: string
          id: string
          org_id: string
          reasons: Json
          score: number
          status: string
        }
        Insert: {
          checked_by?: string | null
          created_at?: string
          id?: string
          org_id: string
          reasons?: Json
          score: number
          status: string
        }
        Update: {
          checked_by?: string | null
          created_at?: string
          id?: string
          org_id?: string
          reasons?: Json
          score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_release_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_fix_history: {
        Row: {
          after_score: number | null
          before_score: number | null
          fixed_at: string
          id: string
          issue_id: string
          org_id: string
          page_url: string
          site_id: string
        }
        Insert: {
          after_score?: number | null
          before_score?: number | null
          fixed_at?: string
          id?: string
          issue_id: string
          org_id: string
          page_url: string
          site_id: string
        }
        Update: {
          after_score?: number | null
          before_score?: number | null
          fixed_at?: string
          id?: string
          issue_id?: string
          org_id?: string
          page_url?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_fix_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_fix_history_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_fix_queue: {
        Row: {
          applied_at: string | null
          created_at: string
          fix_type: string
          fix_value: string
          id: string
          issue_id: string
          org_id: string
          page_url: string
          scan_id: string | null
          site_id: string
          status: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          fix_type: string
          fix_value?: string
          id?: string
          issue_id: string
          org_id: string
          page_url: string
          scan_id?: string | null
          site_id: string
          status?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          fix_type?: string
          fix_value?: string
          id?: string
          issue_id?: string
          org_id?: string
          page_url?: string
          scan_id?: string | null
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_fix_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_fix_queue_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "seo_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_fix_queue_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_scans: {
        Row: {
          id: string
          issues_json: Json
          org_id: string
          platform: string | null
          recommendations_json: Json
          scanned_at: string
          score: number
          signals_json: Json | null
          site_id: string
          url: string
        }
        Insert: {
          id?: string
          issues_json?: Json
          org_id: string
          platform?: string | null
          recommendations_json?: Json
          scanned_at?: string
          score?: number
          signals_json?: Json | null
          site_id: string
          url: string
        }
        Update: {
          id?: string
          issues_json?: Json
          org_id?: string
          platform?: string | null
          recommendations_json?: Json
          scanned_at?: string
          score?: number
          signals_json?: Json | null
          site_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_scans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_scans_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      signed_request_nonces: {
        Row: {
          nonce: string
          org_id: string
          seen_at: string
        }
        Insert: {
          nonce: string
          org_id: string
          seen_at?: string
        }
        Update: {
          nonce?: string
          org_id?: string
          seen_at?: string
        }
        Relationships: []
      }
      site_credentials: {
        Row: {
          credential_type: string
          expires_at: string | null
          fingerprint_sha256: string
          id: string
          issued_at: string
          last_used_at: string | null
          last_used_ip_hash: string | null
          metadata: Json
          org_id: string
          revoked_at: string | null
          revoked_reason: string | null
          secret_hash: string
          site_id: string
          status: string
        }
        Insert: {
          credential_type?: string
          expires_at?: string | null
          fingerprint_sha256: string
          id?: string
          issued_at?: string
          last_used_at?: string | null
          last_used_ip_hash?: string | null
          metadata?: Json
          org_id: string
          revoked_at?: string | null
          revoked_reason?: string | null
          secret_hash: string
          site_id: string
          status?: string
        }
        Update: {
          credential_type?: string
          expires_at?: string | null
          fingerprint_sha256?: string
          id?: string
          issued_at?: string
          last_used_at?: string | null
          last_used_ip_hash?: string | null
          metadata?: Json
          org_id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          secret_hash?: string
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_credentials_site_id_fkey"
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
      site_ingest_tokens: {
        Row: {
          bound_domain: string
          created_at: string
          id: string
          last_used_at: string | null
          metadata: Json
          org_id: string
          revoked_at: string | null
          rotated_at: string | null
          scope: string
          site_id: string
          status: string
          token_hash: string
        }
        Insert: {
          bound_domain: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          org_id: string
          revoked_at?: string | null
          rotated_at?: string | null
          scope?: string
          site_id: string
          status?: string
          token_hash: string
        }
        Update: {
          bound_domain?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          org_id?: string
          revoked_at?: string | null
          rotated_at?: string | null
          scope?: string
          site_id?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_ingest_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_ingest_tokens_site_id_fkey"
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
      site_tracking_status: {
        Row: {
          consecutive_silent_checks: number
          events_last_hour: number
          heartbeats_last_hour: number
          id: string
          last_event_at: string | null
          last_heartbeat_at: string | null
          last_page_view_at: string | null
          org_id: string
          site_id: string
          tracker_status: string
          updated_at: string
          verifier_last_checked_at: string | null
          verifier_last_message: string | null
          verifier_last_status: string | null
        }
        Insert: {
          consecutive_silent_checks?: number
          events_last_hour?: number
          heartbeats_last_hour?: number
          id?: string
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_page_view_at?: string | null
          org_id: string
          site_id: string
          tracker_status?: string
          updated_at?: string
          verifier_last_checked_at?: string | null
          verifier_last_message?: string | null
          verifier_last_status?: string | null
        }
        Update: {
          consecutive_silent_checks?: number
          events_last_hour?: number
          heartbeats_last_hour?: number
          id?: string
          last_event_at?: string | null
          last_heartbeat_at?: string | null
          last_page_view_at?: string | null
          org_id?: string
          site_id?: string
          tracker_status?: string
          updated_at?: string
          verifier_last_checked_at?: string | null
          verifier_last_message?: string | null
          verifier_last_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_tracking_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_tracking_status_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visitors: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          org_id: string
          site_id: string
          visitor_id: string
          wp_user_email: string | null
          wp_user_email_hash: string | null
          wp_user_id: string | null
          wp_user_name: string | null
          wp_user_role: string | null
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          org_id: string
          site_id: string
          visitor_id: string
          wp_user_email?: string | null
          wp_user_email_hash?: string | null
          wp_user_id?: string | null
          wp_user_name?: string | null
          wp_user_role?: string | null
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          org_id?: string
          site_id?: string
          visitor_id?: string
          wp_user_email?: string | null
          wp_user_email_hash?: string | null
          wp_user_id?: string | null
          wp_user_name?: string | null
          wp_user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visitors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visitors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_wp_environment: {
        Row: {
          active_plugins: Json | null
          core_update_available: string | null
          id: string
          last_reported_at: string
          org_id: string
          php_version: string | null
          plugin_updates: Json | null
          site_id: string
          theme_name: string | null
          theme_version: string | null
          wp_version: string | null
        }
        Insert: {
          active_plugins?: Json | null
          core_update_available?: string | null
          id?: string
          last_reported_at?: string
          org_id: string
          php_version?: string | null
          plugin_updates?: Json | null
          site_id: string
          theme_name?: string | null
          theme_version?: string | null
          wp_version?: string | null
        }
        Update: {
          active_plugins?: Json | null
          core_update_available?: string | null
          id?: string
          last_reported_at?: string
          org_id?: string
          php_version?: string | null
          plugin_updates?: Json | null
          site_id?: string
          theme_name?: string | null
          theme_version?: string | null
          wp_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_wp_environment_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_wp_environment_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          allowed_domains: string[]
          created_at: string
          display_name: string | null
          domain: string
          down_after_minutes: number
          fail_count: number
          heartbeat_interval_minutes: number
          id: string
          last_form_discovery_at: string | null
          last_form_reconcile_at: string | null
          last_form_reconcile_status: string | null
          last_heartbeat_at: string | null
          name: string | null
          org_id: string
          plan_tier: string
          plugin_status: string | null
          plugin_status_checked_at: string | null
          plugin_status_detail: string | null
          plugin_version: string | null
          status: string
          type: string
          url: string | null
        }
        Insert: {
          allowed_domains?: string[]
          created_at?: string
          display_name?: string | null
          domain: string
          down_after_minutes?: number
          fail_count?: number
          heartbeat_interval_minutes?: number
          id?: string
          last_form_discovery_at?: string | null
          last_form_reconcile_at?: string | null
          last_form_reconcile_status?: string | null
          last_heartbeat_at?: string | null
          name?: string | null
          org_id: string
          plan_tier?: string
          plugin_status?: string | null
          plugin_status_checked_at?: string | null
          plugin_status_detail?: string | null
          plugin_version?: string | null
          status?: string
          type?: string
          url?: string | null
        }
        Update: {
          allowed_domains?: string[]
          created_at?: string
          display_name?: string | null
          domain?: string
          down_after_minutes?: number
          fail_count?: number
          heartbeat_interval_minutes?: number
          id?: string
          last_form_discovery_at?: string | null
          last_form_reconcile_at?: string | null
          last_form_reconcile_status?: string | null
          last_heartbeat_at?: string | null
          name?: string | null
          org_id?: string
          plan_tier?: string
          plugin_status?: string | null
          plugin_status_checked_at?: string | null
          plugin_status_detail?: string | null
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
      subscribers: {
        Row: {
          ai_calls_per_day_avg: number | null
          churn_date: string | null
          churn_reason: string | null
          created_at: string
          email: string
          features_used: Json | null
          id: string
          last_active_date: string | null
          mrr: number
          plan: string
          pricing_type: string
          referral_source: string | null
          report_downloads: number | null
          site_url: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          white_label_enabled: boolean
        }
        Insert: {
          ai_calls_per_day_avg?: number | null
          churn_date?: string | null
          churn_reason?: string | null
          created_at?: string
          email: string
          features_used?: Json | null
          id?: string
          last_active_date?: string | null
          mrr?: number
          plan?: string
          pricing_type?: string
          referral_source?: string | null
          report_downloads?: number | null
          site_url?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          white_label_enabled?: boolean
        }
        Update: {
          ai_calls_per_day_avg?: number | null
          churn_date?: string | null
          churn_reason?: string | null
          created_at?: string
          email?: string
          features_used?: Json | null
          id?: string
          last_active_date?: string | null
          mrr?: number
          plan?: string
          pricing_type?: string
          referral_source?: string | null
          report_downloads?: number | null
          site_url?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          white_label_enabled?: boolean
        }
        Relationships: []
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
      support_access_grants: {
        Row: {
          created_at: string
          duration_hours: number
          expires_at: string
          granted_at: string
          granted_by_email: string | null
          granted_by_user_id: string | null
          id: string
          last_staff_access_at: string | null
          metadata: Json
          org_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          site_id: string
          staff_access_count: number
          status: string
          updated_at: string
          wp_temp_username: string | null
          wp_user_created: boolean
          wp_user_deleted: boolean
        }
        Insert: {
          created_at?: string
          duration_hours?: number
          expires_at: string
          granted_at?: string
          granted_by_email?: string | null
          granted_by_user_id?: string | null
          id?: string
          last_staff_access_at?: string | null
          metadata?: Json
          org_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          site_id: string
          staff_access_count?: number
          status?: string
          updated_at?: string
          wp_temp_username?: string | null
          wp_user_created?: boolean
          wp_user_deleted?: boolean
        }
        Update: {
          created_at?: string
          duration_hours?: number
          expires_at?: string
          granted_at?: string
          granted_by_email?: string | null
          granted_by_user_id?: string | null
          id?: string
          last_staff_access_at?: string | null
          metadata?: Json
          org_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          site_id?: string
          staff_access_count?: number
          status?: string
          updated_at?: string
          wp_temp_username?: string | null
          wp_user_created?: boolean
          wp_user_deleted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "support_access_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_grants_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_log: {
        Row: {
          actor_email: string | null
          actor_type: string
          actor_user_id: string | null
          event_type: string
          grant_id: string | null
          id: string
          ip_hash: string | null
          message: string | null
          metadata: Json
          occurred_at: string
          org_id: string | null
          site_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_type?: string
          actor_user_id?: string | null
          event_type: string
          grant_id?: string | null
          id?: string
          ip_hash?: string | null
          message?: string | null
          metadata?: Json
          occurred_at?: string
          org_id?: string | null
          site_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_type?: string
          actor_user_id?: string | null
          event_type?: string
          grant_id?: string | null
          id?: string
          ip_hash?: string | null
          message?: string | null
          metadata?: Json
          occurred_at?: string
          org_id?: string | null
          site_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_access_log_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "support_access_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string | null
          mime_type: string | null
          ticket_id: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          ticket_id: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          message_id?: string | null
          mime_type?: string | null
          ticket_id?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "v_my_unread_support_replies"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          event_type: string
          id: string
          new_value: string | null
          old_value: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          event_type: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          event_type?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "v_my_unread_support_replies"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_email: string | null
          author_name: string | null
          author_type: string
          author_user_id: string | null
          created_at: string
          id: string
          is_internal: boolean
          message: string
          ticket_id: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          author_type: string
          author_user_id?: string | null
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          ticket_id: string
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          author_type?: string
          author_user_id?: string | null
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "v_my_unread_support_replies"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      support_ticket_reads: {
        Row: {
          last_read_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_reads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_reads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "v_my_unread_support_replies"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      support_ticket_satisfaction: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          rating: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_satisfaction_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_satisfaction_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "v_my_unread_support_replies"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          app_version: string | null
          assigned_to_user_id: string | null
          browser_info: string | null
          category: string | null
          closed_at: string | null
          created_at: string
          current_app_path: string | null
          id: string
          is_feature_request: boolean
          message: string
          metadata: Json
          org_id: string
          plan_name: string | null
          priority: string
          queue: string | null
          resolved_at: string | null
          site_id: string | null
          status: string
          subject: string
          submitted_by_email: string | null
          submitted_by_name: string | null
          submitted_by_user_id: string
          ticket_number: number
          type: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          app_version?: string | null
          assigned_to_user_id?: string | null
          browser_info?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          current_app_path?: string | null
          id?: string
          is_feature_request?: boolean
          message: string
          metadata?: Json
          org_id: string
          plan_name?: string | null
          priority?: string
          queue?: string | null
          resolved_at?: string | null
          site_id?: string | null
          status?: string
          subject: string
          submitted_by_email?: string | null
          submitted_by_name?: string | null
          submitted_by_user_id: string
          ticket_number?: number
          type: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          app_version?: string | null
          assigned_to_user_id?: string | null
          browser_info?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          current_app_path?: string | null
          id?: string
          is_feature_request?: boolean
          message?: string
          metadata?: Json
          org_id?: string
          plan_name?: string | null
          priority?: string
          queue?: string | null
          resolved_at?: string | null
          site_id?: string | null
          status?: string
          subject?: string
          submitted_by_email?: string | null
          submitted_by_name?: string | null
          submitted_by_user_id?: string
          ticket_number?: number
          type?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      system_events: {
        Row: {
          details: Json
          event_type: string
          id: number
          message: string | null
          occurred_at: string
          org_id: string | null
          severity: string
          site_id: string | null
          source: string | null
        }
        Insert: {
          details?: Json
          event_type: string
          id?: number
          message?: string | null
          occurred_at?: string
          org_id?: string | null
          severity?: string
          site_id?: string | null
          source?: string | null
        }
        Update: {
          details?: Json
          event_type?: string
          id?: number
          message?: string | null
          occurred_at?: string
          org_id?: string | null
          severity?: string
          site_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      team_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_role: string | null
          org_id: string
          previous_role: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_role?: string | null
          org_id: string
          previous_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_role?: string | null
          org_id?: string
          previous_role?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      technology_dependencies: {
        Row: {
          category: string
          created_at: string
          criticality: string
          description: string | null
          id: string
          monthly_cost: number | null
          name: string
          owner_notes: string | null
          replaceable: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          criticality?: string
          description?: string | null
          id?: string
          monthly_cost?: number | null
          name: string
          owner_notes?: string | null
          replaceable?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          criticality?: string
          description?: string | null
          id?: string
          monthly_cost?: number | null
          name?: string
          owner_notes?: string | null
          replaceable?: string
          updated_at?: string
        }
        Relationships: []
      }
      tracker_alerts: {
        Row: {
          acknowledged: boolean
          alert_type: string
          created_at: string
          details: Json
          id: string
          message: string
          org_id: string
          severity: string
          site_id: string
        }
        Insert: {
          acknowledged?: boolean
          alert_type: string
          created_at?: string
          details?: Json
          id?: string
          message?: string
          org_id: string
          severity?: string
          site_id: string
        }
        Update: {
          acknowledged?: boolean
          alert_type?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string
          org_id?: string
          severity?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracker_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_health: {
        Row: {
          details: Json
          endpoint: string
          id: string
          last_event_at: string
          last_status: string | null
          org_id: string
          site_id: string | null
          total_events: number
          updated_at: string
        }
        Insert: {
          details?: Json
          endpoint: string
          id?: string
          last_event_at?: string
          last_status?: string | null
          org_id: string
          site_id?: string | null
          total_events?: number
          updated_at?: string
        }
        Update: {
          details?: Json
          endpoint?: string
          id?: string
          last_event_at?: string
          last_status?: string | null
          org_id?: string
          site_id?: string | null
          total_events?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_health_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_health_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_interruptions: {
        Row: {
          created_at: string
          customer_email_recipient: string | null
          customer_email_sent_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          org_id: string
          resolved: boolean
          site_id: string
          started_at: string
          trigger_reason: string
        }
        Insert: {
          created_at?: string
          customer_email_recipient?: string | null
          customer_email_sent_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          org_id: string
          resolved?: boolean
          site_id: string
          started_at?: string
          trigger_reason?: string
        }
        Update: {
          created_at?: string
          customer_email_recipient?: string | null
          customer_email_sent_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          org_id?: string
          resolved?: boolean
          site_id?: string
          started_at?: string
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_interruptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_interruptions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      user_activity_log: {
        Row: {
          activity_type: string
          created_at: string
          details: Json | null
          id: string
          org_id: string | null
          page_path: string | null
          page_title: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          details?: Json | null
          id?: string
          org_id?: string | null
          page_path?: string | null
          page_title?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          org_id?: string | null
          page_path?: string | null
          page_title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_org_id_fkey"
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
      user_two_factor: {
        Row: {
          email_enabled: boolean
          enabled_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          enabled_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          enabled_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      valuation_comparables: {
        Row: {
          arr: number | null
          company_name: string
          created_at: string
          created_by_user_id: string | null
          deal_value: number | null
          ebitda: number | null
          ev_arr_multiple: number | null
          ev_ebitda_multiple: number | null
          ev_revenue_multiple: number | null
          growth_rate_pct: number | null
          id: string
          industry: string | null
          revenue: number | null
          source_notes: string | null
          ticker: string | null
          transaction_date: string | null
          transaction_type: string
          updated_at: string
        }
        Insert: {
          arr?: number | null
          company_name: string
          created_at?: string
          created_by_user_id?: string | null
          deal_value?: number | null
          ebitda?: number | null
          ev_arr_multiple?: number | null
          ev_ebitda_multiple?: number | null
          ev_revenue_multiple?: number | null
          growth_rate_pct?: number | null
          id?: string
          industry?: string | null
          revenue?: number | null
          source_notes?: string | null
          ticker?: string | null
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Update: {
          arr?: number | null
          company_name?: string
          created_at?: string
          created_by_user_id?: string | null
          deal_value?: number | null
          ebitda?: number | null
          ev_arr_multiple?: number | null
          ev_ebitda_multiple?: number | null
          ev_revenue_multiple?: number | null
          growth_rate_pct?: number | null
          id?: string
          industry?: string | null
          revenue?: number | null
          source_notes?: string | null
          ticker?: string | null
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      valuation_scenarios: {
        Row: {
          base_arr: number | null
          base_ebitda: number | null
          base_revenue: number | null
          computed_breakdown: Json | null
          computed_high: number | null
          computed_low: number | null
          computed_mid: number | null
          created_at: string
          created_by_user_id: string | null
          dcf_discount_rate_pct: number | null
          dcf_fcf_margin_pct: number | null
          dcf_projection_years: number
          dcf_terminal_growth_pct: number | null
          dcf_terminal_multiple: number | null
          description: string | null
          ebitda_margin_pct: number | null
          ev_arr_multiple_high: number | null
          ev_arr_multiple_low: number | null
          ev_arr_multiple_mid: number | null
          ev_ebitda_multiple_high: number | null
          ev_ebitda_multiple_low: number | null
          ev_ebitda_multiple_mid: number | null
          ev_revenue_multiple_high: number | null
          ev_revenue_multiple_low: number | null
          ev_revenue_multiple_mid: number | null
          growth_rate_pct: number | null
          id: string
          is_primary: boolean
          scenario_name: string
          updated_at: string
        }
        Insert: {
          base_arr?: number | null
          base_ebitda?: number | null
          base_revenue?: number | null
          computed_breakdown?: Json | null
          computed_high?: number | null
          computed_low?: number | null
          computed_mid?: number | null
          created_at?: string
          created_by_user_id?: string | null
          dcf_discount_rate_pct?: number | null
          dcf_fcf_margin_pct?: number | null
          dcf_projection_years?: number
          dcf_terminal_growth_pct?: number | null
          dcf_terminal_multiple?: number | null
          description?: string | null
          ebitda_margin_pct?: number | null
          ev_arr_multiple_high?: number | null
          ev_arr_multiple_low?: number | null
          ev_arr_multiple_mid?: number | null
          ev_ebitda_multiple_high?: number | null
          ev_ebitda_multiple_low?: number | null
          ev_ebitda_multiple_mid?: number | null
          ev_revenue_multiple_high?: number | null
          ev_revenue_multiple_low?: number | null
          ev_revenue_multiple_mid?: number | null
          growth_rate_pct?: number | null
          id?: string
          is_primary?: boolean
          scenario_name: string
          updated_at?: string
        }
        Update: {
          base_arr?: number | null
          base_ebitda?: number | null
          base_revenue?: number | null
          computed_breakdown?: Json | null
          computed_high?: number | null
          computed_low?: number | null
          computed_mid?: number | null
          created_at?: string
          created_by_user_id?: string | null
          dcf_discount_rate_pct?: number | null
          dcf_fcf_margin_pct?: number | null
          dcf_projection_years?: number
          dcf_terminal_growth_pct?: number | null
          dcf_terminal_multiple?: number | null
          description?: string | null
          ebitda_margin_pct?: number | null
          ev_arr_multiple_high?: number | null
          ev_arr_multiple_low?: number | null
          ev_arr_multiple_mid?: number | null
          ev_ebitda_multiple_high?: number | null
          ev_ebitda_multiple_low?: number | null
          ev_ebitda_multiple_mid?: number | null
          ev_revenue_multiple_high?: number | null
          ev_revenue_multiple_low?: number | null
          ev_revenue_multiple_mid?: number | null
          growth_rate_pct?: number | null
          id?: string
          is_primary?: boolean
          scenario_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_risk_registry: {
        Row: {
          backup_plan: string | null
          category: string | null
          contract_renewal_date: string | null
          contract_status: string | null
          created_at: string
          criticality: string | null
          dependency_notes: string | null
          id: string
          monthly_cost: number | null
          risk_level: string | null
          updated_at: string
          vendor_name: string
        }
        Insert: {
          backup_plan?: string | null
          category?: string | null
          contract_renewal_date?: string | null
          contract_status?: string | null
          created_at?: string
          criticality?: string | null
          dependency_notes?: string | null
          id?: string
          monthly_cost?: number | null
          risk_level?: string | null
          updated_at?: string
          vendor_name: string
        }
        Update: {
          backup_plan?: string | null
          category?: string | null
          contract_renewal_date?: string | null
          contract_status?: string | null
          created_at?: string
          criticality?: string | null
          dependency_notes?: string | null
          id?: string
          monthly_cost?: number | null
          risk_level?: string | null
          updated_at?: string
          vendor_name?: string
        }
        Relationships: []
      }
      webhook_verification_log: {
        Row: {
          event_id: string | null
          failure_reason: string | null
          id: string
          metadata: Json
          occurred_at: string
          provider: string
          request_id: string | null
          verification_status: string
        }
        Insert: {
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          provider: string
          request_id?: string | null
          verification_status: string
        }
        Update: {
          event_id?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          provider?: string
          request_id?: string | null
          verification_status?: string
        }
        Relationships: []
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
      white_label_settings: {
        Row: {
          accent_color: string | null
          client_name: string | null
          created_at: string
          hide_actv_branding: boolean | null
          id: string
          logo_url: string | null
          org_id: string
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          client_name?: string | null
          created_at?: string
          hide_actv_branding?: boolean | null
          id?: string
          logo_url?: string | null
          org_id: string
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          client_name?: string | null
          created_at?: string
          hide_actv_branding?: boolean | null
          id?: string
          logo_url?: string | null
          org_id?: string
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "white_label_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      site_visitors_safe: {
        Row: {
          first_seen_at: string | null
          id: string | null
          last_seen_at: string | null
          org_id: string | null
          site_id: string | null
          visitor_id: string | null
          wp_user_email_hash: string | null
          wp_user_id: string | null
          wp_user_name: string | null
          wp_user_role: string | null
        }
        Insert: {
          first_seen_at?: string | null
          id?: string | null
          last_seen_at?: string | null
          org_id?: string | null
          site_id?: string | null
          visitor_id?: string | null
          wp_user_email_hash?: string | null
          wp_user_id?: string | null
          wp_user_name?: string | null
          wp_user_role?: string | null
        }
        Update: {
          first_seen_at?: string | null
          id?: string | null
          last_seen_at?: string | null
          org_id?: string | null
          site_id?: string | null
          visitor_id?: string | null
          wp_user_email_hash?: string | null
          wp_user_id?: string | null
          wp_user_name?: string | null
          wp_user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visitors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visitors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      v_my_unread_support_replies: {
        Row: {
          latest_admin_reply_at: string | null
          org_id: string | null
          subject: string | null
          ticket_id: string | null
          ticket_number: number | null
          unread_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_delete_org_record: { Args: { p_org_id: string }; Returns: Json }
      admin_wipe_org_chunk: {
        Args: { p_batch_size?: number; p_org_id: string; p_table: string }
        Returns: Json
      }
      admin_wipe_org_data: { Args: { p_org_id: string }; Returns: Json }
      calculate_engagement_score: {
        Args: { p_org_id: string; p_session_id: string }
        Returns: number
      }
      call_edge_function: {
        Args: { body?: Json; function_name: string }
        Returns: undefined
      }
      check_password_reset_rate_limit: {
        Args: { p_email: string }
        Returns: boolean
      }
      compute_account_lifecycle_stage: {
        Args: { p_org_id: string }
        Returns: string
      }
      compute_security_score: { Args: { p_org_id: string }; Returns: Json }
      create_org_with_admin:
        | {
            Args: { p_name: string; p_org_id: string; p_timezone?: string }
            Returns: string
          }
        | {
            Args: {
              p_allow_existing?: boolean
              p_name: string
              p_org_id: string
              p_timezone?: string
            }
            Returns: string
          }
      customer_resolve_ticket: {
        Args: { _ticket_id: string }
        Returns: undefined
      }
      decrypt_admin_note: { Args: { p_ciphertext: string }; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      emit_retention_event: {
        Args: {
          p_customer_id?: string
          p_event_category?: string
          p_event_name: string
          p_event_value?: Json
          p_first_time_only?: boolean
          p_occurred_at?: string
          p_org_id: string
          p_site_id?: string
          p_source?: string
          p_user_id?: string
        }
        Returns: string
      }
      encrypt_admin_note: { Args: { p_plaintext: string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_old_support_grants: { Args: never; Returns: number }
      feature_enabled: {
        Args: { p_flag_key: string; p_org_id?: string; p_site_id?: string }
        Returns: boolean
      }
      get_lead_counts_by_form: {
        Args: { p_org_id: string }
        Returns: {
          form_id: string
          lead_count: number
        }[]
      }
      get_retention_cohorts: {
        Args: { p_weeks?: number }
        Returns: {
          active_count: number
          cohort_size: number
          cohort_week: string
          retention_pct: number
          week_offset: number
        }[]
      }
      get_session_journey_stats: {
        Args: {
          p_end: string
          p_org_id: string
          p_site_id?: string
          p_start: string
        }
        Returns: Json
      }
      get_session_journeys: {
        Args: {
          p_end: string
          p_limit?: number
          p_offset?: number
          p_org_id: string
          p_outcome?: string
          p_site_id?: string
          p_start: string
        }
        Returns: {
          active_seconds: number
          country_code: string
          device: string
          duration_seconds: number
          ended_at: string
          engagement_score: number
          exit_at: string
          exit_page_path: string
          exit_page_title: string
          has_conversion: boolean
          has_lead: boolean
          landing_page_path: string
          landing_referrer_domain: string
          pageview_count: number
          session_id: string
          site_id: string
          started_at: string
          total_count: number
          utm_campaign: string
          utm_medium: string
          utm_source: string
          visitor_id: string
        }[]
      }
      get_site_contacts: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_org_id: string
          p_search?: string
        }
        Returns: {
          customer_consent_status: string
          display_name: string
          email: string
          first_seen_at: string
          last_seen_at: string
          lead_count: number
          source_forms: string[]
          source_pages: string[]
          source_sites: string[]
          tags: string[]
          total_count: number
          utm_campaign: string
          utm_content: string
          utm_medium: string
          utm_source: string
          utm_term: string
        }[]
      }
      get_support_activity_for_org: {
        Args: { _limit?: number; _org_id: string }
        Returns: {
          action: string
          admin_display_name: string
          admin_user_id: string
          entry_id: string
          grant_expires_at: string
          grant_granted_at: string
          grant_id: string
          grant_revoked_at: string
          grant_source: string
          metadata: Json
          occurred_at: string
          resource_id: string
          resource_type: string
        }[]
      }
      get_top_exit_pages: {
        Args: {
          p_end_date: string
          p_limit?: number
          p_org_id: string
          p_start_date: string
        }
        Returns: {
          exit_rate: number
          page_path: string
          page_url: string
          title: string
          total_exits: number
          total_pageviews_on_page: number
        }[]
      }
      has_active_dashboard_grant: {
        Args: { _org_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_invite_use: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      increment_rate_limit: {
        Args: { p_function_name: string; p_user_id: string }
        Returns: undefined
      }
      is_last_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_org_owner: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      log_rate_limit_observation: {
        Args: {
          p_bucket_key: string
          p_bucket_type: string
          p_details?: Json
          p_endpoint: string
          p_observed_count: number
          p_org_id: string
          p_site_id: string
          p_threshold: number
          p_would_block: boolean
        }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          p_actor_type?: string
          p_event_type: string
          p_ip_hash?: string
          p_message?: string
          p_metadata?: Json
          p_org_id?: string
          p_request_id?: string
          p_severity?: string
          p_site_id?: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: string
      }
      mark_invite_accepted: { Args: never; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      purge_auth_hardening_stale: { Args: never; Returns: undefined }
      purge_expired_mfa_codes: { Args: never; Returns: undefined }
      qa_check_has_role_definer: {
        Args: never
        Returns: {
          exists_flag: boolean
          is_security_definer: boolean
          prosrc_excerpt: string
        }[]
      }
      qa_check_pgmq_queue_depth: {
        Args: never
        Returns: {
          oldest_msg_age_seconds: number
          qname: string
          queue_length: number
        }[]
      }
      qa_check_rls_status: {
        Args: never
        Returns: {
          rls_enabled: boolean
          table_name: string
        }[]
      }
      qa_get_cron_last_runs: {
        Args: { jobname_patterns: string[] }
        Returns: {
          jobname: string
          last_run_started_at: string
          last_run_status: string
        }[]
      }
      qa_list_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          schedule: string
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_account_health: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      recompute_all_account_health: { Args: never; Returns: number }
      record_security_release_check: {
        Args: { p_org_id: string }
        Returns: Json
      }
      replace_org_api_key: {
        Args: { _label?: string; _new_key_hash: string; _org_id: string }
        Returns: string
      }
      set_org_lifecycle_status: {
        Args: {
          p_org_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["org_lifecycle_status"]
        }
        Returns: undefined
      }
      touch_tracking_health: {
        Args: {
          p_endpoint: string
          p_org_id: string
          p_site_id: string
          p_status?: string
        }
        Returns: undefined
      }
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
      mc_consent_status:
        | "unknown"
        | "not_opted_in"
        | "opted_in"
        | "unsubscribed"
        | "bounced"
        | "complained"
        | "suppressed"
      mc_email_provider:
        | "none"
        | "mailchimp"
        | "brevo"
        | "loops"
        | "customer_io"
        | "other"
      mc_event_type:
        | "opt_in"
        | "unsubscribe"
        | "export"
        | "sync_attempt"
        | "suppress"
        | "status_change"
        | "recipient_added"
        | "bounce"
        | "complaint"
      mc_lifecycle_stage:
        | "prospect"
        | "trial_user"
        | "subscriber"
        | "team_user"
        | "churned"
        | "suppressed"
      mc_source:
        | "signup"
        | "trial"
        | "early_access"
        | "demo_request"
        | "manual_import"
        | "team_invite"
        | "report_subscribe_link"
        | "other"
      org_lifecycle_status: "active" | "grace_period" | "archived"
      release_qa_check_status:
        | "pass"
        | "fail"
        | "warn"
        | "not_run"
        | "manual_pending"
        | "error"
      release_qa_status:
        | "running"
        | "passed"
        | "passed_with_warnings"
        | "failed"
        | "cancelled"
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
      mc_consent_status: [
        "unknown",
        "not_opted_in",
        "opted_in",
        "unsubscribed",
        "bounced",
        "complained",
        "suppressed",
      ],
      mc_email_provider: [
        "none",
        "mailchimp",
        "brevo",
        "loops",
        "customer_io",
        "other",
      ],
      mc_event_type: [
        "opt_in",
        "unsubscribe",
        "export",
        "sync_attempt",
        "suppress",
        "status_change",
        "recipient_added",
        "bounce",
        "complaint",
      ],
      mc_lifecycle_stage: [
        "prospect",
        "trial_user",
        "subscriber",
        "team_user",
        "churned",
        "suppressed",
      ],
      mc_source: [
        "signup",
        "trial",
        "early_access",
        "demo_request",
        "manual_import",
        "team_invite",
        "report_subscribe_link",
        "other",
      ],
      org_lifecycle_status: ["active", "grace_period", "archived"],
      release_qa_check_status: [
        "pass",
        "fail",
        "warn",
        "not_run",
        "manual_pending",
        "error",
      ],
      release_qa_status: [
        "running",
        "passed",
        "passed_with_warnings",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
