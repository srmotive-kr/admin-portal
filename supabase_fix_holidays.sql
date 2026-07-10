-- ============================================================
-- 공휴일 중복 제거 + UNIQUE 제약 추가
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1. 중복 행 제거 (id가 가장 작은 것만 보존)
DELETE FROM public.holidays
WHERE id NOT IN (
    SELECT MIN(id)
    FROM public.holidays
    GROUP BY year, holiday_date, holiday_name
);

-- 2. 이후 중복 방지를 위한 UNIQUE 제약 추가 (없을 때만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'holidays_unique_date_name'
  ) THEN
    ALTER TABLE public.holidays
      ADD CONSTRAINT holidays_unique_date_name UNIQUE (year, holiday_date, holiday_name);
  END IF;
END $$;
