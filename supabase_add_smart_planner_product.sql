-- Smart Planner+를 admin-portal 제품 스위처(콤보박스)에 추가 (Supabase SQL Editor에서 실행)
-- products 테이블은 admin-portal 코드에서 100% 동적으로 읽으므로(ProductContext.jsx, Layout.jsx),
-- 이 INSERT 한 번이면 콤보박스·메뉴 필터링이 전부 자동으로 반영됨. 코드 변경 불필요.
--
-- license_prefix는 발급되는 라이선스 키 접두어로 쓰임(LicenseManager.jsx IssueModal:
--   const prefix = current?.license_prefix || 'SMHR'
--   const key = `${prefix}-${uuid4()}`
-- ). 아래 'SMPL'은 Smart HR+의 'SMHR'을 참고한 제안값 — 실행 전에 원하는 접두어로 바꿔도 됨
-- (한 번 라이선스가 발급되기 시작하면 이후 바꾸기 번거로우니 지금 확정 권장).

INSERT INTO products (code, display_name, license_prefix, status, sort_order)
SELECT
  'smart-planner-plus',
  'Smart Planner+',
  'SMPL',
  'active',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products)
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE code = 'smart-planner-plus'
);

-- 확인용 (실행 후 아래를 따로 실행해서 결과 확인)
-- SELECT * FROM products ORDER BY sort_order;
