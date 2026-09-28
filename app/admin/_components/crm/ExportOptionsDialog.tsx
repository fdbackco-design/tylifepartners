"use client";

import { useState } from "react";
import { CrmButton, CrmDialog } from "@/app/admin/_components/crm/ui";

const CLOSED_STATUS_LABEL = "거절, 수신거부, 번호오류, 계약완료, 가입완료";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onExport: (input: { excludeClosed: boolean; phonesText: string; file: File | null }) => Promise<void>;
};

export default function ExportOptionsDialog({ open, title = "내보내기", onClose, onExport }: Props) {
  const [excludeClosed, setExcludeClosed] = useState(false);
  const [phonesText, setPhonesText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await onExport({ excludeClosed, phonesText, file });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrmDialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      footer={
        <>
          <CrmButton variant="ghost" disabled={busy} onClick={onClose}>
            취소
          </CrmButton>
          <CrmButton variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "받는 중…" : "내려받기"}
          </CrmButton>
        </>
      }
    >
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45 }}>
        <input
          type="checkbox"
          checked={excludeClosed}
          onChange={(e) => setExcludeClosed(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>상담상태가 {CLOSED_STATUS_LABEL}가 아닌 연락처만</span>
      </label>
      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: "var(--crm-muted)" }}>
        제외할 전화번호
      </div>
      <textarea
        className="crm-input"
        value={phonesText}
        onChange={(e) => setPhonesText(e.target.value)}
        placeholder="쉼표(,) 또는 줄바꿈으로 구분해 붙여넣기"
        rows={5}
        style={{ marginTop: 6, width: "100%", resize: "vertical", minHeight: 96 }}
        aria-label="제외할 전화번호"
      />
      <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "var(--crm-muted)" }}>
        엑셀로 제외 번호
      </div>
      <input
        type="file"
        accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ marginTop: 6, fontSize: 13 }}
        aria-label="제외 전화번호 엑셀"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {error ? (
        <div role="alert" style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>
          {error}
        </div>
      ) : null}
    </CrmDialog>
  );
}

export async function downloadExport(url: string, body: FormData, fallbackName: string) {
  const res = await fetch(url, { method: "POST", body });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || type.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || "다운로드 중 오류가 발생했습니다.");
  }
  const blob = await res.blob();
  const matched = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "");
  const name = matched?.[1] || fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
