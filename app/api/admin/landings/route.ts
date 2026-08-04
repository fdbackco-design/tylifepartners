import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import {
  createManagedLanding,
  listManagedLandings,
} from "@/lib/managedLandings/store";
import type { ManagedCtaPosition, ManagedLandingInput } from "@/lib/managedLandings/types";

export async function GET() {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  try {
    const items = await listManagedLandings();
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GET /api/admin/landings:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as ManagedLandingInput;
    const item = await createManagedLanding({
      path: String(body.path ?? ""),
      title: body.title,
      custom_host: body.custom_host,
      hero1_url: body.hero1_url,
      hero2_url: body.hero2_url,
      show_brochure: body.show_brochure,
      brochure_url: body.brochure_url,
      cta_position: body.cta_position as ManagedCtaPosition | undefined,
      sections: body.sections,
      form_config: body.form_config,
      published: body.published,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /경로|예약|올바르지|이미 사용/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }
}
