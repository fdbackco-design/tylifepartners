"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_CONSENT_VERSION } from "@/lib/crm/consentConstants";

export type ConsentFormState = {
  privacy_required: boolean;
  custom_info_consent: boolean;
  marketing_consent: boolean;
  ad_phone_consent: boolean;
  ad_sms_consent: boolean;
  ad_kakao_consent: boolean;
  ad_email_consent: boolean;
};

export function emptyConsentForm(): ConsentFormState {
  return {
    privacy_required: false,
    custom_info_consent: false,
    marketing_consent: false,
    ad_phone_consent: false,
    ad_sms_consent: false,
    ad_kakao_consent: false,
    ad_email_consent: false,
  };
}

/** 랜딩 → /api/lead · /api/business-lead body에 넣을 동의 필드 */
export function consentApiFields(state: ConsentFormState): Record<string, unknown> {
  return {
    privacy_required: state.privacy_required,
    custom_info_consent: state.custom_info_consent,
    marketing_consent: state.marketing_consent ? 1 : null,
    ad_phone_consent: state.ad_phone_consent,
    ad_sms_consent: state.ad_sms_consent,
    ad_kakao_consent: state.ad_kakao_consent,
    ad_email_consent: state.ad_email_consent,
    consent_version: DEFAULT_CONSENT_VERSION,
  };
}

type DetailKey = "privacy" | "custom" | "marketing" | "ads" | null;

function DetailPanel({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div
      style={{
        marginTop: 8,
        marginLeft: 32,
        padding: compact ? "10px 10px" : "12px 12px",
        borderRadius: 8,
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.06)",
        fontSize: compact ? 12 : 13,
        lineHeight: 1.65,
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontWeight: 800, color: "var(--text-primary, #212529)", marginBottom: 8 }}>{children}</div>;
}

function SubTitle({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 10, fontWeight: 700 }}>{children}</div>;
}

function Bullet({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 3 }}>- {children}</div>;
}

function DetailToggle({
  open,
  onToggle,
  compact,
}: {
  open: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        flexShrink: 0,
        marginLeft: "auto",
        padding: 0,
        border: "none",
        background: "transparent",
        color: "var(--text-secondary)",
        fontSize: compact ? 12 : 13,
        fontWeight: 600,
        textDecoration: "underline",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      aria-expanded={open}
    >
      {open ? "닫기" : "상세보기"}
    </button>
  );
}

export default function PrivacyConsentSection({
  value,
  onChange,
  compact = false,
}: {
  value: ConsentFormState;
  onChange: (next: ConsentFormState) => void;
  compact?: boolean;
}) {
  const autoId = useId();
  const [openDetail, setOpenDetail] = useState<DetailKey>(null);

  const ids = useMemo(
    () => ({
      all: `${autoId}-all`,
      privacy: `${autoId}-privacy`,
      custom: `${autoId}-custom`,
      marketing: `${autoId}-marketing`,
      phone: `${autoId}-phone`,
      sms: `${autoId}-sms`,
      kakao: `${autoId}-kakao`,
      email: `${autoId}-email`,
    }),
    [autoId]
  );

  const allChecked =
    value.privacy_required &&
    value.custom_info_consent &&
    value.marketing_consent &&
    value.ad_phone_consent &&
    value.ad_sms_consent &&
    value.ad_kakao_consent &&
    value.ad_email_consent;

  const setAll = (next: boolean) => {
    onChange({
      privacy_required: next,
      custom_info_consent: next,
      marketing_consent: next,
      ad_phone_consent: next,
      ad_sms_consent: next,
      ad_kakao_consent: next,
      ad_email_consent: next,
    });
  };

  const setChannel = (
    key: "ad_phone_consent" | "ad_sms_consent" | "ad_kakao_consent" | "ad_email_consent",
    next: boolean
  ) => {
    onChange({ ...value, [key]: next });
  };

  const toggleDetail = (key: Exclude<DetailKey, null>) => {
    setOpenDetail((cur) => (cur === key ? null : key));
  };

  const checkStyle = (size: number) =>
    ({
      width: size,
      height: size,
      marginTop: 2,
      flexShrink: 0,
    }) as const;

  const rowLabel = {
    fontSize: compact ? 13 : 14,
    lineHeight: 1.4,
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none" as const,
    flex: 1,
    minWidth: 0,
  };

  const channelLabel = {
    fontSize: compact ? 12 : 13,
    lineHeight: 1.35,
    fontWeight: 500,
    cursor: "pointer",
    userSelect: "none" as const,
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          padding: compact ? "10px 12px" : "12px 12px",
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "#f8f9fa",
        }}
      >
        {/* 전체 동의 */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <input
            id={ids.all}
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setAll(e.target.checked)}
            style={checkStyle(22)}
          />
          <label
            htmlFor={ids.all}
            style={{
              fontSize: compact ? 14 : 15,
              lineHeight: 1.35,
              fontWeight: 700,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            전체 동의
          </label>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {/* 1. 필수 개인정보 */}
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <input
                id={ids.privacy}
                type="checkbox"
                checked={value.privacy_required}
                onChange={(e) => onChange({ ...value, privacy_required: e.target.checked })}
                style={checkStyle(20)}
              />
              <label htmlFor={ids.privacy} style={rowLabel}>
                [필수] 상담을 위한 개인정보 동의
              </label>
              <DetailToggle
                open={openDetail === "privacy"}
                onToggle={() => toggleDetail("privacy")}
                compact={compact}
              />
            </div>
            {openDetail === "privacy" ? (
              <DetailPanel compact={compact}>
                <SectionTitle>1. [필수] 상담을 위한 개인정보 동의</SectionTitle>
                <div style={{ fontWeight: 700 }}>개인정보 수집·이용 동의</div>
                <div style={{ marginTop: 6 }}>
                  피드백(브랜드명 FEED LIFE)은 고객의 상담 신청 및 진행을 위해 다음과 같이 개인정보를
                  수집·이용합니다.
                </div>
                <SubTitle>수집·이용 목적</SubTitle>
                <Bullet>상담 신청 접수</Bullet>
                <Bullet>본인 확인 및 상담 연락</Bullet>
                <Bullet>상담 일정 조정</Bullet>
                <Bullet>문의사항 대응</Bullet>
                <Bullet>상담 이력 관리</Bullet>
                <SubTitle>수집·이용 항목</SubTitle>
                <Bullet>성명</Bullet>
                <Bullet>휴대전화번호</Bullet>
                <Bullet>상담 희망 시간</Bullet>
                <Bullet>문의 내용</Bullet>
                <SubTitle>보유·이용 기간</SubTitle>
                <Bullet>상담 종료일로부터 1년</Bullet>
                <Bullet>
                  단, 관계 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안 보관
                </Bullet>
                <SubTitle>동의 거부 권리 및 불이익</SubTitle>
                <Bullet>귀하는 개인정보 수집·이용에 대한 동의를 거부할 수 있습니다.</Bullet>
                <Bullet>
                  다만, 위 정보는 상담 진행에 필요한 필수정보이므로 동의하지 않을 경우 상담 신청 및
                  상담 서비스 제공이 어려울 수 있습니다.
                </Bullet>
              </DetailPanel>
            ) : null}
          </div>

          {/* 2. 맞춤 상담 */}
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <input
                id={ids.custom}
                type="checkbox"
                checked={value.custom_info_consent}
                onChange={(e) => onChange({ ...value, custom_info_consent: e.target.checked })}
                style={checkStyle(20)}
              />
              <label htmlFor={ids.custom} style={rowLabel}>
                [선택] 맞춤 상담 정보 활용 동의
              </label>
              <DetailToggle
                open={openDetail === "custom"}
                onToggle={() => toggleDetail("custom")}
                compact={compact}
              />
            </div>
            {openDetail === "custom" ? (
              <DetailPanel compact={compact}>
                <SectionTitle>2. [선택] 맞춤 상담 정보 활용 동의</SectionTitle>
                <div style={{ fontWeight: 700 }}>맞춤 상담을 위한 추가정보 수집·이용 동의</div>
                <div style={{ marginTop: 6 }}>
                  피드백(브랜드명 FEED LIFE)은 고객의 상황과 관심 분야를 반영한 맞춤 상담 및 상품
                  추천을 위해 다음과 같이 추가정보를 수집·이용합니다.
                </div>
                <SubTitle>수집·이용 목적</SubTitle>
                <Bullet>고객 상황에 맞는 상담 제공</Bullet>
                <Bullet>관심 분야에 따른 상품 및 서비스 추천</Bullet>
                <Bullet>희망 조건을 반영한 맞춤형 안내</Bullet>
                <Bullet>상담 및 추천 정확도 향상</Bullet>
                <SubTitle>수집·이용 항목</SubTitle>
                <Bullet>거주 지역</Bullet>
                <Bullet>연령대</Bullet>
                <Bullet>직업 또는 직업군</Bullet>
                <Bullet>관심 분야</Bullet>
                <Bullet>희망 예산</Bullet>
                <Bullet>선호 조건</Bullet>
                <SubTitle>보유·이용 기간</SubTitle>
                <Bullet>상담 종료일로부터 1년</Bullet>
                <Bullet>
                  별도의 마케팅 활용 동의가 있는 경우에는 해당 동의 유효기간 내 필요한 범위에서 이용
                  가능
                </Bullet>
                <SubTitle>동의 거부 권리 및 불이익</SubTitle>
                <Bullet>귀하는 본 동의를 거부할 수 있습니다.</Bullet>
                <Bullet>동의하지 않더라도 기본 상담 신청 및 서비스 이용에는 제한이 없습니다.</Bullet>
                <Bullet>다만, 맞춤형 상담 및 추천의 정확도가 낮아질 수 있습니다.</Bullet>
              </DetailPanel>
            ) : null}
          </div>

          {/* 3. 제휴상품 마케팅 */}
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <input
                id={ids.marketing}
                type="checkbox"
                checked={value.marketing_consent}
                onChange={(e) => onChange({ ...value, marketing_consent: e.target.checked })}
                style={checkStyle(20)}
              />
              <label htmlFor={ids.marketing} style={rowLabel}>
                [선택] 제휴상품 마케팅 활용 동의
              </label>
              <DetailToggle
                open={openDetail === "marketing"}
                onToggle={() => toggleDetail("marketing")}
                compact={compact}
              />
            </div>
            {openDetail === "marketing" ? (
              <DetailPanel compact={compact}>
                <SectionTitle>3. [선택] 제휴상품 마케팅 활용 동의</SectionTitle>
                <div style={{ fontWeight: 700 }}>
                  FEED LIFE 및 제휴상품 마케팅 목적 개인정보 이용 동의
                </div>
                <div style={{ marginTop: 6 }}>
                  피드백(브랜드명 FEED LIFE)은 고객에게 FEED LIFE 및 제휴사의 상품·서비스를 소개하고
                  맞춤형 혜택을 안내하기 위해 개인정보를 마케팅 목적으로 이용합니다.
                </div>
                <SubTitle>이용 목적</SubTitle>
                <Bullet>신규 상품 및 서비스 안내</Bullet>
                <Bullet>제휴상품 및 제휴서비스 소개·추천</Bullet>
                <Bullet>이벤트, 할인 및 프로모션 안내</Bullet>
                <Bullet>제휴상품 상담 및 추천</Bullet>
                <Bullet>고객 관심도 분석</Bullet>
                <Bullet>상담·신청 이력에 기반한 맞춤형 안내</Bullet>
                <SubTitle>이용 항목</SubTitle>
                <Bullet>성명</Bullet>
                <Bullet>휴대전화번호</Bullet>
                <Bullet>거주 지역</Bullet>
                <Bullet>연령대</Bullet>
                <Bullet>직업 또는 직업군</Bullet>
                <Bullet>관심 분야</Bullet>
                <Bullet>문의·상담·신청 이력</Bullet>
                <Bullet>광고 반응 이력</Bullet>
                <SubTitle>마케팅 대상 상품 및 서비스</SubTitle>
                <Bullet>상조</Bullet>
                <Bullet>여행·숙박</Bullet>
                <Bullet>모빌리티·렌터카</Bullet>
                <Bullet>가전·생활서비스</Bullet>
                <Bullet>건강·라이프케어</Bullet>
                <Bullet>교육</Bullet>
                <Bullet>통신</Bullet>
                <Bullet>쇼핑</Bullet>
                <Bullet>기타 생활 관련 FEED LIFE 및 제휴상품</Bullet>
                <SubTitle>마케팅 안내 주체</SubTitle>
                <Bullet>피드백(브랜드명 FEED LIFE)</Bullet>
                <Bullet>
                  제휴상품을 안내하는 경우 실제 제휴사의 회사명과 상품명을 밝힌 후 FEED LIFE가 직접
                  안내합니다.
                </Bullet>
                <SubTitle>제3자 제공 관련 안내</SubTitle>
                <Bullet>본 동의만으로 고객의 개인정보를 제휴사 또는 광고주에게 제공하지 않습니다.</Bullet>
                <Bullet>
                  제휴사 또는 광고주가 고객에게 직접 연락하기 위해 개인정보 제공이 필요한 경우에는
                  제공받는 회사명, 제공 목적, 제공 항목, 보유기간 등을 별도로 안내하고 개인정보
                  제3자 제공 동의를 받습니다.
                </Bullet>
                <SubTitle>보유·이용 기간</SubTitle>
                <Bullet>동의일로부터 5년 또는 동의 철회 시까지 중 먼저 도래하는 시점</Bullet>
                <SubTitle>동의 거부 및 철회</SubTitle>
                <Bullet>귀하는 본 동의를 거부하거나 언제든지 철회할 수 있습니다.</Bullet>
                <Bullet>동의를 거부하거나 철회하더라도 기본 상담 서비스 이용에는 제한이 없습니다.</Bullet>
              </DetailPanel>
            ) : null}
          </div>

          {/* 4. 광고성 정보 수신 */}
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <input
                id={`${ids.all}-ads`}
                type="checkbox"
                checked={
                  value.ad_phone_consent &&
                  value.ad_sms_consent &&
                  value.ad_kakao_consent &&
                  value.ad_email_consent
                }
                ref={(el) => {
                  if (!el) return;
                  const any =
                    value.ad_phone_consent ||
                    value.ad_sms_consent ||
                    value.ad_kakao_consent ||
                    value.ad_email_consent;
                  const all =
                    value.ad_phone_consent &&
                    value.ad_sms_consent &&
                    value.ad_kakao_consent &&
                    value.ad_email_consent;
                  el.indeterminate = any && !all;
                }}
                onChange={(e) => {
                  const next = e.target.checked;
                  onChange({
                    ...value,
                    ad_phone_consent: next,
                    ad_sms_consent: next,
                    ad_kakao_consent: next,
                    ad_email_consent: next,
                  });
                }}
                style={checkStyle(20)}
              />
              <label htmlFor={`${ids.all}-ads`} style={rowLabel}>
                [선택] 광고성 정보 수신 동의
              </label>
              <DetailToggle
                open={openDetail === "ads"}
                onToggle={() => toggleDetail("ads")}
                compact={compact}
              />
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: compact ? "8px 14px" : "10px 16px",
                alignItems: "center",
                paddingLeft: 30,
              }}
            >
              {(
                [
                  [ids.phone, "ad_phone_consent", "전화"] as const,
                  [ids.sms, "ad_sms_consent", "문자"] as const,
                  [ids.kakao, "ad_kakao_consent", "카카오톡"] as const,
                  [ids.email, "ad_email_consent", "이메일"] as const,
                ] as const
              ).map(([id, key, label]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={value[key]}
                    onChange={(e) => setChannel(key, e.target.checked)}
                    style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }}
                  />
                  <label htmlFor={id} style={channelLabel}>
                    {label}
                  </label>
                </div>
              ))}
            </div>
            {openDetail === "ads" ? (
              <DetailPanel compact={compact}>
                <SectionTitle>4. [선택] 광고성 정보 수신 동의</SectionTitle>
                <div style={{ fontWeight: 700 }}>광고성 정보 수신 동의</div>
                <div style={{ marginTop: 6 }}>
                  피드백(브랜드명 FEED LIFE)으로부터 FEED LIFE 및 제휴사의 상품·서비스, 이벤트, 할인
                  및 프로모션 등에 관한 광고성 정보를 수신하는 것에 동의합니다.
                </div>
                <SubTitle>광고성 정보 내용</SubTitle>
                <Bullet>FEED LIFE 상품 및 서비스 안내</Bullet>
                <Bullet>제휴상품 및 제휴서비스 안내</Bullet>
                <Bullet>신규 상품 안내</Bullet>
                <Bullet>이벤트 및 프로모션</Bullet>
                <Bullet>할인 및 혜택 정보</Bullet>
                <SubTitle>수신 채널</SubTitle>
                <Bullet>전화(TM)</Bullet>
                <Bullet>문자(SMS/LMS)</Bullet>
                <Bullet>카카오톡</Bullet>
                <Bullet>이메일</Bullet>
                <div style={{ marginTop: 6 }}>각 채널별로 개별 선택할 수 있습니다.</div>
                <SubTitle>유효 기간</SubTitle>
                <Bullet>동의일로부터 5년 또는 수신동의 철회 시까지</Bullet>
                <SubTitle>수신 동의 거부 및 철회</SubTitle>
                <Bullet>
                  광고성 정보 수신에 동의하지 않더라도 기본 상담 및 서비스 이용에는 제한이 없습니다.
                </Bullet>
                <Bullet>
                  수신 동의 후에도 상담원, 고객센터, 문자 수신거부, 카카오톡 채널 차단 등의 방법으로
                  언제든지 철회할 수 있습니다.
                </Bullet>
              </DetailPanel>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--text-secondary)",
              fontSize: compact ? 12 : 13,
              textDecoration: "underline",
            }}
          >
            전체 개인정보처리방침 보기
          </a>
        </div>
      </div>
    </div>
  );
}
