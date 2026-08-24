"use client";

import { Suspense } from "react";
import LeadList from "@/app/admin/_components/LeadList";

export default function ReassignPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--crm-muted)" }}>로딩 중...</div>}>
      <LeadList category="all" needReassign title="담당자 변경 필요" />
    </Suspense>
  );
}
