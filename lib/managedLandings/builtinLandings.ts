import { DEFAULT_FORM_CONFIG } from "@/lib/managedLandings/formConfig";
import type { ManagedLandingRow } from "@/lib/managedLandings/types";

/** 코드로 고정 배포된 랜딩 — /admin/landings 목록에 표시 */
export type BuiltinLanding = ManagedLandingRow & {
  builtin: true;
  landing_key: string;
  entry_pages: string[];
};

const now = "2026-09-07T00:00:00.000Z";

export const BUILTIN_LANDINGS: BuiltinLanding[] = [
  {
    id: "builtin_0907",
    path: "/0907",
    slug: "0907",
    title: "FEED LIFE 리크루팅",
    custom_host: null,
    hero1_url: "/assets/0907/sun-cruise.webp",
    hero2_url: "/assets/0907/all-life-health.webp",
    show_brochure: false,
    brochure_url: null,
    cta_position: "from_bottom",
    sections: [],
    form_config: DEFAULT_FORM_CONFIG,
    published: true,
    kind: "code",
    code_bundle_url: null,
    code_css_url: null,
    code_asset_base: null,
    code_meta: { source_zip: "app/0907 (고정 배포)" },
    created_at: now,
    updated_at: now,
    builtin: true,
    landing_key: "landing_0907",
    entry_pages: ["/0907", "0907"],
  },
];

export function isBuiltinLandingId(id: string): boolean {
  return id.startsWith("builtin_");
}

/** DB 목록에 같은 path가 없으면 고정 랜딩을 앞에 병합 */
export function mergeBuiltinLandings(items: ManagedLandingRow[]): Array<ManagedLandingRow & { builtin?: boolean; landing_key?: string }> {
  const paths = new Set(items.map((i) => i.path));
  const extras = BUILTIN_LANDINGS.filter((b) => !paths.has(b.path));
  return [...extras, ...items];
}
