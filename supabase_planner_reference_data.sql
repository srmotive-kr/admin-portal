-- Smart Planner+ 전용 참조/설정 데이터 테이블 (Supabase SQL Editor에서 실행)
--
-- Smart HR+의 seed_codes/insurance_rates 등과는 완전히 독립적인 별도 테이블 세트다 —
-- 컬럼 구성도 Smart HR+ 스키마를 참고하지 않고, Smart Planner+ 로컬 SQLite
-- (C:\ConversionProject\smart-planner-plus\02_conversion\src\db\migrations\001_init_schema.sql,
-- patches\v0.14.0.sql)에 이미 정의된 실제 컬럼을 그대로 옮겨왔다 — 지어낸 컬럼 없음.
-- 전부 "planner_" 접두어를 붙여, admin-portal 공용 이름공간(예: system_config 같은
-- 흔한 이름)과 절대 충돌하지 않게 했다.
--
-- 이 스크립트는 스키마만 만든다(데이터는 비워둠) — 로컬 SQLite에 이미 있는 초기값을
-- 그대로 옮겨 심을지, 새로 입력할지는 다음 단계에서 결정.
--
-- 원본 로컬 테이블과의 대응:
--   code_names             → planner_code_names             (자산/지출/부채/소득/가족관계/
--                             교육단계/재무목표구분 등 37개+ 코드값)
--   ret_level_defaults     → planner_ret_level_defaults     (은퇴생활수준 5단계, 외식/골프/여행비)
--   pension_std_incm_mn    → planner_pension_std_incm_mn    (국민연금 기준소득월액표, 연도별)
--   pension_yr_revalue     → planner_pension_yr_revalue     (국민연금 재평가율, 연도별)
--   system_config          → planner_system_config          (PENSION_AVG_STD_INCM_MN,
--                             RATE_DEFAULT_* 등 시스템 전체 공용 key-value)
--   retire_preset_defaults → planner_retire_preset_defaults (은퇴 기본값 5단계, 항목별 금액/나이)
--   edu_level_defaults     → planner_edu_level_defaults     (교육단계별 기본 소요금액)
--   wed_sex_defaults       → planner_wed_sex_defaults       (결혼 남녀별 기본값)

CREATE TABLE IF NOT EXISTS planner_code_names (
  cd_fld_nm TEXT NOT NULL,
  cd_val    TEXT NOT NULL,
  cd_nm     TEXT NOT NULL,
  PRIMARY KEY (cd_fld_nm, cd_val)
);

CREATE TABLE IF NOT EXISTS planner_ret_level_defaults (
  ret_lvl_tp        TEXT PRIMARY KEY,
  dine_mn_cnt_xpns  NUMERIC NOT NULL,  -- 월 1회당 외식비
  golf_mn_cnt_xpns  NUMERIC NOT NULL,  -- 월 1회당 골프비
  trvl_mn_cnt_xpns  NUMERIC NOT NULL   -- 연 1회당 여행비
);

CREATE TABLE IF NOT EXISTS planner_pension_std_incm_mn (
  std_yr        TEXT NOT NULL,
  sn            INTEGER NOT NULL,
  mn_incm_ge    NUMERIC NOT NULL,
  mn_incm_lt    NUMERIC NOT NULL,
  std_incm_mn   NUMERIC NOT NULL,
  indi_pay_amt  NUMERIC NOT NULL,
  wkr_pay_amt   NUMERIC NOT NULL,
  PRIMARY KEY (std_yr, sn)
);

CREATE TABLE IF NOT EXISTS planner_pension_yr_revalue (
  yr           TEXT PRIMARY KEY,
  revalue_rate NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS planner_system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS planner_retire_preset_defaults (
  ret_lvl_tp          TEXT PRIMARY KEY,
  req_bas_mn_amt      NUMERIC NOT NULL,
  req_med_mn_amt      NUMERIC NOT NULL,
  req_dine_mn_cnt     NUMERIC NOT NULL,
  req_golf_mn_cnt     NUMERIC NOT NULL,
  req_trvl_yr_cnt     NUMERIC NOT NULL,
  req_cult_mn_amt     NUMERIC NOT NULL,
  req_slv_twn_amt     NUMERIC NOT NULL,
  req_alon_liv_rt     NUMERIC NOT NULL,
  req_med_rcu_trm     NUMERIC NOT NULL,
  req_med_rcu_mn_amt  NUMERIC NOT NULL,
  man_ret_age         INTEGER NOT NULL,
  fem_ret_age         INTEGER NOT NULL,
  man_dth_age         INTEGER NOT NULL,
  fem_dth_age         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS planner_edu_level_defaults (
  edu_lvl_tp  TEXT PRIMARY KEY,
  req_amt     NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS planner_wed_sex_defaults (
  sx_tp             TEXT PRIMARY KEY,
  wed_gift_amt      NUMERIC NOT NULL,
  wed_pre_amt       NUMERIC NOT NULL,
  wed_crmny_amt     NUMERIC NOT NULL,
  wed_trvl_amt      NUMERIC NOT NULL,
  wed_etc_amt       NUMERIC NOT NULL,
  wed_goal_str_age  INTEGER NOT NULL
);

-- 권한: Smart HR+의 seed_codes/insurance_rates 등과 동일한 모델(관리자 전용 테이블이라
-- RLS 비활성 + anon/authenticated 전체 CRUD, supabase_fix_permissions.sql 패턴 그대로 적용).
ALTER TABLE planner_code_names             DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_ret_level_defaults     DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_pension_std_incm_mn    DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_pension_yr_revalue     DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_system_config          DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_retire_preset_defaults DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_edu_level_defaults     DISABLE ROW LEVEL SECURITY;
ALTER TABLE planner_wed_sex_defaults       DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON planner_code_names             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_ret_level_defaults     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_pension_std_incm_mn    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_pension_yr_revalue     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_system_config          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_retire_preset_defaults TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_edu_level_defaults     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_wed_sex_defaults       TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
