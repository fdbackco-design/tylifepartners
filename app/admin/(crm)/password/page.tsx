"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CrmAlert,
  CrmButton,
  CrmField,
  CrmInput,
  CrmPageHeader,
} from "@/app/admin/_components/crm/ui";

export default function PasswordChangePage() {
  const [loginId, setLoginId] = useState("");
  const [isEnvAdmin, setIsEnvAdmin] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setLoginId(String(d.user?.loginId ?? ""));
        setIsEnvAdmin(!d.user?.userId);
      })
      .finally(() => setReady(true));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 6) {
      setError("새 비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "비밀번호 변경에 실패했습니다.");
        return;
      }
      setSuccess(data.message || "비밀번호가 변경되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <div className="crm-skeleton" style={{ height: 220 }} />;
  }

  return (
    <div className="crm-ui-content" style={{ maxWidth: 520 }}>
      <CrmPageHeader
        title="비밀번호 변경"
        description="초기 발급 비밀번호를 본인만 아는 비밀번호로 바꿔 주세요."
      />

      {isEnvAdmin ? (
        <CrmAlert tone="warning">
          환경변수(ADMIN_ID)로 로그인한 관리자 계정은 이 화면에서 비밀번호를 변경할 수 없습니다. 배포
          설정의 <code>ADMIN_PASSWORD</code>를 변경해 주세요. 계정 관리에서 발급한 관리자 계정은 이
          화면에서 변경할 수 있습니다.
        </CrmAlert>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 14 }}>
          {loginId ? (
            <CrmField label="로그인 아이디">
              <CrmInput value={loginId} disabled readOnly aria-label="로그인 아이디" />
            </CrmField>
          ) : null}

          <CrmField label="현재 비밀번호" htmlFor="pw-current">
            <CrmInput
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </CrmField>

          <CrmField
            label="새 비밀번호"
            htmlFor="pw-new"
            hint="6자 이상, 초기 비밀번호(휴대폰 뒤 8자리)와 달라야 합니다."
          >
            <CrmInput
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </CrmField>

          <CrmField label="새 비밀번호 확인" htmlFor="pw-confirm">
            <CrmInput
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </CrmField>

          {error ? <CrmAlert tone="danger">{error}</CrmAlert> : null}
          {success ? <CrmAlert tone="success">{success}</CrmAlert> : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <CrmButton type="submit" variant="primary" disabled={saving}>
              {saving ? "변경 중…" : "비밀번호 변경"}
            </CrmButton>
          </div>
        </form>
      )}
    </div>
  );
}
