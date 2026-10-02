# 파트너 조회 API (외부 공유용)

읽기 전용 HTTP API입니다. CRM 관리 화면·관리자 로그인과 **분리**되어 있으며, 발급받은 API 키로만 호출합니다.

- **인증**: `Authorization: Bearer pk_live_…`
- **기본 시간대**: 날짜·월 파라미터는 `Asia/Seoul`. 시각 필드는 ISO-8601(UTC `Z`)입니다.
- **페이지네이션**: `limit` 기본 50, 최대 200. `offset` 기본 0.
- **호출 제한**: 키마다 분당 최대 횟수(기본 60, 최대 600). 초과 시 HTTP 429, `code: rate_limited`.

## 제공 데이터 범위

키마다 **리소스 종류**와 **행 범위**가 다릅니다. 범위가 비어 있으면 전체가 아니라 **조회 불가**(`scope_not_configured`)입니다.

| 리소스 | 행 범위 (키 발급 시 설정) |
| --- | --- |
| 후보자 | `utm_source`, `entry_page`, `region` 중 **하나 이상** 필수. 설정된 조건은 **AND**로 적용됩니다. |
| TM001 고객 | `batch_code` 목록 필수 |
| TM002 회원 | `batch_code` 목록 필수 |
| 캘린더 | 공개 업무 일정만 (`visibility=all`, 관리자 작성). 구글·상담 일정·개인 일정은 **제외**. **파트너별 행 구분 없음** — 키에 캘린더 권한이 있으면 동일한 공개 일정 집합을 봅니다. |

### 기본으로 제외되는 정보

이름, 전화번호, 주소, 숙박 상세, 상담 메모, 관리자 코멘트, 담당자, 동의·광고 상세, 구글 캘린더, 리드 대면/통화 가상 일정, TM 재콜 일정.

### 후보자 응답 필드 (예)

`id`, `status`, `created_at`, `region`, `job`, `job_rank`, `age_group`, `entry_page`, `utm_source`

### TM001 응답 필드 (예)

`id`, `batch_code`, `status`, `product`, `updated_at`

### TM002 응답 필드 (예)

`id`, `batch_code`, `status`, `level`, `flag`, `updated_at`

### 캘린더 응답 필드 (예)

`id`, `event_date`, `event_type`, `all_day`, `start_at`, `end_at`, `title` (본문 `body` 없음)

## 엔드포인트

**베이스 URL:** `https://www.feed-life.com`

### GET `https://www.feed-life.com/api/partner/v1/candidates`

| 쿼리 | 설명 |
| --- | --- |
| `status` | 상담상태 1개 |
| `date_from`, `date_to` | 등록일 `YYYY-MM-DD` (KST) |
| `region` | 지역 부분 일치 (키에 region 범위가 있을 때 교차) |
| `limit`, `offset` | 페이지네이션 |

### GET `https://www.feed-life.com/api/partner/v1/tm001/customers`

| 쿼리 | 설명 |
| --- | --- |
| `status` | 상담상태 1개 |
| `assigned_date` | 배정일 `YYYY-MM-DD` |
| `batch_code` | 쉼표 구분. 키에 허용된 batch만 |
| `limit`, `offset` | 페이지네이션 |

### GET `https://www.feed-life.com/api/partner/v1/tm002/customers`

TM001과 동일한 쿼리 규칙 (TM002 batch 범위).

### GET `https://www.feed-life.com/api/partner/v1/calendar/events`

| 쿼리 | 설명 |
| --- | --- |
| `month` | **필수** `YYYY-MM` |

## 오류 응답

JSON `{ "code": "…", "message": "…" }` (`message`는 선택)

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | unauthorized | 키 없음·형식 오류·만료 |
| 403 | forbidden | 리소스 권한 없음 |
| 403 | scope_not_configured | 행 범위 미설정 |
| 400 | invalid_query | 파라미터 형식 오류 |
| 429 | rate_limited | 분당 호출 초과 |
| 500 | internal_error | 서버 오류 |

## curl 예시 (가상 키)

```bash
export BASE="https://www.feed-life.com"
export PARTNER_KEY="pk_live_REPLACE_WITH_ISSUED_KEY"

# 1) 인증 없음 → 401
curl -sS -w "\nHTTP %{http_code}\n" \
  "$BASE/api/partner/v1/candidates?limit=1"

# 2) 정상 조회 (키·범위가 맞을 때 → 200)
curl -sS -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $PARTNER_KEY" \
  "$BASE/api/partner/v1/candidates?limit=10&offset=0"

# 3) 권한 없는 리소스 (예: TM002 미허용 키) → 403
curl -sS -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $PARTNER_KEY" \
  "$BASE/api/partner/v1/tm002/customers?limit=1"
```

## OpenAPI

머신-readable 명세: [`partner-api-external.openapi.yaml`](./partner-api-external.openapi.yaml)

## 아직 결정이 필요한 항목

- 이름·전화번호·주소·숙박·가입일 등 개인정보 필드의 단계적 제공 여부
- 후보자·TM 행에 `partner_id` 컬럼이 없음 → 발급 시 `utm_source` / `entry_page` / `region`, TM `batch_code`로만 범위를 정해야 함
- `region`만 넓게 열면 동일 지역 타 파트너 유입과 구분 불가 — 계약별 utm·entry 우선 권장
- 캘린더는 파트너 소유 관계 없음 → 전 파트너 공통 공개 일정 또는 `partner_id`·일정 태그 도입 결정 필요
- 파트너별 IP 허용 목록·키 로테이션 정책
