-- ============================================================
-- S-1: income_tax_table — year → apply_from 전환 + range_max NULL 허용
-- S-2: income_tax_excess_rate 테이블 신설
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- ── S-1: income_tax_table 스키마 변경 ──────────────────────

-- 1. apply_from 컬럼 추가
ALTER TABLE public.income_tax_table
  ADD COLUMN IF NOT EXISTS apply_from TEXT;

-- 2. 기존 year 데이터 → apply_from 마이그레이션 (국세청 간이세액표는 3월 1일 시행)
UPDATE public.income_tax_table
SET apply_from = year::text || '-03-01'
WHERE apply_from IS NULL;

-- 3. apply_from NOT NULL 제약 추가
ALTER TABLE public.income_tax_table
  ALTER COLUMN apply_from SET NOT NULL;

-- 4. range_max NULL 허용 (정액 anchor 행 지원)
ALTER TABLE public.income_tax_table
  ALTER COLUMN range_max DROP NOT NULL;

-- 5. 10M+ placeholder 행 → range_max = NULL (anchor 행으로 변환)
UPDATE public.income_tax_table
SET range_max = NULL
WHERE range_max = 999999999;

-- 6. year 컬럼 제거 (apply_from 으로 대체)
ALTER TABLE public.income_tax_table
  DROP COLUMN IF EXISTS year;

-- 7. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_income_tax_apply_from
  ON public.income_tax_table(apply_from, dependents, range_min);


-- ── S-2: income_tax_excess_rate 신설 ───────────────────────

CREATE TABLE IF NOT EXISTS public.income_tax_excess_rate (
  id             BIGSERIAL    PRIMARY KEY,
  apply_from     TEXT         NOT NULL,
  threshold_from BIGINT       NOT NULL,
  threshold_to   BIGINT,                  -- NULL = 무한대 (최고 구간)
  accumulated    BIGINT       NOT NULL DEFAULT 0,
  factor         REAL         NOT NULL DEFAULT 0.98,
  rate           REAL         NOT NULL,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (apply_from, threshold_from)
);

ALTER TABLE public.income_tax_excess_rate ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'income_tax_excess_rate' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY allow_all ON public.income_tax_excess_rate FOR ALL USING (true);
  END IF;
END $$;

-- 2024-03-01 시행 국세청 고시 데이터 (6개 초과 구간)
INSERT INTO public.income_tax_excess_rate
  (apply_from, threshold_from, threshold_to, accumulated, factor, rate)
VALUES
  ('2024-03-01', 10000000,  14000000,    25000, 0.98, 0.35),
  ('2024-03-01', 14000000,  28000000,  1397000, 0.98, 0.38),
  ('2024-03-01', 28000000,  30000000,  6610600, 0.98, 0.40),
  ('2024-03-01', 30000000,  45000000,  7394600, 0.98, 0.40),
  ('2024-03-01', 45000000,  87000000, 13394600, 0.98, 0.42),
  ('2024-03-01', 87000000,       NULL, 31034600, 0.98, 0.45)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_excess_rate_lookup
  ON public.income_tax_excess_rate(apply_from, threshold_from);
