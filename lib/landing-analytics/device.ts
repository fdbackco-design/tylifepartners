import type { DeviceType } from "@/lib/landing-analytics/types";

export function getDeviceType(viewportWidth: number): DeviceType {
  if (viewportWidth < 768) return "mobile";
  if (viewportWidth < 1024) return "tablet";
  return "desktop";
}
