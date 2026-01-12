-- ChatYourTraining Database Schema
-- Version: 1.0.0
-- Description: Complete database schema for the MVP

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    timezone TEXT DEFAULT 'Europe/Paris',
    locale TEXT DEFAULT 'fr',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- PHYSIOLOGICAL DATA TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.physiological_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    weight_kg DECIMAL(5,2),
    height_cm INTEGER,
    birth_date DATE,
    hr_max INTEGER,
    hr_rest INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

ALTER TABLE public.physiological_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own physio data" ON public.physiological_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own physio data" ON public.physiological_data
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own physio data" ON public.physiological_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- SPORTS TABLE (Reference table)
-- ============================================
CREATE TABLE IF NOT EXISTS public.sports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    name_fr TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default sports with fixed UUIDs
INSERT INTO public.sports (id, name, name_fr, icon, color) VALUES
    ('00000000-0000-0000-0000-000000000001', 'running', 'Course à pied', 'running', '#00d4aa'),
    ('00000000-0000-0000-0000-000000000002', 'cycling', 'Cyclisme', 'bike', '#3b82f6'),
    ('00000000-0000-0000-0000-000000000003', 'swimming', 'Natation', 'waves', '#06b6d4'),
    ('00000000-0000-0000-0000-000000000004', 'triathlon', 'Triathlon', 'trophy', '#8b5cf6'),
    ('00000000-0000-0000-0000-000000000005', 'strength', 'Renforcement', 'dumbbell', '#f59e0b'),
    ('00000000-0000-0000-0000-000000000006', 'other', 'Autre', 'activity', '#6b7280')
ON CONFLICT (name) DO NOTHING;

-- Sports are public (read-only for everyone)
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sports are publicly readable" ON public.sports
    FOR SELECT TO authenticated USING (true);

-- ============================================
-- USER SPORTS TABLE (User's practiced sports)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_sports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
    level TEXT DEFAULT 'intermediate' CHECK (level IN ('beginner', 'intermediate', 'advanced', 'elite')),
    vma_kmh DECIMAL(4,1),           -- Running VMA in km/h
    ftp_watts INTEGER,               -- Cycling FTP in watts
    css_per_100m INTEGER,            -- Swimming CSS in seconds per 100m
    target_hours_per_week DECIMAL(4,1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sport_id)
);

ALTER TABLE public.user_sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sports" ON public.user_sports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own sports" ON public.user_sports
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- OBJECTIVES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.objectives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_type TEXT NOT NULL,
    priority CHAR(1) DEFAULT 'B' CHECK (priority IN ('A', 'B', 'C')),
    target_time INTERVAL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own objectives" ON public.objectives
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own objectives" ON public.objectives
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- ACTIVITIES TABLE
-- ============================================
CREATE TYPE activity_status AS ENUM ('planned', 'completed', 'skipped', 'in_progress');
CREATE TYPE integration_provider AS ENUM ('strava', 'whoop', 'garmin', 'manual');

CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sport_id UUID NOT NULL REFERENCES public.sports(id),
    title TEXT NOT NULL,
    description TEXT,
    scheduled_date DATE NOT NULL,
    completed_date TIMESTAMPTZ,
    status activity_status DEFAULT 'planned',
    -- Planned metrics
    planned_duration_minutes INTEGER,
    planned_distance_km DECIMAL(6,2),
    -- Actual metrics
    actual_duration_minutes INTEGER,
    actual_distance_km DECIMAL(6,2),
    elevation_gain_m INTEGER,
    avg_hr INTEGER,
    max_hr INTEGER,
    avg_power_watts INTEGER,
    avg_pace_per_km INTERVAL,
    -- Training load
    tss INTEGER,                    -- Training Stress Score
    rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10),  -- Rate of Perceived Exertion
    intensity TEXT CHECK (intensity IN ('recovery', 'endurance', 'tempo', 'threshold', 'vo2max', 'anaerobic')),
    -- Source tracking
    source integration_provider DEFAULT 'manual',
    external_id TEXT,               -- ID from external source (Strava, etc.)
    raw_data JSONB,                 -- Raw data from external source
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_activities_user_date ON public.activities(user_id, scheduled_date);
CREATE INDEX idx_activities_user_status ON public.activities(user_id, status);
CREATE INDEX idx_activities_external ON public.activities(source, external_id);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activities" ON public.activities
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own activities" ON public.activities
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- DAILY METRICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    -- Recovery & Sleep
    recovery_score INTEGER CHECK (recovery_score >= 0 AND recovery_score <= 100),
    sleep_score INTEGER CHECK (sleep_score >= 0 AND sleep_score <= 100),
    sleep_duration_minutes INTEGER,
    sleep_deep_minutes INTEGER,
    sleep_rem_minutes INTEGER,
    sleep_light_minutes INTEGER,
    sleep_awake_minutes INTEGER,
    -- Biometrics
    hrv_ms INTEGER,                 -- Heart Rate Variability
    resting_hr INTEGER,
    respiratory_rate DECIMAL(4,1),
    -- Subjective
    strain DECIMAL(4,2),            -- Whoop strain
    stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10),
    mood INTEGER CHECK (mood >= 1 AND mood <= 5),
    fatigue_level INTEGER CHECK (fatigue_level >= 1 AND fatigue_level <= 10),
    notes TEXT,
    -- Source
    source integration_provider DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_metrics_user_date ON public.daily_metrics(user_id, date DESC);

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics" ON public.daily_metrics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own metrics" ON public.daily_metrics
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INTEGRATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider integration_provider NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    sync_errors JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations" ON public.integrations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own integrations" ON public.integrations
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INTEGRATION PREFERENCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.integration_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL CHECK (data_type IN ('workouts', 'sleep', 'recovery', 'nutrition')),
    preferred_provider integration_provider NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, data_type)
);

ALTER TABLE public.integration_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.integration_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own preferences" ON public.integration_preferences
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRAINING LOAD TABLE (Calculated metrics)
-- ============================================
CREATE TABLE IF NOT EXISTS public.training_load (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    daily_tss INTEGER DEFAULT 0,
    atl DECIMAL(6,2) DEFAULT 0,     -- Acute Training Load (7-day)
    ctl DECIMAL(6,2) DEFAULT 0,     -- Chronic Training Load (42-day)
    tsb DECIMAL(6,2) DEFAULT 0,     -- Training Stress Balance (CTL - ATL)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_training_load_user_date ON public.training_load(user_id, date DESC);

ALTER TABLE public.training_load ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own training load" ON public.training_load
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own training load" ON public.training_load
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- CHAT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON public.chat_sessions(user_id, created_at DESC);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- CHAT MESSAGES TABLE
-- ============================================
CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role chat_role NOT NULL,
    content TEXT NOT NULL,
    context_snapshot JSONB,         -- Snapshot of athlete context at message time
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON public.chat_messages(session_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Messages are accessible via their session
CREATE POLICY "Users can view own chat messages" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions s
            WHERE s.id = chat_messages.session_id
            AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own chat messages" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_sessions s
            WHERE s.id = chat_messages.session_id
            AND s.user_id = auth.uid()
        )
    );

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_physiological_data_updated_at
    BEFORE UPDATE ON public.physiological_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sports_updated_at
    BEFORE UPDATE ON public.user_sports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_objectives_updated_at
    BEFORE UPDATE ON public.objectives
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activities_updated_at
    BEFORE UPDATE ON public.activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_metrics_updated_at
    BEFORE UPDATE ON public.daily_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
    BEFORE UPDATE ON public.integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_preferences_updated_at
    BEFORE UPDATE ON public.integration_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_load_updated_at
    BEFORE UPDATE ON public.training_load
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- VIEWS
-- ============================================

-- View for user dashboard summary
CREATE OR REPLACE VIEW public.user_dashboard_summary AS
SELECT 
    u.id as user_id,
    u.full_name,
    u.avatar_url,
    pd.weight_kg,
    pd.hr_max,
    pd.hr_rest,
    (SELECT COUNT(*) FROM public.activities a WHERE a.user_id = u.id AND a.status = 'completed') as total_activities,
    (SELECT SUM(actual_duration_minutes) FROM public.activities a WHERE a.user_id = u.id AND a.status = 'completed') as total_duration_minutes,
    (SELECT SUM(actual_distance_km) FROM public.activities a WHERE a.user_id = u.id AND a.status = 'completed') as total_distance_km
FROM public.users u
LEFT JOIN public.physiological_data pd ON pd.user_id = u.id;

-- Grant access to the view
GRANT SELECT ON public.user_dashboard_summary TO authenticated;
