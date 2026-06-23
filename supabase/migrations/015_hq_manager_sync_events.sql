-- 본사 시트1 G열 담당자 배정 + Apps Script 동기화 이벤트 (멱등·재시도)
CREATE TABLE IF NOT EXISTS hq_manager_sync_events (
  event_id uuid PRIMARY KEY,
  spreadsheet_id text NOT NULL,
  sheet_name text NOT NULL,
  row_number integer NOT NULL,
  new_manager_name text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  sheet_update_status text NOT NULL DEFAULT 'pending',
  sync_status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hq_manager_sync_events_sync_status
  ON hq_manager_sync_events (sync_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hq_manager_sync_events_phone
  ON hq_manager_sync_events (phone, created_at DESC);
