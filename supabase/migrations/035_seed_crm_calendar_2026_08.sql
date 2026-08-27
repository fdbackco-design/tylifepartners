-- Seed 2026-08 work calendar from FEEDLIFE_업무캘린더_202608.html
-- Idempotent for this seed batch (admin null-author Aug 2026 rows matching seeded titles)
DELETE FROM public.crm_calendar_events
WHERE created_by IS NULL
  AND created_by_rank = 'admin'
  AND event_date >= '2026-08-01' AND event_date < '2026-09-01'
  AND (event_date, title) IN (
  ('2026-08-03', '영업 단 사업 계획 보고'),
  ('2026-08-04', 'FEED LIFE'),
  ('2026-08-05', '신규 MKT 시작'),
  ('2026-08-06', '2시 : 아산 CIS'),
  ('2026-08-07', '2시 : 온라인 강의'),
  ('2026-08-08', '★부산 1기 N잡 세미나★'),
  ('2026-08-10', '센터장 이상'),
  ('2026-08-11', '2시 : 수도권 CIS (강남)'),
  ('2026-08-13', '2시 : 아산 CIS'),
  ('2026-08-14', '2시 : 온라인 강의'),
  ('2026-08-15', '(가안)'),
  ('2026-08-17', '썸머 마감 전 최종 확인'),
  ('2026-08-18', '2시 : 수도권 N잡 세미나'),
  ('2026-08-19', '2시 : 진주 CIS'),
  ('2026-08-20', '오전 11시: 천안 축구 센터'),
  ('2026-08-21', '2시: 온라인 강의'),
  ('2026-08-22', '★브리핑 데이'),
  ('2026-08-24', '★신 계약 마감 일★'),
  ('2026-08-25', '★해피콜 마감 일★'),
  ('2026-08-27', '오전 11시 : 천안 CIS')
);

INSERT INTO public.crm_calendar_events (
  title, body, event_date, event_type, all_day, visibility, viewer_ids, created_by, created_by_rank, team_root_id
) VALUES
  ('영업 단 사업 계획 보고', '영업 단 사업 계획 보고

공지 방 및 업무 소통 및 운영 체제 변화', '2026-08-03', 'important', true, 'all', '{}', NULL, 'admin', NULL),
  ('FEED LIFE', 'FEED LIFE
정책 발표 & 출범', '2026-08-04', 'deadline', true, 'all', '{}', NULL, 'admin', NULL),
  ('신규 MKT 시작', '신규 MKT 시작', '2026-08-05', 'important', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시 : 아산 CIS', '2시 : 아산 CIS
【황새로미 센터장】

5시 : 리더 회의 , 교육
【조명희 본부장】', '2026-08-06', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시 : 온라인 강의', '2시 : 온라인 강의
FEED LIFE 본사
주제 : 영업자 실무 교육', '2026-08-07', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('★부산 1기 N잡 세미나★', '★부산 1기 N잡 세미나★

브리핑 강사 : 박진열
진행 총괄 : 이재원

2부 영업 관리자 회의
: 조명희 본부장 진행', '2026-08-08', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('센터장 이상', '센터장 이상
관리자 온라인 회의', '2026-08-10', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시 : 수도권 CIS (강남)', '2시 : 수도권 CIS (강남)
주제 : 영업채널의 새 비전
강사 : 김세영 & 박재형', '2026-08-11', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시 : 아산 CIS', '2시 : 아산 CIS
강사 : 이다교', '2026-08-13', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시 : 온라인 강의', '2시 : 온라인 강의
강사 : 김세영

주제 : 올라이프 케어 상품 및 유전자 DB 세일즈 컨셉 완전 정복', '2026-08-14', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('(가안)', '(가안)
2시 : 수도권 브리핑
강사 : 지정 예정', '2026-08-15', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('썸머 마감 전 최종 확인', '썸머 마감 전 최종 확인', '2026-08-17', 'important', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시 : 수도권 N잡 세미나', '2시 : 수도권 N잡 세미나
주제 : 새로운 도약
강사 : 안성준', '2026-08-18', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시 : 진주 CIS', '2시 : 진주 CIS
강사 : 조명희 본부장', '2026-08-19', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('오전 11시: 천안 축구 센터', '오전 11시: 천안 축구 센터
(가안)브리핑 영업
강사 : 이주희
(주제 회의 중)

2시 : 아산 CIS
【조명희 본부장】', '2026-08-20', 'important', true, 'all', '{}', NULL, 'admin', NULL),
  ('2시: 온라인 강의', '2시: 온라인 강의
강사: 박재형
주제: 온라인 cis
(보험 대리점 지점장의 또 다른 세일즈 노하우)', '2026-08-21', 'general', true, 'all', '{}', NULL, 'admin', NULL),
  ('★브리핑 데이', '★브리핑 데이
(주제 선정 예정) ★
부제: 부산 센터 출범식

강의 : 브리핑 강사
MC : 황솜결
진행 총괄 : 이재원

2부 ▶ N잡세미나 &
리더 스피치
: 안성준 진행', '2026-08-22', 'important', true, 'all', '{}', NULL, 'admin', NULL),
  ('★신 계약 마감 일★', '★신 계약 마감 일★', '2026-08-24', 'important', true, 'all', '{}', NULL, 'admin', NULL),
  ('★해피콜 마감 일★', '★해피콜 마감 일★', '2026-08-25', 'deadline', true, 'all', '{}', NULL, 'admin', NULL),
  ('오전 11시 : 천안 CIS', '오전 11시 : 천안 CIS
강사 : 이주희

오후 2시 : 아산 CIS
강사 : 조명희', '2026-08-27', 'general', true, 'all', '{}', NULL, 'admin', NULL);
