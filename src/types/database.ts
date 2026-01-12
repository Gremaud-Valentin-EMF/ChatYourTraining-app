export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SportType =
  | "running"
  | "cycling"
  | "swimming"
  | "strength"
  | "triathlon"
  | "other";
export type ActivityStatus =
  | "planned"
  | "completed"
  | "skipped"
  | "in_progress";
export type IntegrationProvider = "strava" | "whoop" | "garmin" | "manual";
export type ObjectivePriority = "A" | "B" | "C";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          timezone: string;
          locale: string;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          locale?: string;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          locale?: string;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      physiological_data: {
        Row: {
          id: string;
          user_id: string;
          weight_kg: number | null;
          height_cm: number | null;
          birth_date: string | null;
          hr_max: number | null;
          hr_rest: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          weight_kg?: number | null;
          height_cm?: number | null;
          birth_date?: string | null;
          hr_max?: number | null;
          hr_rest?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          weight_kg?: number | null;
          height_cm?: number | null;
          birth_date?: string | null;
          hr_max?: number | null;
          hr_rest?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sports: {
        Row: {
          id: string;
          name: string;
          icon: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          icon: string;
          color: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string;
          color?: string;
          created_at?: string;
        };
      };
      user_sports: {
        Row: {
          id: string;
          user_id: string;
          sport_id: string;
          level: string;
          vma_kmh: number | null;
          ftp_watts: number | null;
          css_per_100m: number | null;
          target_hours_per_week: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sport_id: string;
          level?: string;
          vma_kmh?: number | null;
          ftp_watts?: number | null;
          css_per_100m?: number | null;
          target_hours_per_week?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sport_id?: string;
          level?: string;
          vma_kmh?: number | null;
          ftp_watts?: number | null;
          css_per_100m?: number | null;
          target_hours_per_week?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      objectives: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          event_date: string;
          event_type: string;
          priority: ObjectivePriority;
          target_time: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          event_date: string;
          event_type: string;
          priority?: ObjectivePriority;
          target_time?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          event_date?: string;
          event_type?: string;
          priority?: ObjectivePriority;
          target_time?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      activities: {
        Row: {
          id: string;
          user_id: string;
          sport_id: string;
          title: string;
          description: string | null;
          scheduled_date: string;
          completed_date: string | null;
          status: ActivityStatus;
          planned_duration_minutes: number | null;
          actual_duration_minutes: number | null;
          planned_distance_km: number | null;
          actual_distance_km: number | null;
          elevation_gain_m: number | null;
          avg_hr: number | null;
          max_hr: number | null;
          avg_power_watts: number | null;
          avg_pace_per_km: string | null;
          tss: number | null;
          rpe: number | null;
          intensity: string | null;
          source: IntegrationProvider;
          external_id: string | null;
          raw_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sport_id: string;
          title: string;
          description?: string | null;
          scheduled_date: string;
          completed_date?: string | null;
          status?: ActivityStatus;
          planned_duration_minutes?: number | null;
          actual_duration_minutes?: number | null;
          planned_distance_km?: number | null;
          actual_distance_km?: number | null;
          elevation_gain_m?: number | null;
          avg_hr?: number | null;
          max_hr?: number | null;
          avg_power_watts?: number | null;
          avg_pace_per_km?: string | null;
          tss?: number | null;
          rpe?: number | null;
          intensity?: string | null;
          source?: IntegrationProvider;
          external_id?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sport_id?: string;
          title?: string;
          description?: string | null;
          scheduled_date?: string;
          completed_date?: string | null;
          status?: ActivityStatus;
          planned_duration_minutes?: number | null;
          actual_duration_minutes?: number | null;
          planned_distance_km?: number | null;
          actual_distance_km?: number | null;
          elevation_gain_m?: number | null;
          avg_hr?: number | null;
          max_hr?: number | null;
          avg_power_watts?: number | null;
          avg_pace_per_km?: string | null;
          tss?: number | null;
          rpe?: number | null;
          intensity?: string | null;
          source?: IntegrationProvider;
          external_id?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      daily_metrics: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          recovery_score: number | null;
          sleep_score: number | null;
          sleep_duration_minutes: number | null;
          sleep_deep_minutes: number | null;
          sleep_rem_minutes: number | null;
          sleep_light_minutes: number | null;
          sleep_awake_minutes: number | null;
          hrv_ms: number | null;
          resting_hr: number | null;
          respiratory_rate: number | null;
          strain: number | null;
          stress_level: number | null;
          mood: number | null;
          fatigue_level: number | null;
          notes: string | null;
          source: IntegrationProvider;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          recovery_score?: number | null;
          sleep_score?: number | null;
          sleep_duration_minutes?: number | null;
          sleep_deep_minutes?: number | null;
          sleep_rem_minutes?: number | null;
          sleep_light_minutes?: number | null;
          sleep_awake_minutes?: number | null;
          hrv_ms?: number | null;
          resting_hr?: number | null;
          respiratory_rate?: number | null;
          strain?: number | null;
          stress_level?: number | null;
          mood?: number | null;
          fatigue_level?: number | null;
          notes?: string | null;
          source?: IntegrationProvider;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          recovery_score?: number | null;
          sleep_score?: number | null;
          sleep_duration_minutes?: number | null;
          sleep_deep_minutes?: number | null;
          sleep_rem_minutes?: number | null;
          sleep_light_minutes?: number | null;
          sleep_awake_minutes?: number | null;
          hrv_ms?: number | null;
          resting_hr?: number | null;
          respiratory_rate?: number | null;
          strain?: number | null;
          stress_level?: number | null;
          mood?: number | null;
          fatigue_level?: number | null;
          notes?: string | null;
          source?: IntegrationProvider;
          created_at?: string;
          updated_at?: string;
        };
      };
      integrations: {
        Row: {
          id: string;
          user_id: string;
          provider: IntegrationProvider;
          access_token: string;
          refresh_token: string | null;
          token_expires_at: string | null;
          scopes: string[] | null;
          is_active: boolean;
          last_sync_at: string | null;
          sync_errors: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: IntegrationProvider;
          access_token: string;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          scopes?: string[] | null;
          is_active?: boolean;
          last_sync_at?: string | null;
          sync_errors?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: IntegrationProvider;
          access_token?: string;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          scopes?: string[] | null;
          is_active?: boolean;
          last_sync_at?: string | null;
          sync_errors?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      integration_preferences: {
        Row: {
          id: string;
          user_id: string;
          data_type: string;
          preferred_provider: IntegrationProvider;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          data_type: string;
          preferred_provider: IntegrationProvider;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          data_type?: string;
          preferred_provider?: IntegrationProvider;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          context_snapshot: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          context_snapshot?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: "user" | "assistant" | "system";
          content?: string;
          context_snapshot?: Json | null;
          created_at?: string;
        };
      };
      training_load: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          daily_tss: number;
          atl: number;
          ctl: number;
          tsb: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          daily_tss?: number;
          atl?: number;
          ctl?: number;
          tsb?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          daily_tss?: number;
          atl?: number;
          ctl?: number;
          tsb?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Helper types
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// Convenience types
export type User = Tables<"users">;
export type PhysiologicalData = Tables<"physiological_data">;
export type Sport = Tables<"sports">;
export type UserSport = Tables<"user_sports">;
export type Objective = Tables<"objectives">;
export type Activity = Tables<"activities">;
export type DailyMetrics = Tables<"daily_metrics">;
export type Integration = Tables<"integrations">;
export type IntegrationPreference = Tables<"integration_preferences">;
export type ChatSession = Tables<"chat_sessions">;
export type ChatMessage = Tables<"chat_messages">;
export type TrainingLoad = Tables<"training_load">;
