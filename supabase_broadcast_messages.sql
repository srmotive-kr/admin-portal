-- broadcast_messages 테이블 생성 (Supabase SQL Editor에서 실행)
-- 개발사가 앱 사용자에게 공지를 전달하는 테이블

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'critical')),
  require_ack BOOLEAN NOT NULL DEFAULT false,
  action_label TEXT,           -- Critical 모달 버튼 텍스트 (예: "보험료 정산으로 이동")
  action_menu  TEXT,           -- Critical 모달 클릭 시 이동할 앱 메뉴 키 (예: "ts")
  expires_at  TIMESTAMPTZ,     -- NULL이면 만료 없음
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 정책: 읽기는 모두 허용 (앱에서 anon key로 조회)
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broadcast_messages_read_all"
  ON broadcast_messages FOR SELECT
  USING (true);

-- 쓰기는 service_role(Admin Portal)만 허용 (기본값)

-- 인덱스: 만료일 기준 조회 최적화
CREATE INDEX IF NOT EXISTS idx_broadcast_expires_at
  ON broadcast_messages (expires_at) WHERE expires_at IS NOT NULL;
