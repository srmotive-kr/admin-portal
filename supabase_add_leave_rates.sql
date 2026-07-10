-- ============================================================
-- gov_leave_benefit_rates 테이블 추가 + 권한
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gov_leave_benefit_rates (
  id                 BIGSERIAL     PRIMARY KEY,
  year               INTEGER       NOT NULL UNIQUE,
  maternity_ei_cap   INTEGER       NOT NULL,
  paternity_days     INTEGER       NOT NULL,
  paternity_ei_cap   INTEGER,
  parental_cap_1_3   INTEGER       NOT NULL,
  parental_cap_4_6   INTEGER       NOT NULL,
  parental_cap_7p    INTEGER       NOT NULL,
  parental_rate_1_6  NUMERIC(4,2)  NOT NULL,
  parental_rate_7p   NUMERIC(4,2)  NOT NULL,
  parental_floor     INTEGER       NOT NULL,
  memo               TEXT
);

ALTER TABLE public.gov_leave_benefit_rates DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gov_leave_benefit_rates TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.gov_leave_benefit_rates_id_seq TO anon, authenticated;

-- 초기 데이터
INSERT INTO public.gov_leave_benefit_rates
  (year, maternity_ei_cap, paternity_days, paternity_ei_cap,
   parental_cap_1_3, parental_cap_4_6, parental_cap_7p,
   parental_rate_1_6, parental_rate_7p, parental_floor, memo)
VALUES
  (2025, 2100000, 10, NULL,    2500000, 2000000, 1600000, 1.0, 0.8, 700000, '⚠ 2025 paternity_ei_cap 미확인'),
  (2026, 2200000, 20, 1684210, 2500000, 2000000, 1600000, 1.0, 0.8, 700000, '2026.1.1 시행')
ON CONFLICT (year) DO NOTHING;
