"use client";

import { useState, useEffect } from "react";
import { parseUTMFromUrl, type UTMParams } from "./utm";

/**
 * URL의 UTM 파라미터를 파싱하여 반환
 * 페이지 로드 시 한 번 파싱, sessionStorage에 캐시 (같은 세션 내 리퍼러 유지)
 */
export function useUTM(): UTMParams {
  const [utm, setUtm] = useState<UTMParams>({});

  useEffect(() => {
    const stored = typeof window !== "undefined" && sessionStorage.getItem("tylife_utm");
    if (stored) {
      try {
        setUtm(JSON.parse(stored));
        return;
      } catch {
        sessionStorage.removeItem("tylife_utm");
      }
    }

    const params = parseUTMFromUrl(
      typeof window !== "undefined" ? window.location.search : ""
    );
    if (Object.keys(params).length > 0) {
      setUtm(params);
      sessionStorage.setItem("tylife_utm", JSON.stringify(params));
    }
  }, []);

  return utm;
}
