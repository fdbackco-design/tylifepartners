"use client";

import { Suspense } from "react";
import ResourcesPageClient from "./ResourcesPageClient";

export default function ResourcesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--crm-muted)" }}>로딩 중...</div>}>
      <ResourcesPageClient />
    </Suspense>
  );
}
