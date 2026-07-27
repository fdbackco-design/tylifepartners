"use client";

import { useSearchParams } from "next/navigation";
import LandingSectionDebugOverlay from "@/app/_components/LandingSectionDebugOverlay";

const IS_DEV = process.env.NODE_ENV === "development";

export default function LandingSectionDebugGate() {
  const searchParams = useSearchParams();

  const enabled = searchParams.get("debugSections") === "1";
  // 로컬 개발 또는 관리자 미리보기 토큰(?adminPreview=1)에서만 노출
  const adminPreview = searchParams.get("adminPreview") === "1";
  if (!enabled) return null;
  if (!IS_DEV && !adminPreview) return null;

  return <LandingSectionDebugOverlay />;
}
