"use client";

import { useCallback, useEffect, useState } from "react";
import {
  computeLandingScrollMetrics,
  formatYRatio,
  type LandingScrollMetrics,
} from "@/lib/landingScrollMetrics";

const INITIAL: LandingScrollMetrics = {
  scrollPercent: 0,
  yRatioTop: 0,
  yRatioCenter: 0,
  yRatioBottom: 0,
};

export default function LandingSectionDebugOverlay() {
  const [metrics, setMetrics] = useState<LandingScrollMetrics>(INITIAL);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setMetrics(computeLandingScrollMetrics());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    return () => {
      window.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, [refresh]);

  const handleCopy = async () => {
    const top = formatYRatio(metrics.yRatioTop);
    const center = formatYRatio(metrics.yRatioCenter);
    const text = `top: ${top}, center: ${center}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("복사됨");
    } catch {
      setCopyHint("복사 실패");
    }
    setTimeout(() => setCopyHint(null), 1500);
  };

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 2147483646,
        maxWidth: 280,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(15, 23, 42, 0.92)",
        color: "#e2e8f0",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        lineHeight: 1.45,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        pointerEvents: "auto",
        userSelect: "none",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#94a3b8", fontSize: 10 }}>
        SECTION DEBUG
      </div>
      <Row label="스크롤 %" value={`${metrics.scrollPercent.toFixed(1)}%`} />
      <Row label="상단 y_ratio" value={formatYRatio(metrics.yRatioTop)} />
      <Row label="중앙 y_ratio" value={formatYRatio(metrics.yRatioCenter)} />
      <Row label="하단 y_ratio" value={formatYRatio(metrics.yRatioBottom)} />
      <button
        type="button"
        onClick={handleCopy}
        style={{
          marginTop: 8,
          width: "100%",
          padding: "6px 8px",
          border: "1px solid #475569",
          borderRadius: 6,
          background: "#1e293b",
          color: "#f8fafc",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {copyHint ?? "현재 위치 복사"}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color: "#f1f5f9" }}>{value}</span>
    </div>
  );
}
