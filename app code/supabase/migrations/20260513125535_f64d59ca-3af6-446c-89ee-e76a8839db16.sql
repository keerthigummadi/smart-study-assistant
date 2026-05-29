
-- Replace award_xp: derive user from auth.uid() so users can't award XP to others
DROP FUNCTION IF EXISTS public.award_xp(uuid, integer);

CREATE OR REPLACE FUNCTION public.award_xp(_xp integer)
RETURNS public.user_stats
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.user_stats;
  uid uuid := auth.uid();
  today date := current_date;
  new_streak integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _xp IS NULL OR _xp < 0 OR _xp > 1000 THEN
    RAISE EXCEPTION 'Invalid xp amount';
  END IF;

  INSERT INTO public.user_stats (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.user_stats WHERE user_id = uid;

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
  WHERE user_id = uid
  RETURNING * INTO s;

  RETURN s;
END; $$;

REVOKE ALL ON FUNCTION public.award_xp(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_xp(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
