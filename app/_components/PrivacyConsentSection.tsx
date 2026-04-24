"use client";

import { useId, useMemo, useState } from "react";

export default function PrivacyConsentSection({
  requiredChecked,
  marketingChecked,
  onRequiredCheckedChange,
  onMarketingCheckedChange,
  compact = false,
}: {
  requiredChecked: boolean;
  marketingChecked: boolean;
  onRequiredCheckedChange: (next: boolean) => void;
  onMarketingCheckedChange: (next: boolean) => void;
  compact?: boolean;
}) {
  const autoId = useId();
  const [open, setOpen] = useState(false);

  const allId = useMemo(() => `${autoId}-all`, [autoId]);
  const requiredId = useMemo(() => `${autoId}-required`, [autoId]);
  const marketingId = useMemo(() => `${autoId}-marketing`, [autoId]);
  const allChecked = requiredChecked && marketingChecked;

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
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <input
            id={allId}
            type="checkbox"
            checked={allChecked}
            onChange={(e) => {
              const next = e.target.checked;
              onRequiredCheckedChange(next);
              onMarketingCheckedChange(next);
            }}
            style={{
              width: 22,
              height: 22,
              marginTop: 3,
              flexShrink: 0,
            }}
          />
          <label
            htmlFor={allId}
            style={{
              fontSize: compact ? 14 : 16,
              lineHeight: 1.35,
              fontWeight: 600,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            약관에 전체 동의합니다.
          </label>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <input
              id={requiredId}
              type="checkbox"
              checked={requiredChecked}
              onChange={(e) => onRequiredCheckedChange(e.target.checked)}
              style={{
                width: 20,
                height: 20,
                marginTop: 2,
                flexShrink: 0,
              }}
            />
            <label
              htmlFor={requiredId}
              style={{
                fontSize: compact ? 13 : 15,
                lineHeight: 1.35,
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              개인정보제공 동의서 (필수)
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <input
              id={marketingId}
              type="checkbox"
              checked={marketingChecked}
              onChange={(e) => onMarketingCheckedChange(e.target.checked)}
              style={{
                width: 20,
                height: 20,
                marginTop: 2,
                flexShrink: 0,
              }}
            />
            <label
              htmlFor={marketingId}
              style={{
                fontSize: compact ? 13 : 15,
                lineHeight: 1.35,
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              마케팅 활용을 위한 개인정보 제공 동의 (선택)
            </label>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-page)",
              color: "var(--text-secondary)",
              fontSize: 14,
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
            }}
            aria-expanded={open}
          >
            {open ? "닫기" : "자세히 보기"}
          </button>
        </div>

        {open && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 10px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: compact ? 12 : 14, lineHeight: 1.65, color: "var(--text-secondary)" }}>
              <div style={{ fontWeight: 800, color: "var(--text-secondary)", marginBottom: 8 }}>
                &lt;개인정보제공 동의서&gt;
              </div>

              <div>* 본 동의서는 티와이 라이프 파트너스가 개인정보처리자로서 수집 · 이용합니다.</div>
              <div style={{ marginTop: 10, fontWeight: 700 }}>1. 수집 · 이용에 관한 사항</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>수집 · 이용목적</div>
              <div style={{ marginTop: 4 }}>- 티와이 라이프 파트너스 채용 상담 진행 및 관련 안내 제공</div>
              <div style={{ marginTop: 2 }}>- 티와이 라이프 파트너스에 대한 채용 정보 및 지원 방법 등 안내 제공</div>
              <div style={{ marginTop: 2 }}>- 상담 후 추가적인 지원 안내 및 관련 서비스에 대한 안내 제공</div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>보유 및 이용기간</div>
              <div style={{ marginTop: 4 }}>- 보유기간은 동의일로부터 1년이며 이후에는 지체 없이 파기됩니다.</div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>거부 권리 및 불이익</div>
              <div style={{ marginTop: 4 }}>- 귀하는 아래 개인(신용)정보 수집, 이용에 관한 동의를 거부하실 수 있습니다.</div>
              <div style={{ marginTop: 2 }}>
                - 동의 거부 시 불이익은 없으나 티와이 라이프 파트너스의 채용상담 서비스는 제공되지 않습니다.
              </div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>2. 수집 · 이용항목</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>개인(신용) 정보</div>
              <div style={{ marginTop: 4 }}>
                - 일반 개인정보 : 성명, 거주지, 연령대, 전화번호, 상담 가능시간, 직업
              </div>
              <div style={{ marginTop: 2 }}>- 위 개인정보를 수집/이용 하는 것에 동의합니다.</div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>3. 제공받는 자</div>
              <div style={{ marginTop: 4 }}>- 태양라이프 주식회사</div>
              <div style={{ marginTop: 2 }}>: 상품 공급사, 고객 데이터 관리</div>
              <div style={{ marginTop: 4 }}>- 세일즈 파트너</div>
              <div style={{ marginTop: 2 }}>: 당사와 영업 권한 관련 위촉 계약 체결을 완료한 영업인</div>

              <div style={{ marginTop: 16, fontWeight: 800, color: "var(--text-secondary)" }}>
                &lt;마케팅 활용을 위한 개인정보 제공 동의&gt;
              </div>

              <div>*본 동의서는 티와이 라이프 파트너스가 개인정보처리자로서 수집·이용합니다.</div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>1. 수집 · 이용에 관한 사항</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>- 개인정보의 수집 및 이용 목적</div>
              <div style={{ marginTop: 4 }}>- ‘티와이 라이프 파트너스’ 채용 서비스 관련 정보 제공 및 안내</div>
              <div style={{ marginTop: 2 }}>- 채용 이벤트 및 프로모션 안내</div>
              <div style={{ marginTop: 2 }}>- 채용 시장 조사 및 서비스 품질 향상</div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>2. 수집·이용 항목</div>
              <div style={{ marginTop: 4 }}>성명, 거주지, 연령대, 성별, 전화번호, 직업</div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>개인정보의 보유 및 이용 기간</div>
              <div style={{ marginTop: 4 }}>
                본 동의서에 따라 수집된 개인정보는 수집일로부터 1년 간 보관되며, 목적 달성 후 안전하게 폐기됩니다.
              </div>

              <div style={{ marginTop: 10, fontWeight: 700 }}>동의 거부 권리 및 불이익</div>
              <div style={{ marginTop: 4 }}>
                귀하는 본 동의를 거부하실 수 있으며, 거부하신 경우에도 ‘티와이 라이프 파트너스’ 서비스 이용에는 제한이 없습니다.
              </div>
              <div style={{ marginTop: 2 }}>
                다만, 마케팅 정보 제공 등 부가 혜택 안내가 제한될 수 있습니다.
              </div>

              <div style={{ marginTop: 10 }}>위 개인정보를 수집/이용 하는 것에 동의합니다.</div>
              <div style={{ marginTop: 4 }}>
                채용 마케팅 광고성 정보(전화/문자/카카오톡/이메일) 수신에 동의합니다.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

