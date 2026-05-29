
-- ===== user_stats =====
CREATE TABLE public.user_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stats viewable by everyone" ON public.user_stats FOR SELECT USING (true);
CREATE POLICY "Users insert own stats" ON public.user_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own stats" ON public.user_stats FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create stats on new user
CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_stats ON auth.users;
CREATE TRIGGER on_auth_user_created_stats AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();

-- Backfill stats for existing users
INSERT INTO public.user_stats (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ===== award_xp function =====
CREATE OR REPLACE FUNCTION public.award_xp(_user_id uuid, _xp integer)
RETURNS public.user_stats
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.user_stats;
  today date := current_date;
  new_streak integer;
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.user_stats WHERE user_id = _user_id;

  IF s.last_active_date IS NULL OR s.last_active_date < today - INTERVAL '1 day' THEN
    new_streak := 1;
  ELSIF s.last_active_date = today - INTERVAL '1 day' THEN
    new_streak := s.current_streak + 1;
  ELSE
    new_streak := GREATEST(s.current_streak, 1);
  END IF;

  UPDATE public.user_stats
    SET xp = xp + _xp,
        level = GREATEST(1, ((xp + _xp) / 100) + 1),
        current_streak = new_streak,
        best_streak = GREATEST(best_streak, new_streak),
        last_active_date = today,
        updated_at = now()
  WHERE user_id = _user_id
  RETURNING * INTO s;

  RETURN s;
END; $$;

-- ===== study_plans =====
CREATE TABLE public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  plan jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own study plans" ON public.study_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own study plans" ON public.study_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own study plans" ON public.study_plans FOR DELETE USING (auth.uid() = user_id);

-- ===== tutor_messages =====
CREATE TABLE public.tutor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tutor_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tutor messages" ON public.tutor_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tutor messages" ON public.tutor_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own tutor messages" ON public.tutor_messages FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_tutor_messages_user_created ON public.tutor_messages(user_id, created_at);

-- ===== question_responses (per-question analytics) =====
CREATE TABLE public.question_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid,
  question_id uuid,
  topic text,
  is_correct boolean NOT NULL,
  time_seconds integer NOT NULL DEFAULT 0,
  difficulty text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own responses" ON public.question_responses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own responses" ON public.question_responses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_responses_user_topic ON public.question_responses(user_id, topic);

-- ===== quiz_questions extensions =====
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS correct_answer text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium';

-- ===== flashcards extensions (spaced repetition) =====
ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS ease_factor real NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS interval_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_review_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_difficult boolean NOT NULL DEFAULT false;

ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "Users update own flashcards" ON public.flashcards;
CREATE POLICY "Users update own flashcards" ON public.flashcards FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_review ON public.flashcards(user_id, next_review_at);
