-- ============================================================
-- Admin Portal 테이블 권한 부여
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1. RLS 비활성화 (관리자 전용 테이블)
ALTER TABLE public.seed_codes          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_rates     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_tax_table    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays            DISABLE ROW LEVEL SECURITY;

-- 2. anon / authenticated 역할에 모든 권한 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seed_codes       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_rates  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_tax_table TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays         TO anon, authenticated;

-- 3. 시퀀스(auto-increment) 권한 (SERIAL/BIGSERIAL 컬럼이 있는 경우)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
