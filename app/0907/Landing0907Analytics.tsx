"use client";

import LandingAnalyticsTracker from "@/app/_components/LandingAnalyticsTracker";
import { useMeasuredLandingSections } from "@/app/_components/useMeasuredLandingSections";

const LANDING_KEY = "landing_0907";

/** /0907 DOM 섹션을 측정해 스크롤·체류 히트맵 트래킹에 연결 */
export default function Landing0907Analytics() {
  const sections = useMeasuredLandingSections(".landing-0907");
  return <LandingAnalyticsTracker landingKey={LANDING_KEY} sections={sections} />;
}
