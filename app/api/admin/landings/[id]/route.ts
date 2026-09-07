import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import {
  getBuiltinLandingById,
  isBuiltinLandingId,
  setBuiltinLandingPublished,
} from "@/lib/managedLandings/builtinLandings";
import {
  deleteManagedLanding,
  getManagedLandingById,
  updateManagedLanding,
} from "@/lib/managedLandings/store";
import type { ManagedCtaPosition, ManagedLandingInput } from "@/lib/managedLandings/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    if (isBuiltinLandingId(id)) {
      const builtin = getBuiltinLandingById(id);
      if (!builtin) {
        return NextResponse.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
      }
      const { fetchBuiltinPublishMap } = await import("@/lib/managedLandings/builtinLandings");
      const map = await fetchBuiltinPublishMap();
      return NextResponse.json({
        ok: true,
        item: { ...builtin, published: map[builtin.path] !== false },
      });
    }
    const item = await getManagedLandingById(id);
    if (!item) {
      return NextResponse.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Partial<ManagedLandingInput>;

    if (isBuiltinLandingId(id)) {
      const builtin = getBuiltinLandingById(id);
      if (!builtin) {
        return NextResponse.json({ ok: false, message: "찾을 수 없습니다." }, { status: 404 });
      }
      if (body.published == null) {
        return NextResponse.json(
          { ok: false, message: "고정 배포 랜딩은 공개 상태만 변경할 수 있습니다." },
          { status: 400 }
        );
      }
      const published = Boolean(body.published);
      await setBuiltinLandingPublished(builtin.path, published);
      const item = { ...builtin, published };
      void writeAdminAudit({
        actor: actorFromSession(session),
        action: "landing.update",
        resourceType: "landing",
        resourceId: id,
        summary: `고정 랜딩 공개 변경: ${item.path} → ${published ? "공개" : "비공개"}`,
        detail: { path: item.path, published },
        request,
      });
      return NextResponse.json({ ok: true, item });
    }

    const item = await updateManagedLanding(id, {
      path: body.path,
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
    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "landing.update",
      resourceType: "landing",
      resourceId: id,
      summary: `랜딩 수정: ${item.title || item.path}`,
      detail: {
        path: item.path,
        title: item.title,
        published: item.published,
        changed: Object.keys(body),
      },
      request,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /찾을 수 없/i.test(msg)
      ? 404
      : /경로|예약|올바르지|이미 사용|고정 배포/i.test(msg)
        ? 400
        : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    if (isBuiltinLandingId(id)) {
      return NextResponse.json(
        { ok: false, message: "고정 배포 랜딩은 삭제할 수 없습니다." },
        { status: 400 }
      );
    }
    const existing = await getManagedLandingById(id);
    await deleteManagedLanding(id);
    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "landing.delete",
      resourceType: "landing",
      resourceId: id,
      summary: `랜딩 삭제: ${existing?.title || existing?.path || id}`,
      detail: { path: existing?.path, title: existing?.title },
      request,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
