# CRM 조회 데이터 — 외부 파트너용 설명

이 문서는 후보자 DB, TM001, TM002, 캘린더가 **어떤 저장소와 조회 로직**으로 이루어지는지와, 그 데이터를 외부에 조회 API로 줄 때의 경계를 설명합니다. 화면 이름을 API 이름으로 쓰지 않습니다.

기준 코드: 내부 조회 `GET /api/admin/leads`, `GET /api/admin/tm001`, `GET /api/admin/tm002`, `GET /api/admin/calendar`.  
외부 파트너 전용 경로 `/api/partner/v1/...` 는 **구현됨**. 파트너 공유 문서는 [`partner-api-external.md`](./partner-api-external.md), OpenAPI는 [`partner-api-external.openapi.yaml`](./partner-api-external.openapi.yaml).

가상 예시는 실재 고객이 아닙니다.

---

## 1. 데이터와 화면의 대응

| 화면 | 실제 저장소 | 조회 함수 | 이미 있는 내부 API |
| --- | --- | --- | --- |
| 후보자 DB | Supabase `public.tylife_b2b` | `queryLeads` (`category=candidates`) | `GET /api/admin/leads?category=candidates` |
| TM001 | `public.tm001_customers` + `public.tm001_stays` | `listTm001Customers`. `partner_code = "1"` 고정 | `GET /api/admin/tm001` |
| TM002 | `public.tm002_customers` | `listTm002Customers`. `partner_code = "2"` 고정. 숙박 테이블 없음 | `GET /api/admin/tm002` |
| 캘린더 | 아래 4종을 한 응답으로 합침 | `GET /api/admin/calendar` | 같은 경로 |

캘린더에 합쳐지는 원천:

1. `public.crm_calendar_events` — 업무 일정. `event_date`는 `DATE`.
2. `public.leads.meeting_at`, `public.tylife_b2b.meeting_at` — 소비자·후보자 대면(`meeting`)·통화약속(`call`). 저장 행이 아니라 조회 시 가상 일정.
3. `public.tm001_customers.meeting_at`, `public.tm002_customers.meeting_at` — 상담상태가 `재콜`인 행만 가상 일정(`call`).
4. 구글 캘린더 공개 iCal — **세션 직급이 admin일 때만** 같은 월 응답에 합침. 실패해도 나머지 일정은 반환.

TM001과 TM002는 테이블·상태값·검색 필드가 다릅니다. 하나를 다른 하나의 별칭으로 쓰지 않습니다.

## 2. 구현 구분

| 구분 | 경로 | 상태 |
| --- | --- | --- |
| 이미 구현 | `/api/admin/leads`, `/api/admin/tm001`, `/api/admin/tm002`, `/api/admin/calendar` 및 각 `/{id}` GET(캘린더 단건 GET은 없음) | 내부 CRM. 쿠키 세션. 메모·코멘트·세션 정보를 포함 |
| 파트너 API (외부) | `/api/partner/v1/candidates`, `/api/partner/v1/tm001/customers`, `/api/partner/v1/tm002/customers`, `/api/partner/v1/calendar/events` | Bearer `pk_live_…`. 키·권한 테이블 `061_partner_api.sql` |
| 키 관리 (내부) | `/api/admin/partner/clients`, `/api/admin/partner/keys`, `…/keys/[id]/revoke` | admin 세션만 |

내부 API를 파트너에게 열어 재사용하지 않습니다. 응답에 상담 메모, 관리자 코멘트, 담당자 내부 ID, 세션, 직원 목록이 포함됩니다.

## 3. 이미 구현된 내부 조회

외부 호출용이 아닙니다. 동작 확인용입니다.

### 3.1 공통 인증

- 쿠키 이름 `admin_session`. HTTP-only JWT(HS256). 만료 30일.
- 비밀키는 서버 환경변수 `ADMIN_SESSION_SECRET`.
- 쿠키가 없거나 검증 실패: HTTP 401, `{ "ok": false, "message": "인증이 필요합니다." }`.
- 직급 불일치: HTTP 403, `{ "ok": false, "message": "권한이 없습니다." }` 또는 경로별 문구.
- 파트너용 API 키, OAuth, mTLS는 **없습니다.**

직급: `admin`, `manager`, `sales`, `tm_admin`.

데이터 범위:

- 후보자: `admin`은 담당자 제한 없음. `manager`·`sales`는 로그인 사용자와 `staff_users.parent_id` 산하 `assignee_id`만. `tm_admin`은 이 API 403.
- TM001: `admin`·`tm_admin`은 `partner_code = "1"` 전체. `manager`·`sales`는 본인+산하 담당 건.
- TM002: `admin`·`tm_admin`은 `partner_code = "2"` 전체. `manager`는 본인+산하. `sales`는 403.
- 캘린더: `admin`·`manager`·`sales`·`tm_admin`. `tm_admin`은 `crm_calendar_events`와 리드 대면/통화를 빼고 TM001·TM002 재콜만. 구글 일정은 `admin`만.
- 매니저가 만든 `crm_calendar_events`는 `created_by_rank = manager`이면 관리자에게 비공개. 관리자가 만든 일정은 `visibility`와 `viewer_ids`로 매니저·영업자 열람을 제한.

타임존: 날짜 파라미터 `YYYY-MM-DD`, 월 `YYYY-MM`은 Asia/Seoul 달력. `created_at`·`assigned_at`·`meeting_at` 컬럼은 `timestamptz`(ISO-8601, 보통 `Z`). 후보자 목록의 `created_at` 문자열만 `YYYY-MM-DD HH:mm` KST이고, 같은 값의 ISO는 `created_at_iso`.

### 3.2 후보자 목록 — 구현됨

`GET /api/admin/leads`

저장소 `tylife_b2b`. `merge_status`가 `active`이거나 null인 행. 블랙리스트 `normalized_phone`, 숨김 목록은 제외.

검색 조건(모두 선택):

| 파라미터 | 동작 |
| --- | --- |
| `category` | `candidates` 또는 `b2b`일 때만 후보자. 생략 시 소비자 `leads` |
| `search` | 이름, 전화, `normalized_phone` 부분 일치 |
| `assignee_ids` | 담당자 UUID CSV. `__unassigned__`는 미배정이며 **admin만** |
| `team_ids` | 해당 직원 또는 그 `parent_id`인 담당 건 |
| `regions` | `region` 부분 일치. 후보자 조회는 `location` 컬럼을 조건에 넣지 않음 |
| `statuses` | 상담상태 CSV. 허용값: 배정전, 대기, 1차컨택, 부재(메신저완료), 이관요청, 상담완료, 통화약속, 대면확정, 가입완료, 번호오류 |
| `admin_statuses` | 관리자상태 키. DB 컬럼이 아니라 계산. 이 값이 있으면 최대 3000건을 가져온 뒤 메모리에서 자름 |
| `job_ranks`, `age_groups`, `jobs`, `entry_pages`, `utm_sources` | 각 컬럼 완전 일치 CSV |
| `date_from`, `date_to` | `created_at`의 KST 날짜. `date_to` 당일 포함, 다음 날 0시 미만 |
| `ids` | UUID 최대 200개. 다른 검색조건은 무시하고 스코프만 유지 |
| `need_reassign` 또는 `recontact` | `1`이면 관리자상태가 담당자 변경 필요인 행. sales는 403 |
| `tm_eligible` | `1`이면 동의 테이블 기준 TM 대상 id로 제한. 최대 2000 id |
| `limit` | 기본 50, 1–5000 |
| `offset` | 기본 0 |
| `skip_count` | `1`이면 `total` 생략 |

`admin_statuses` 또는 `category=all`이면 오프셋 페이징이 DB `range`가 아닙니다.

오류: 401, 403, 500 `{ "ok": false, "message": "조회 중 오류가 발생했습니다." }`. 잘못된 쿼리로 400을 반환하는 분기는 이 경로에 없습니다.

민감 필드(내부 응답에 **포함**됨. 외부 제공 여부는 4절):

| 필드 | 내용 | 외부 제공 |
| --- | --- | --- |
| `name`, `phone` | 개인정보 | 확인 필요. 내부에는 포함 |
| `memo` | 상담 메모. 상태 변경 시 자동 줄이 붙음 | 제공하지 않음. 내부 전용 |
| `admin_comment` | 관리자·매니저 코멘트 | 제공하지 않음. 내부 전용 |
| `memo_admin_unread` | 영업자 메모 미확인 | 제공하지 않음 |
| `consent` | 개인정보·광고 채널 동의 | 확인 필요. 내부에는 최신 동의가 붙음 |
| `assignee_id`, `assignee_history` | 내부 직원 식별·이력. 이력은 admin 조회만 | 제공하지 않음 |
| `utm_*`, `meta_ad_*`, `entry_page` | 광고·유입 | 확인 필요 |
| `admin_status` | 계산값. manager·admin에게만 값, 그 외 null | 제공하지 않음 |

가상 응답 일부:

```json
{
  "ok": true,
  "total": 1,
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "type": "후보자",
      "created_at": "2026-10-01 09:30",
      "created_at_iso": "2026-10-01T00:30:00.000Z",
      "name": "김가상",
      "phone": "010-0000-0000",
      "status": "대기",
      "memo": "[2026-10-01 09:30] 대기",
      "admin_comment": "",
      "region": "서울",
      "job": "회사원",
      "job_rank": ""
    }
  ]
}
```

### 3.3 TM001 고객 목록 — 구현됨

`GET /api/admin/tm001`

`tm001_customers`를 `partner_code = "1"`로 읽고, 페이지 고객의 `tm001_stays`를 붙입니다. 같은 차수·같은 정규화 전화번호는 1행입니다.

| 파라미터 | 동작 |
| --- | --- |
| `q` | 이름, 전화, `normalized_phone`, 숙소명 부분 일치 |
| `region` | 숙박 `tm001_stays.region` 완전 일치 |
| `status` | 상담상태 하나. 미접촉, 부재, 메신저완료, 유효통화, 관심, 재콜, 거절, 수신거부, 번호오류, 계약완료 |
| `assignee_id` | 담당자 UUID 하나 |
| `unassigned` | `1`이면 미배정. 스코프가 전체가 아니면 빈 결과 |
| `assigned_date` | 배정일 KST `YYYY-MM-DD` |
| `ids` | UUID 최대 200 |
| `limit` | 기본 20, 1–1000 |
| `offset` | 기본 0 |
| `meta` | `1`이거나 `offset=0`이면 직원 목록 등 부가 정보를 포함. `skipRegions=1`, `skipStayTotal=1`이면 지역 목록·숙박 합계를 건너뜀 |

정렬: `updated_at` 내림차순. 응답에는 `items[].stays[]`, `total`(고객 수), `stayTotal`(숙박 합)이 있습니다. 같은 응답의 `summary.customers`, `summary.stays`도 그 두 수입니다.

오류:

| HTTP | `message` |
| --- | --- |
| 401 | 인증이 필요합니다. |
| 403 | 접근 권한이 없습니다. |
| 503 | 테이블이 없으면 `TM001 테이블이 없습니다. Supabase에서 supabase/migrations/045_tm001_affiliate.sql 을 실행해 주세요.` |
| 500 | 위 조건이 아닌 예외는 저장소가 던진 문구를 `message`로 그대로 반환 |

민감 필드:

| 필드 | 외부 제공 |
| --- | --- |
| `name`, `phone`, `normalized_phone`, `raw_phone` | 확인 필요. 내부 포함 |
| `stays` (숙소, 지역, 객실, URL) | 확인 필요. 내부 포함 |
| `memo`, `comments`, `memo_admin_unread` | 제공하지 않음 |
| `assignee_id`, `assignee_history` | 제공하지 않음 |

### 3.4 TM002 회원 목록 — 구현됨

`GET /api/admin/tm002`

`tm002_customers`, `partner_code = "2"`. 숙박 배열 없음. 회원 정보 컬럼은 엑셀 원문을 가공하지 않고 둡니다. 주석상 카드번호·이메일·아이디는 저장하지 않습니다.

| 파라미터 | 동작 |
| --- | --- |
| `q` | 이름, 전화, 주소, 상세주소. 숫자 3자리 이상이면 `normalized_phone`도 부분 일치 |
| `status` | TM001과 같은 상태 목록 하나 |
| `assignee_id`, `unassigned`, `assigned_date`, `ids` | TM001과 같은 규칙 |
| `limit` | 기본 20, 1–1000 |
| `offset` | 기본 0 |

정렬: `updated_at` 내림차순, `id` 오름차순. `region` 파라미터는 없습니다.

오류:

| HTTP | `message` |
| --- | --- |
| 401 | 인증이 필요합니다. |
| 403 | 접근 권한이 없습니다. |
| 503 | 테이블이 없으면 `TM002 테이블이 없습니다. Supabase에서 supabase/migrations/060_tm002.sql 을 실행해 주세요.` |
| 500 | 위 조건이 아닌 예외는 저장소가 던진 문구를 `message`로 그대로 반환 |

민감 필드:

| 필드 | 외부 제공 |
| --- | --- |
| `name`, `phone`, `address`, `address_detail`, `joined_at`, `level`, `flag` | 확인 필요. 내부 포함 |
| `memo`, `comments`, `memo_admin_unread` | 제공하지 않음 |
| `assignee_id`, `assignee_history` | 제공하지 않음 |

### 3.5 캘린더 월 목록 — 구현됨

`GET /api/admin/calendar?month=YYYY-MM&types=`

`month`를 생략하면 오늘(Asia/Seoul)의 `YYYY-MM`입니다. 값이 `YYYY-MM`이 아니면 400, `message`는 `월 형식이 올바르지 않습니다.` 일정 조회 실패는 500, `message`는 `일정을 불러오지 못했습니다.`  
`types`를 생략하면 구현된 종류 전체. 잘못된 토큰은 무시됩니다. 종류: `lecture`, `general`, `important`, `deadline`, `holiday`, `meeting`, `call`, `google`.

페이지네이션 없음. 해당 월 전체를 한 번에 반환.

가상 일정 `source=lead_meeting`에는 `lead_name`, `lead_phone`, `lead_category`(`consumers` | `candidates` | `tm001` | `tm002`)가 붙습니다. 구글 일정은 `source=google_calendar`, `event_type=google`, `read_only=true`이고 본문 `body`에 iCal description이 들어갈 수 있습니다.

| 필드 | 외부 제공 |
| --- | --- |
| `lead_name`, `lead_phone` | 제공하지 않음. 개인정보 |
| `body` | 확인 필요. 내부 메모·구글 설명이 들어갈 수 있음 |
| `google` 종류 전체 | 제공하지 않음. admin 전용 병합 |
| `crm_calendar_events` 중 `visibility=admin_plus` 및 매니저 비공개 일정 | 제공하지 않음 |
| 제목·날짜만 있는 업무 일정 | 확인 필요 |

## 4. 새로 만들 API 초안

아래는 **미구현**입니다. 인증 방식, 파트너가 받을 범위, 개인정보 필드 포함 여부는 코드에 없습니다. 초안은 다음만 고정합니다.

- 내부 쿠키 세션을 요구하지 않는 별도 경로.
- 기본 응답에서 상담 메모, 코멘트, 미확인 플래그, 담당자 UUID, 담당 이력, 구글 일정, 리드 전화번호를 빼는 것.
- 이름·전화·주소·숙박의 포함 여부는 **확인 필요**로 두고, OpenAPI 예시에는 넣지 않습니다. 확인 전까지 상태·일자·비식별 id만 예시로 둡니다.

확인 필요:

- 파트너 인증(키, mTLS, OAuth 중 무엇).
- 파트너별 데이터 범위(전체인지, 담당 조직인지, 계약된 상태만인지).
- `name`, `phone`, TM002 주소, TM001 `stays`를 줄지.
- 캘린더에서 `crm_calendar_events`와 재콜 중 어느 원천만 줄지.
- 호출량 제한. 코드에 없음.
- 공개 베이스 URL. 코드에 파트너 호스트가 없음.

공통 오류 초안(미구현):

| HTTP | `code` | 언제 |
| --- | --- | --- |
| 401 | `unauthorized` | 자격 증명 없음 또는 검증 실패 |
| 403 | `forbidden` | 자격은 있으나 해당 데이터 범위 밖 |
| 400 | `invalid_query` | 날짜·월·상태·limit 형식 오류 |
| 500 | `internal_error` | 저장소 오류. 상세 SQL은 반환하지 않음 |

페이징 초안: `limit` 기본 50, 최대 200, `offset` 기본 0. 내부 API의 5000·1000 한도를 그대로 쓰지 않습니다. 캘린더는 내부와 같이 월 단위이며 페이지 파라미터는 없습니다.

시간: 요청 날짜는 `YYYY-MM-DD`, 월은 `YYYY-MM`, Asia/Seoul. 응답 시각은 ISO-8601 UTC(`Z`).

### 4.1 `GET /api/partner/v1/candidates` — 미구현

`tylife_b2b`의 active 행. 파라미터는 내부 후보자 조회와 같은 의미의 `status`, `date_from`, `date_to`, `region`, `limit`, `offset`만 초안에 둡니다. `search`로 전화번호를 받는 것은 확인 필요.

가상 예시(개인정보 제외):

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "status": "대기",
      "created_at": "2026-10-01T00:30:00.000Z",
      "region": "서울"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 1
}
```

### 4.2 `GET /api/partner/v1/tm001/customers` — 미구현

`tm001_customers`에서 `partner_code = "1"`. `status`, `assigned_date`, `limit`, `offset`. 숙박은 확인 전까지 `stays`를 넣지 않습니다.

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000101",
      "batch_code": "014",
      "status": "재콜",
      "updated_at": "2026-10-01T02:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 1
}
```

### 4.3 `GET /api/partner/v1/tm002/customers` — 미구현

`tm002_customers`에서 `partner_code = "2"`. `status`, `assigned_date`, `limit`, `offset`. 주소·이름은 확인 전 제외.

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000201",
      "batch_code": "003",
      "status": "메신저완료",
      "joined_at": "2024-05-02T15:00:00.000Z",
      "updated_at": "2026-10-01T02:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 1
}
```

`joined_at`도 회원 식별에 쓰일 수 있으므로 외부 포함은 확인 필요. 예시에는 형식을 보이기 위해 가상 시각만 넣었습니다.

### 4.4 `GET /api/partner/v1/calendar/events` — 미구현

`month=YYYY-MM` 필수. 구글 일정과 `lead_phone`은 넣지 않습니다. 어떤 `source`를 합칠지는 확인 필요. 예시에는 업무 일정 한 건만 둡니다.

```json
{
  "month": "2026-10",
  "time_zone": "Asia/Seoul",
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000301",
      "source": "crm_calendar_events",
      "event_date": "2026-10-03",
      "all_day": true,
      "event_type": "general",
      "title": "가상 업무 일정"
    }
  ]
}
```

## 5. 확인 필요 목록

- 파트너 인증 방식과 키 발급 주체.
- 파트너에게 후보자·TM 이름, 전화번호, TM002 주소, TM001 숙박을 제공할지.
- 캘린더 원천 중 업무 일정, 후보자 `meeting_at`, TM 재콜을 각각 포함할지.
- 파트너가 보는 행의 범위가 내부 직급 스코프와 같은지, 별도 계약 범위인지.
- 공개 베이스 URL, 호출량 제한, IP 제한.
