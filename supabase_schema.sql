-- ==============================================================================
-- EXAM MODULE — COMPLETE SUPABASE SCHEMA (with Sections Support)
-- Run this in Supabase SQL Editor (drop all tables first, or run on a fresh DB)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. USERS Table (ex_users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    raw_password  TEXT,
    role          TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (role IN ('SUPER_ADMIN', 'EXAMINER', 'PROCTOR', 'EVALUATOR', 'CANDIDATE')),
    roll_number   TEXT,
    created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 2. EXAMS Table (ex_exams)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_exams (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    duration_minutes    INTEGER DEFAULT 60 NOT NULL,
    total_marks         INTEGER DEFAULT 100 NOT NULL,
    pass_marks          INTEGER DEFAULT 40 NOT NULL,
    status              TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED')),
    proctoring_enabled  BOOLEAN DEFAULT true NOT NULL,
    block_tab_switch    BOOLEAN DEFAULT true NOT NULL,
    shuffle_questions   BOOLEAN DEFAULT true NOT NULL,
    shuffle_options     BOOLEAN DEFAULT true NOT NULL,
    published_results   BOOLEAN DEFAULT false NOT NULL,
    slot_booking_enabled BOOLEAN DEFAULT true NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3. EXAM SECTIONS Table (ex_exam_sections)  <-- NEW
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_exam_sections (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id       UUID NOT NULL REFERENCES public.ex_exams(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    order_index   INTEGER NOT NULL DEFAULT 0,
    cutoff_marks  NUMERIC(6,2) DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3b. EXAM SLOTS Table (ex_exam_slots)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_exam_slots (
    id          TEXT PRIMARY KEY,
    exam_id     UUID NOT NULL REFERENCES public.ex_exams(id) ON DELETE CASCADE,
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ NOT NULL,
    capacity    INTEGER DEFAULT 30 NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3c. EXAM REGISTRATIONS Table (ex_exam_registrations)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_exam_registrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id         UUID NOT NULL REFERENCES public.ex_exams(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES public.ex_users(id) ON DELETE CASCADE,
    slot_id         TEXT REFERENCES public.ex_exam_slots(id) ON DELETE SET NULL,
    slot_start_time TIMESTAMPTZ,
    slot_end_time   TIMESTAMPTZ,
    assigned_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    booked_at       TIMESTAMPTZ,
    email_sent      BOOLEAN DEFAULT false NOT NULL,
    email_sent_at   TIMESTAMPTZ,
    UNIQUE(exam_id, candidate_id)
);

ALTER TABLE public.ex_exam_registrations ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.ex_exam_registrations ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- ==============================================================================
-- 4. QUESTIONS Table (ex_questions)
--    Added: section_id (nullable FK to ex_exam_sections)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_questions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id        UUID REFERENCES public.ex_exams(id) ON DELETE CASCADE,
    section_id     UUID REFERENCES public.ex_exam_sections(id) ON DELETE SET NULL,
    subject        TEXT NOT NULL,
    topic          TEXT NOT NULL,
    type           TEXT DEFAULT 'MCQ' CHECK (type IN ('MCQ', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'NUMERICAL', 'SUBJECTIVE', 'CODING')),
    statement      TEXT NOT NULL,
    options_json   JSONB,
    correct_answer TEXT,
    points         INTEGER DEFAULT 2 NOT NULL,
    difficulty     TEXT DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    created_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 5. ATTEMPTS Table (ex_attempts)
--    Added: sectional_pass (NULL=no sections, TRUE=all cutoffs met, FALSE=failed)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_attempts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id         UUID NOT NULL REFERENCES public.ex_exams(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES public.ex_users(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    submitted_at    TIMESTAMPTZ,
    status          TEXT DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'TERMINATED')),
    total_score     NUMERIC(5,2),
    percentage      NUMERIC(5,2),
    percentile      NUMERIC(5,2),
    violations      INTEGER DEFAULT 0 NOT NULL,
    sectional_pass  BOOLEAN DEFAULT NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 6. ANSWERS Table (ex_answers)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_answers (
    id                 TEXT PRIMARY KEY,
    attempt_id         UUID NOT NULL REFERENCES public.ex_attempts(id) ON DELETE CASCADE,
    question_id        UUID NOT NULL REFERENCES public.ex_questions(id) ON DELETE CASCADE,
    selected_option    TEXT,
    text_answer        TEXT,
    score_awarded      NUMERIC(5,2),
    evaluator_remarks  TEXT,
    evaluated_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 7. PROCTOR LOGS Table (ex_proctor_logs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ex_proctor_logs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id   UUID NOT NULL REFERENCES public.ex_attempts(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES public.ex_users(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    severity     TEXT DEFAULT 'LOW' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details      TEXT,
    timestamp    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 8. Disable Row Level Security (Backend API uses service key)
-- ==============================================================================
ALTER TABLE public.ex_users              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_exams              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_exam_sections      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_exam_slots         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_exam_registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_questions          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_attempts           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_answers            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ex_proctor_logs       DISABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 9. Indexes
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_ex_exams_status        ON public.ex_exams(status);
CREATE INDEX IF NOT EXISTS idx_ex_sections_exam       ON public.ex_exam_sections(exam_id);
CREATE INDEX IF NOT EXISTS idx_ex_sections_order      ON public.ex_exam_sections(exam_id, order_index);
CREATE INDEX IF NOT EXISTS idx_ex_questions_exam      ON public.ex_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_ex_questions_section   ON public.ex_questions(section_id);
CREATE INDEX IF NOT EXISTS idx_ex_attempts_candidate  ON public.ex_attempts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ex_attempts_exam       ON public.ex_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_ex_proctor_attempt     ON public.ex_proctor_logs(attempt_id);
-- ADD SECTION LEVEL QUESTIONS LIMIT
ALTER TABLE ex_exam_sections ADD COLUMN max_questions_limit INTEGER DEFAULT NULL;
