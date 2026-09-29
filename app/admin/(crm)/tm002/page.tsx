"use client";

import { Suspense } from "react";
import Tm002PageClient from "./Tm002PageClient";

export default function Tm002Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--crm-muted)" }}>로딩 중...</div>}>
      <Tm002PageClient />
    </Suspense>
  );
}
