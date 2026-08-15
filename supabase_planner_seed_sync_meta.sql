-- Smart Planner+ 데이터 동기화 버전 메타 테이블 (Supabase SQL Editor에서 실행)
--
-- Smart HR+의 seed_sync_meta와 동일한 역할 — Planner+ 앱의 seedSync.js 대응물
-- (C:\ConversionProject\smart-planner-plus\02_conversion\src\lib\seed\seedSync.js)이
-- 이 테이블의 last_updated_at을 로컬 SEED_DATA_VERSION과 비교해 재동기화 여부를 판단한다.
-- HR+의 seed_sync_meta를 그대로 공유하면 두 제품의 버전 비교가 서로 오염되므로
-- (2026-08-15 조사에서 확인된 함정) 물리적으로 분리된 별도 테이블로 만든다.

CREATE TABLE IF NOT EXISTS planner_seed_sync_meta (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT planner_seed_sync_meta_single_row CHECK (id = 1)
);

INSERT INTO planner_seed_sync_meta (id, last_updated_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE planner_seed_sync_meta DISABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON planner_seed_sync_meta TO anon, authenticated;
