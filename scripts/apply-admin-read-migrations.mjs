/**
 * 063 + 064 admin read API 마이그레이션 (Postgres 직접 연결)
 * node --env-file=.env.local scripts/apply-admin-read-migrations.mjs
 */
import fs from "fs";
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
const ref = process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];

const connectionString =
  url ||
  (password && ref
    ? `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`
    : null);

if (!connectionString) {
  console.error("DATABASE_URL 또는 SUPABASE_DB_PASSWORD + SUPABASE_URL 필요");
  process.exit(1);
}

const files = ["supabase/migrations/063_admin_read_api.sql", "supabase/migrations/064_admin_read_api_rls.sql"];
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const f of files) {
    const sql = fs.readFileSync(f, "utf8");
    await client.query(sql);
    console.log(`applied ${f}`);
  }
} finally {
  await client.end();
}
