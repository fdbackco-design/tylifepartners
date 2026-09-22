import { notFound } from "next/navigation";
import CodeLandingRuntime from "@/app/_components/CodeLandingRuntime";

export const dynamic = "force-dynamic";
export default function Preview() {
  if (process.env.NODE_ENV !== "development" || process.env.LOCAL_REVIEW_MODE !== "1") notFound();
  return <CodeLandingRuntime id="1f99fc24-1ebe-4288-814d-332274ea1959" slug="feedlife-local-preview" path="/0907s" title="FEED LIFE — 로컬 검수" bundleUrl="/api/dev/feedlife-preview?file=bundle.js" cssUrl="/api/dev/feedlife-preview?file=styles.css" formProfile="feedlife-v5" disableAnalytics />;
}
