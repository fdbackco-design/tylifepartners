import { NextResponse } from "next/server";
import type { PartnerErrorCode } from "@/lib/partner/types";

export function partnerError(
  code: PartnerErrorCode,
  status: number,
  message?: string
): NextResponse {
  const body: { code: PartnerErrorCode; message?: string } = { code };
  if (message) body.message = message;
  return NextResponse.json(body, { status });
}

export function partnerJson<T extends Record<string, unknown>>(
  data: T,
  status = 200
): NextResponse {
  return NextResponse.json(data, { status });
}
