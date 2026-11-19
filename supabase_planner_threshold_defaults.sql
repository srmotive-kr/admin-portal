-- Smart Planner+ "기준관리" 시스템값 테이블 신설 (Supabase SQL Editor에서 실행)
--
-- 로컬 SQLite 대응(C:\ConversionProject\smart-planner-plus\02_conversion\src\db\patches\
-- v0.32.0.sql, v0.35.0.sql)과 동일 구조 — "planner_" 접두어, 컬럼명 1:1 대응.
--
--   ratio_threshold_defaults           → planner_ratio_threshold_defaults
--     (재무비율 적정성 기준. 2026-11-19 사용자 지시로 page05.mxml을 재확인해 구조를
--     바로잡았다 — 비율마다 주의/보통/양호 3등급이 아니라 상한/하한 2개 입력값(From~To)
--     뿐이고 3등급은 그 2개로 계산되는 파생값이다. tier 구분 없는 전역 단일 행. 처음엔
--     빈 테이블 — admin에서 실값을 새로 입력해야 함)
--   savings_term_defaults              → planner_savings_term_defaults
--     (저축기간구분 단기/중기/장기 경계값, 전역 단일 행. 역시 처음엔 빈 테이블)
--   protect_asset_threshold_defaults   → planner_protect_asset_threshold_defaults
--     (보장자산 적정성 기준, 전역 단일 행. 로컬엔 이미 실값이 있어(v0.32.0.sql) 아래
--     INSERT로 그 값 그대로 시드해둔다 — 보험료10%/보장기간100세/사망보험금2억/
--     재해상해8천만/암진단비8천만/수술비500만/입원비10만, 전부 사용자가 직접 제공한 값)
--
-- 2026-11-19 사용자 지시로 신설 — "기준 관리" 탭 3개 하위메뉴(재무비율/보장자산/저축기간)
-- 전부 admin-portal에서 관리하고 로컬 앱으로 동기화되도록 한다.

CREATE TABLE IF NOT EXISTS planner_ratio_threshold_defaults (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  loan_ast_rt_lower_bnd   NUMERIC,  -- 부채부담비율 하한(%, 총부채/총자산)
  loan_ast_rt_upper_bnd   NUMERIC,  -- 부채부담비율 상한(%)
  emrg_prep_rt_upper_bnd  NUMERIC,  -- 긴급자금준비율 상한(%, 유동성자산/월지출)
  emrg_prep_rt_lower_bnd  NUMERIC,  -- 긴급자금준비율 하한(%)
  avg_sav_rt_upper_bnd    NUMERIC,  -- 월평균저축율 상한(%, 월저축액/월수입)
  avg_sav_rt_lower_bnd    NUMERIC,  -- 월평균저축율 하한(%)
  loan_mgr_rt_lower_bnd   NUMERIC,  -- 부채관리안정성 하한(%, 월부채납입금/월수입)
  loan_mgr_rt_upper_bnd   NUMERIC,  -- 부채관리안정성 상한(%)
  risk_mgr_rt_upper_bnd   NUMERIC,  -- 위험대비안정성 상한(%, 월보장성보험료/월수입)
  risk_mgr_rt_lower_bnd   NUMERIC   -- 위험대비안정성 하한(%)
);

-- 저축기간/보장자산 2개는 등급 구분 없는 "전역 단일 행" 테이블이라, 로컬 SQLite(자연키
-- 없이 항상 1행만 유지)와 달리 Supabase/admin-portal에서는 upsert 대상을 명확히 하려고
-- id=1 고정 싱글톤 PK를 둔다(CHECK로 다른 id 삽입 자체를 막음).
CREATE TABLE IF NOT EXISTS planner_savings_term_defaults (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sav_mid_trm_lower_bnd NUMERIC,  -- 단기/중기 경계(년, 미만이면 단기)
  sav_mid_trm_upper_bnd NUMERIC   -- 중기/장기 경계(년, 미만이면 중기)
);

CREATE TABLE IF NOT EXISTS planner_protect_asset_threshold_defaults (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dep_amt_rt  NUMERIC,  -- 보험료(소득금액 대비 %)
  lmt_age     NUMERIC,  -- 보장기간(세)
  dth_amt     NUMERIC,  -- 사망보험금(원)
  dmg_amt     NUMERIC,  -- 재해상해(원)
  cancer_amt  NUMERIC,  -- 암진단비(원)
  opr_amt     NUMERIC,  -- 수술비(원)
  hosp_amt    NUMERIC   -- 입원비(원)
);

-- 보장자산은 로컬에 이미 있는 실값을 그대로 가져와 admin-portal과 로컬이 처음부터
-- 일치한 상태로 시작하게 한다(앞으로 값을 바꾸고 싶으면 admin-portal에서 수정 후 동기화).
INSERT INTO planner_protect_asset_threshold_defaults (dep_amt_rt, lmt_age, dth_amt, dmg_amt, cancer_amt, opr_amt, hosp_amt)
SELECT 10, 100, 200000000, 80000000, 80000000, 5000000, 100000
WHERE NOT EXISTS (SELECT 1 FROM planner_protect_asset_threshold_defaults);

-- 권한: 다른 planner_* 테이블과 동일 모델(관리자 전용 테이블, RLS 비활성 + anon/authenticated 전체 CRUD).
ALTER TABLE planner_ratio_threshold_defaults         DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_savings_term_defaults            DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_protect_asset_threshold_defaults DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON planner_ratio_threshold_defaults         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_savings_term_defaults            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_protect_asset_threshold_defaults TO anon, authenticated;
