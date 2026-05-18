"use client";

import { useSearchParams } from "next/navigation";
import LandingSectionDebugOverlay from "@/app/_components/LandingSectionDebugOverlay";

const IS_DEV = process.env.NODE_ENV === "development";

export default function LandingSectionDebugGate() {
  const searchParams = useSearchParams();

  if (!IS_DEV) return null;
  if (searchParams.get("debugSections") !== "1") return null;

  return <LandingSectionDebugOverlay />;
}
