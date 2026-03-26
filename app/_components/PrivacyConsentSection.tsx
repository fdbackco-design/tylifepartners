"use client";

import { useId, useMemo, useState } from "react";

export default function PrivacyConsentSection({
  checked,
  onCheckedChange,
  compact = false,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  compact?: boolean;
}) {
  const autoId = useId();
  const [open, setOpen] = useState(false);

  const consentId = useMemo(() => `${autoId}-consent`, [autoId]);

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
            id={consentId}
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            style={{
              width: 22,
              height: 22,
              marginTop: 3,
              flexShrink: 0,
            }}
          />
          <label
            htmlFor={consentId}
            style={{
              fontSize: compact ? 14 : 16,
              lineHeight: 1.35,
              fontWeight: 600,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            개인정보 수집 및 이용에 동의합니다. (필수)
          </label>
        </div>

        <div style={{ marginTop: 10 }}>
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
              <div style={{ fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                TY Life Partners는 상담을 위해 아래와 같이 개인정보를 수집·이용합니다.
              </div>

              <div>수집 항목: 이름, 연락처</div>
              <div style={{ marginTop: 4 }}>이용 목적: 상담 안내 및 고객 응대</div>
              <div style={{ marginTop: 4 }}>
                보유 기간: 상담 목적 달성 시까지 (법령에 따른 보관 제외)
              </div>

              <div style={{ marginTop: 10 }}>
                회사는 개인정보를 외부에 제공하지 않으며, 법령 또는 이용자 동의가 있는 경우에만
                예외로 합니다.
              </div>
              <div style={{ marginTop: 8 }}>
                이용자는 언제든지 개인정보 열람·수정·삭제를 요청할 수 있습니다.
              </div>
              <div style={{ marginTop: 8 }}>문의: tylifepartners@gmail.com</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

