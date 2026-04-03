"use client";

import { useState, useEffect } from "react";
import { parseUTMFromUrl, type UTMParams } from "./utm";

const STORAGE_KEY = "tylife_utm";

function readStored(): UTMParams {
  if (typeof window === "undefined") return {};
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as UTMParams;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

/**
 * URL의 UTM 파라미터를 파싱하여 반환
 * sessionStorage로 세션 내 이전 유입을 유지하되, 현재 주소창 쿼리에 있는 UTM은 항상 병합(덮어씀)합니다.
 * (예: 메인 방문 후 /business?utm_content=banner 로 이동 시 content가 반영되도록)
 */
export function useUTM(): UTMParams {
  const [utm, setUtm] = useState<UTMParams>({});

  useEffect(() => {
    const fromUrl = parseUTMFromUrl(
      typeof window !== "undefined" ? window.location.search : ""
    );
    const base = readStored();
    const merged: UTMParams = { ...base, ...fromUrl };

    setUtm(merged);
    if (Object.keys(merged).length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }
  }, []);

  return utm;
}
