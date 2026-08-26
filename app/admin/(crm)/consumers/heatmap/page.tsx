"use client";

import { Suspense } from "react";
import CandidateLeadHeatmapPage from "../../candidates/heatmap/CandidateLeadHeatmapClient";

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>로딩 중…</main>}>
      <CandidateLeadHeatmapPage category="consumers" />
    </Suspense>
  );
}
