-- ============================================================
-- insurance_rates 중복 제거 + UNIQUE 제약 추가
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1. 중복 행 제거 (year + apply_from 기준, id 가장 작은 것만 보존)
DELETE FROM public.insurance_rates
WHERE id NOT IN (
    SELECT MIN(id)
    FROM public.insurance_rates
    GROUP BY year, COALESCE(apply_from, '1900-01-01')
);

-- 2. 이후 중복 방지를 위한 UNIQUE 제약 추가 (없을 때만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ins_rates_unique_year_from'
  ) THEN
    ALTER TABLE public.insurance_rates
      ADD CONSTRAINT ins_rates_unique_year_from UNIQUE (year, apply_from);
  END IF;
END $$;
