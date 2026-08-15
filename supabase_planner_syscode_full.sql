-- Smart Planner+ 시스템코드(planner_code_names) 전체 실데이터 이관 (Supabase SQL Editor에서 실행)
--
-- 실행 전 상태: planner_code_names에는 RET_LVL_TP 5건(그나마 옛날 값)만 있고 나머지 10개
-- 코드그룹은 전부 비어 있었음. 값은 전부 Smart Planner+ 로컬 SQLite
-- (C:\ConversionProject\smart-planner-plus\02_conversion\src\db\)의 baseline+패치를
-- 버전 순으로 전수 추적해 "가장 마지막에 그 그룹을 실제로 고친 패치"만 채택한 최종값이다.
-- 새로 지어낸 값 없음.
--
-- 이 스크립트는 supabase_planner_xpns_tp.sql(선행 작성분)의 ALTER TABLE + XPNS_TP 시딩을
-- 포함한다 — supabase_planner_xpns_tp.sql을 이미 실행했다면 이 스크립트만 다시 실행해도
-- 안전(멱등)하다. 둘 다 실행할 필요 없음, 이 파일 하나면 충분.

-- ── 1) 계층·메타데이터 컬럼 (XPNS_TP 전용, 나머지 그룹은 전부 NULL/FALSE) ──────────
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS parent_cd_val TEXT;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS is_auto_link BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS tooltip TEXT;
ALTER TABLE planner_code_names ADD COLUMN IF NOT EXISTS ratio_role TEXT;

-- ── 2) XPNS_TP (지출구분, 그룹9 + 세부항목40 = 49건) ────────────────────────────
-- 로컬 패치 v0.25.0.sql과 동일 값 (ExpensesTab.jsx 하드코딩 XPNS_GROUPS 그대로 이관)
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

-- ── 3) RET_LVL_TP (은퇴생활수준) 수정 — 옛날 baseline "5=5단계"를 지우고 사용자앱이
--    v0.13.0.sql에서 이미 바꾼 "0=은퇴설계 안함"을 추가. 1~4는 기존 값 그대로(정확함).
DELETE FROM planner_code_names WHERE cd_fld_nm='RET_LVL_TP' AND cd_val='5';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('RET_LVL_TP','0','은퇴설계 안함')
ON CONFLICT (cd_fld_nm, cd_val) DO UPDATE SET cd_nm = EXCLUDED.cd_nm;

-- ── 4) 나머지 9개 그룹 실데이터 (전부 로컬 앱 최신값, 각 그룹 주석에 출처 패치 명시) ──

-- AST_TP(자산종류, 19건) — v0.6.0/v0.8.0/v0.9.0.sql 최종값
DELETE FROM planner_code_names WHERE cd_fld_nm='AST_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('AST_TP','1101','입출금'), ('AST_TP','1102','정기예적금'), ('AST_TP','1103','RP'),
  ('AST_TP','1104','CMA/예수금'), ('AST_TP','1105','MMF'), ('AST_TP','1106','CP/채권'),
  ('AST_TP','1201','펀드/ETF'), ('AST_TP','1202','대체투자(AI)'), ('AST_TP','1203','주식'),
  ('AST_TP','2101','공적연금'), ('AST_TP','2201','IRP/개인연금'),
  ('AST_TP','2301','생명보험'), ('AST_TP','2302','실손보험'),
  ('AST_TP','4101','퇴직금'),
  ('AST_TP','3101','주거용부동산'), ('AST_TP','3104','상가/건물'), ('AST_TP','3105','대지/임야'),
  ('AST_TP','3106','전월세보증금'), ('AST_TP','3201','기타');

-- LOAN_TP(부채종류, 5건) — v0.5.0.sql 최종값
DELETE FROM planner_code_names WHERE cd_fld_nm='LOAN_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('LOAN_TP','1','신용대출'), ('LOAN_TP','2','담보대출'), ('LOAN_TP','3','전세자금대출'),
  ('LOAN_TP','4','마이너스통장'), ('LOAN_TP','5','개인차입');

-- LOAN_RPY_TP(상환방식, 3건) — baseline 그대로
DELETE FROM planner_code_names WHERE cd_fld_nm='LOAN_RPY_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('LOAN_RPY_TP','1','원리금분할상환'), ('LOAN_RPY_TP','2','원금균등상환'), ('LOAN_RPY_TP','3','원금일시상환');

-- INCM_TP(소득구분, 6건) — baseline 그대로
DELETE FROM planner_code_names WHERE cd_fld_nm='INCM_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('INCM_TP','01','근로소득'), ('INCM_TP','02','사업소득'), ('INCM_TP','03','임대소득'),
  ('INCM_TP','04','금융소득'), ('INCM_TP','05','연금소득'), ('INCM_TP','06','기타소득');

-- AST_SAVE_TP(저축방식, 2건) — baseline 그대로
DELETE FROM planner_code_names WHERE cd_fld_nm='AST_SAVE_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('AST_SAVE_TP','1','거치식'), ('AST_SAVE_TP','2','적립식');

-- FML_REL_TP(가족관계, 20건) — baseline + v0.17.0.sql(02/03 라벨 갱신) 최종값
DELETE FROM planner_code_names WHERE cd_fld_nm='FML_REL_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('FML_REL_TP','00','본인'), ('FML_REL_TP','01','배우자'),
  ('FML_REL_TP','02','아들'), ('FML_REL_TP','03','딸'),
  ('FML_REL_TP','04','부'), ('FML_REL_TP','05','모'),
  ('FML_REL_TP','06','장인'), ('FML_REL_TP','07','장모'),
  ('FML_REL_TP','08','시부'), ('FML_REL_TP','09','시모'),
  ('FML_REL_TP','10','(시)조부'), ('FML_REL_TP','11','(시)조모'),
  ('FML_REL_TP','12','형(자)'), ('FML_REL_TP','13','제(매)'),
  ('FML_REL_TP','14','손자'), ('FML_REL_TP','15','손녀'),
  ('FML_REL_TP','16','사위'), ('FML_REL_TP','17','며느리'),
  ('FML_REL_TP','18','조카'), ('FML_REL_TP','99','기타');

-- HOUS_ACQ_TP(주택취득방식, 4건) — baseline 그대로
DELETE FROM planner_code_names WHERE cd_fld_nm='HOUS_ACQ_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('HOUS_ACQ_TP','1','신규'), ('HOUS_ACQ_TP','2','확장'),
  ('HOUS_ACQ_TP','3','추가'), ('HOUS_ACQ_TP','4','전/월세보증금');

-- EDU_LVL_TP(교육단계, 16건) — baseline 그대로 (기본값관리>교육 탭의 edu_level_defaults와는
-- 별개 테이블/코드 범위이니 혼동 금지: 여기는 code_names, 01/99 포함 16건)
DELETE FROM planner_code_names WHERE cd_fld_nm='EDU_LVL_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('EDU_LVL_TP','01','유치원'), ('EDU_LVL_TP','02','초등학교'), ('EDU_LVL_TP','03','중등학교'),
  ('EDU_LVL_TP','04','고등학교'), ('EDU_LVL_TP','05','전문대학'), ('EDU_LVL_TP','06','대학교'),
  ('EDU_LVL_TP','07','대학원(석사)'), ('EDU_LVL_TP','08','대학원(박사)'), ('EDU_LVL_TP','09','어학연수'),
  ('EDU_LVL_TP','10','해외 초등학교'), ('EDU_LVL_TP','11','해외 중등학교'), ('EDU_LVL_TP','12','해외 고등학교'),
  ('EDU_LVL_TP','13','해외 대학교'), ('EDU_LVL_TP','14','해외 대학원(석사)'), ('EDU_LVL_TP','15','해외 대학원(박사)'),
  ('EDU_LVL_TP','99','기타');

-- FN_GOAL_TP(재무목표구분, 5건) — baseline 그대로
DELETE FROM planner_code_names WHERE cd_fld_nm='FN_GOAL_TP';
INSERT INTO planner_code_names (cd_fld_nm, cd_val, cd_nm) VALUES
  ('FN_GOAL_TP','1','은퇴목표'), ('FN_GOAL_TP','2','교육목표'), ('FN_GOAL_TP','3','주택마련목표'),
  ('FN_GOAL_TP','4','결혼목표'), ('FN_GOAL_TP','5','기타목표');
