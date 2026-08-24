"use client";

import { Suspense } from "react";
import LeadList from "@/app/admin/_components/LeadList";

export default function ConsumersPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--crm-muted)" }}>로딩 중...</div>}>
      <LeadList category="consumers" title="소비자 DB" />
    </Suspense>
  );
}
