/**
 * 062 RLS 마이그레이션 적용 (Postgres 직접 연결)
 * SUPABASE_DB_PASSWORD 또는 DATABASE_URL 필요
 * node --env-file=.env.local scripts/apply-partner-062-rls.mjs
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

const sql = fs.readFileSync("supabase/migrations/062_partner_api_rls.sql", "utf8");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("062_partner_api_rls applied");
} finally {
  await client.end();
}
