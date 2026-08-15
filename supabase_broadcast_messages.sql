-- 공지 관리 테이블 생성 (Supabase SQL Editor에서 실행)
-- 개발사가 앱 사용자에게 공지를 전달하는 테이블
--
-- 이력:
-- 2026-08-14 (1차): 최초 작성 시 단일 테이블(product_code 없음) — 한 번도 배포된 적 없었음.
-- 2026-08-14 (2차): 멀티프로덕트 지원을 위해 product_code 컬럼을 포함한 공유 테이블로 재작성.
-- 2026-08-14 (3차, 현재): 공유 테이블+필터 방식은 RLS로 원천 차단이 안 되는 구조적 한계가
--   있음이 드러나(두 상품 클라이언트가 같은 anon 키를 쓰므로 DB가 "누가 물어보는지" 구분 못함,
--   product_code 값은 클라이언트가 보내는 대로 신뢰할 수밖에 없음) 상품별로 물리적으로 완전히
--   분리된 테이블로 전환(멀티프로덕트_완전분리_가이드라인.md §0/§5). 이미 실제 라이브 DB에
--   이 스키마로 생성·검증 완료된 상태 — 이 파일은 그 최종 스키마를 문서로 남겨두는 용도.

CREATE TABLE IF NOT EXISTS broadcast_messages_smart_hr_plus (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'critical')),
  require_ack BOOLEAN NOT NULL DEFAULT false,
  action_label TEXT,           -- Critical 모달 버튼 텍스트 (예: "보험료 정산으로 이동")
  action_menu  TEXT,           -- Critical 모달 클릭 시 이동할 앱 메뉴 키 (예: "ts") — smart-hr-plus 앱 메뉴 키 체계
  expires_at  TIMESTAMPTZ,     -- NULL이면 만료 없음
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broadcast_messages_smart_planner_plus (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'critical')),
  require_ack BOOLEAN NOT NULL DEFAULT false,
  action_label TEXT,
  action_menu  TEXT,           -- Smart Planner+ 앱 메뉴 키 체계 확정 전까지는 자유 텍스트
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 두 테이블 동일하게: RLS 활성화, 읽기는 누구나(앱이 anon key로 조회), 쓰기는 authenticated만
-- (Admin Portal 로그인 세션).
ALTER TABLE broadcast_messages_smart_hr_plus ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_messages_smart_planner_plus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broadcast_hr_read_all" ON broadcast_messages_smart_hr_plus
  FOR SELECT USING (true);
CREATE POLICY "broadcast_hr_write_authenticated" ON broadcast_messages_smart_hr_plus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "broadcast_planner_read_all" ON broadcast_messages_smart_planner_plus
  FOR SELECT USING (true);
CREATE POLICY "broadcast_planner_write_authenticated" ON broadcast_messages_smart_planner_plus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON broadcast_messages_smart_hr_plus TO anon;
GRANT SELECT ON broadcast_messages_smart_planner_plus TO anon;

-- 인덱스: 만료일 기준 조회 최적화
CREATE INDEX IF NOT EXISTS idx_broadcast_hr_expires_at
  ON broadcast_messages_smart_hr_plus (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_planner_expires_at
  ON broadcast_messages_smart_planner_plus (expires_at) WHERE expires_at IS NOT NULL;
