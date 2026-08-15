-- planner_code_names에 그룹/세부항목 계층·배지·적정성지표 메타데이터 컬럼 추가 +
-- XPNS_TP(지출구분) 49건(그룹 9 + 세부항목 40) 신규 시딩 (Supabase SQL Editor에서 실행)
--
-- Smart Planner+ 로컬 DB 패치 v0.25.0.sql과 동일한 목적·동일한 값 — ExpensesTab.jsx에
-- 하드코딩되어 있던 XPNS_GROUPS를 code_names(로컬)/planner_code_names(admin) 양쪽에서
-- 동적으로 관리하기 위함(2026-08-15 사용자 지시). ratio_role은 scenarioStore.ts의
-- 위험대비안정성/월평균저축율/부채관리안정성 계산이 참조하는 4개 코드(904/905/906/907)에만
-- 채운다. 새로 지어낸 값 없음 — 전부 기존 ExpensesTab.jsx/scenarioStore.ts 하드코딩 값을
-- 그대로 옮김.

ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS parent_cd_val TEXT;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS is_auto_link BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS tooltip TEXT;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS ratio_role TEXT;

-- 기존에 XPNS_TP 행이 있었다면(있을 리 없지만 재실행 안전성을 위해) 지우고 다시 심는다.
DELETE FROM planner_code_names WHERE cd_fld_nm='XPNS_TP';

INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm, parent_cd_val, is_fixed, is_auto_link, tooltip, ratio_role) VALUES
  ('XPNS_TP','100','주거생활비', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','101','월세', '100', TRUE, TRUE, NULL, NULL),
  ('XPNS_TP','102','관리비', '100', TRUE, FALSE, NULL, NULL),
  ('XPNS_TP','103','전기·상하수도·가스', '100', TRUE, FALSE, '관리비에 포함되지 않는 항목', NULL),
  ('XPNS_TP','104','세금', '100', FALSE, FALSE, '근로소득세, 지방소득세 등 급여에서 공제되는 세금 제외', NULL),
  ('XPNS_TP','105','유지수선비', '100', FALSE, FALSE, '주택 수리, 보수비용', NULL),
  ('XPNS_TP','106','경조사비·용돈', '100', FALSE, FALSE, '축의금, 조의금, 부모님·자녀 용돈', NULL),
  ('XPNS_TP','107','기부금', '100', FALSE, FALSE, '헌금, 후원금, 기부금', NULL),
  ('XPNS_TP','108','반려동물', '100', FALSE, FALSE, '동물병원, 애견샵, 식·간식비', NULL),

  ('XPNS_TP','200','식비/외식', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','201','식료품·비주류음료', '200', FALSE, FALSE, '식재료, 음료, 과일, 과자', NULL),
  ('XPNS_TP','202','외식비', '200', FALSE, FALSE, '식당, 배달음식, 카페·디저트, 패스트푸드', NULL),
  ('XPNS_TP','203','술·담배', '200', FALSE, FALSE, '술, 담배, 유흥비', NULL),

  ('XPNS_TP','300','통신', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','301','전화·휴대폰', '300', TRUE, FALSE, '집전화, 이동통신, 스마트폰단말기할부금', NULL),
  ('XPNS_TP','302','인터넷', '300', TRUE, FALSE, '인터넷, IPTV', NULL),
  ('XPNS_TP','303','우편택배비', '300', FALSE, FALSE, '우편, 택배 이용료', NULL),

  ('XPNS_TP','400','교통비', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','401','대중교통', '400', TRUE, FALSE, '시내외버스, 지하철, 택시, KTX, 항공권', NULL),
  ('XPNS_TP','402','대리운전', '400', FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','403','주차·통행료', '400', TRUE, FALSE, NULL, NULL),
  ('XPNS_TP','404','유류비', '400', TRUE, FALSE, '휘발유, 경유, LPG, 전기차충전', NULL),
  ('XPNS_TP','405','차량구매·관리', '400', FALSE, FALSE, '차량할부금, 리스료, 렌트료, 수리비, 소모품비', NULL),

  ('XPNS_TP','500','교육', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','501','등록금·수업료', '500', TRUE, FALSE, '초·중·고·대학교 등록금', NULL),
  ('XPNS_TP','502','학원비·교보재', '500', TRUE, FALSE, '사교육비, 교보재, 독서실·스터디카페 이용료', NULL),
  ('XPNS_TP','503','어린이집·유치원', '500', TRUE, FALSE, '영유아 보육료, 유치원비', NULL),

  ('XPNS_TP','600','의료/건강', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','601','의료비', '600', FALSE, FALSE, '병의원 진료비, 입원비, 치과·한의원치료비, 건강검진비, 안경·렌즈·보청기', NULL),
  ('XPNS_TP','602','건강보조식품', '600', FALSE, FALSE, '영양제, 건강보조식품 등', NULL),

  ('XPNS_TP','700','문화레저비', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','701','여행', '700', FALSE, FALSE, '패키지, 항공권, 호텔·리조트·펜션·모텔숙박비, 여행 식비', NULL),
  ('XPNS_TP','702','구독료', '700', TRUE, FALSE, '넷플릭스 등 OTT, 음원', NULL),
  ('XPNS_TP','703','관람료', '700', FALSE, FALSE, '영화, 연극, 뮤지컬, 스포츠 관람료', NULL),
  ('XPNS_TP','704','문화·취미', '700', FALSE, FALSE, '도서·신문, 캠핑, 낚시, 게임, 놀이공원', NULL),
  ('XPNS_TP','705','스포츠', '700', FALSE, FALSE, '헬스장, 수영장, 골프장 이용료', NULL),

  ('XPNS_TP','800','패션', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','801','의류·신발', '800', FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','802','뷰티·미용', '800', FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','803','수선·세탁', '800', FALSE, FALSE, NULL, NULL),

  ('XPNS_TP','900','금융', NULL, FALSE, FALSE, NULL, NULL),
  ('XPNS_TP','901','공적연금', '900', TRUE, TRUE, '국민연금, 공무원연금, 사학연금, 군인연금, 별정우체국연금 추납액', NULL),
  ('XPNS_TP','902','개인연금', '900', TRUE, TRUE, '사적연금 월납입액', NULL),
  ('XPNS_TP','903','사회보험료', '900', TRUE, FALSE, '국민건강보험료, 노인장기요양보험료 지역가입자 납부액', NULL),
  ('XPNS_TP','904','보험료', '900', TRUE, TRUE, '상해·손해보험, 생명보험, 자동차보험', 'danger_rate'),
  ('XPNS_TP','905','적금', '900', TRUE, TRUE, '은행 적금 월납입액', 'savings'),
  ('XPNS_TP','906','펀드·증권', '900', TRUE, TRUE, '펀드, 주식 등 매월 투자액', 'savings'),
  ('XPNS_TP','907','대출원리금', '900', TRUE, TRUE, '신용, 담보대출 등 원리금 상환액', 'loan_stability'),
  ('XPNS_TP','908','할부금', '900', TRUE, FALSE, '각종 할부금, 리스·렌탈료, 차량할부금 제외', NULL);
