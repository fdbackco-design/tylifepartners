import { CONSENT_VERSION, FORM_OPTIONS } from "./consent-config.mjs";

export class ValidationError extends Error {
  constructor(public errors: Array<{ field: string; message: string }>) {
    super("신청 항목을 확인해 주세요.");
  }
}

/** Validate the v5 form only. Retention/deletion is managed by the operator. */
export function validateSubmission(payload: Record<string, unknown>) {
  const errors: Array<{ field: string; message: string }> = [];
  const fail = (field: string, message: string) => errors.push({ field, message });
  const consent = payload.consent && typeof payload.consent === "object"
    ? payload.consent as Record<string, unknown> : {};
  if (payload.consentVersion !== CONSENT_VERSION) fail("consentVersion", "동의문이 변경되었습니다. 새로고침해 주세요.");
  if (consent.requiredPrivacy !== true) fail("requiredPrivacy", "필수 개인정보 수집·이용에 동의해 주세요.");
  if (consent.optionalConsultation !== undefined && typeof consent.optionalConsultation !== "boolean") {
    fail("optionalConsultation", "동의 여부를 확인해 주세요.");
  }
  if (consent.marketingUse !== undefined && consent.marketingUse !== false) fail("marketingUse", "현재 마케팅 동의는 운영하지 않습니다.");
  const channels = consent.channels && typeof consent.channels === "object" ? consent.channels as Record<string, unknown> : {};
  for (const [channel, value] of Object.entries(channels)) if (value !== false) fail(channel, "현재 광고 수신 동의는 운영하지 않습니다.");
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.replace(/[ -]/g, "") : "";
  if (!/^[가-힣]{2,10}$/.test(name)) fail("name", "이름을 한글 2~10자로 입력해 주세요.");
  if (!/^010\d{8}$/.test(phone)) fail("phone", "010으로 시작하는 휴대전화번호 11자리를 입력해 주세요.");
  function option(key: keyof typeof FORM_OPTIONS, required = false): string | undefined {
    const value = payload[key];
    if (value == null || value === "") {
      if (required) fail(key, "지역을 선택해 주세요.");
      return undefined;
    }
    if (typeof value !== "string" || !FORM_OPTIONS[key].includes(value.trim())) {
      fail(key, "목록에서 항목을 선택해 주세요.");
      return undefined;
    }
    return value.trim();
  }
  const data = {
    name, phone, region: option("region", true), consultationTime: option("consultationTime"),
    ageBand: consent.optionalConsultation === true ? option("ageBand") : undefined,
    currentRole: consent.optionalConsultation === true ? option("currentRole") : undefined,
  };
  if (errors.length) throw new ValidationError(errors);
  return { data };
}
