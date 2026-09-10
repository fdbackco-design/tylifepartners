"use client";

import { Suspense } from "react";
import Tm001PageClient from "./Tm001PageClient";

export default function Tm001Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--crm-muted)" }}>로딩 중...</div>}>
      <Tm001PageClient />
    </Suspense>
  );
}
