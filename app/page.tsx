import LandingAnalyticsTracker from "@/app/_components/LandingAnalyticsTracker";
import ParentLandingPage from "@/app/_components/ParentLandingPage";

export default function LandingPage() {
  return (
    <>
      <LandingAnalyticsTracker landingKey="parent_main" />
      <ParentLandingPage
      hero1="/assets/hero_b2c_01.jpg"
      hero2="/assets/hero_b2c_02.jpg"
      karrotPage="parent"
      entryPage="/"
      />
    </>
  );
}
