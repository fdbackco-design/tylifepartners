"use client";

import { useState } from "react";

type Props = {
  leadId: string;
  customerName: string;
  phone: string;
};

type AssignState = {
  managerName: string;
  loading: boolean;
  assignmentMsg: string | null;
  syncMsg: string | null;
  syncError: boolean;
  eventId: string | null;
};

export default function HqManagerAssignControl({ customerName, phone }: Props) {
  const [state, setState] = useState<AssignState>({
    managerName: "",
    loading: false,
    assignmentMsg: null,
    syncMsg: null,
    syncError: false,
    eventId: null,
  });

  const assign = async () => {
    if (state.loading) return;
    setState((s) => ({
      ...s,
      loading: true,
      assignmentMsg: null,
      syncMsg: null,
      syncError: false,
    }));

    try {
      const res = await fetch("/api/admin/hq-manager/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newManagerName: state.managerName,
          customerName,
          phone,
        }),
      });
      const data = await res.json();

      if (!data.ok && !data.assignmentComplete) {
        setState((s) => ({
          ...s,
          loading: false,
          assignmentMsg: data.message || "담당자 배정 실패",
          syncMsg: null,
          syncError: true,
        }));
        return;
      }

      setState((s) => ({
        ...s,
        loading: false,
        eventId: data.eventId ?? null,
        assignmentMsg: data.assignmentComplete ? "담당자 배정 완료" : null,
        syncMsg: data.syncComplete
          ? "담당자 시트 동기화 완료"
          : data.assignmentComplete
            ? "담당자 시트 동기화 실패"
            : null,
        syncError: Boolean(data.assignmentComplete && !data.syncComplete),
      }));
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        assignmentMsg: "네트워크 오류",
        syncError: true,
      }));
    }
  };

  const retrySync = async () => {
    if (!state.eventId || state.loading) return;
    setState((s) => ({ ...s, loading: true, syncMsg: null }));

    try {
      const res = await fetch("/api/admin/hq-manager-sync/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: state.eventId }),
      });
      const data = await res.json();

      setState((s) => ({
        ...s,
        loading: false,
        syncMsg: data.syncComplete ? "담당자 시트 동기화 완료" : "담당자 시트 동기화 실패",
        syncError: !data.syncComplete,
      }));
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        syncMsg: "동기화 재시도 네트워크 오류",
        syncError: true,
      }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          type="text"
          value={state.managerName}
          onChange={(e) => setState((s) => ({ ...s, managerName: e.target.value }))}
          placeholder="담당자명"
          disabled={state.loading}
          style={{
            flex: 1,
            minWidth: 90,
            padding: "6px 8px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={assign}
          disabled={state.loading || !state.managerName.trim()}
          style={{
            padding: "6px 10px",
            background: state.loading || !state.managerName.trim() ? "#adb5bd" : "#495057",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: state.loading || !state.managerName.trim() ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {state.loading ? "처리중" : "담당자 배정"}
        </button>
      </div>
      {state.assignmentMsg && (
        <span style={{ fontSize: 12, color: state.syncError && !state.syncMsg ? "#e03131" : "#37b24d" }}>
          {state.assignmentMsg}
        </span>
      )}
      {state.syncMsg && (
        <span style={{ fontSize: 12, color: state.syncError ? "#e03131" : "#37b24d" }}>{state.syncMsg}</span>
      )}
      {state.syncError && state.eventId && (
        <button
          type="button"
          onClick={retrySync}
          disabled={state.loading}
          style={{
            alignSelf: "flex-start",
            padding: "4px 8px",
            fontSize: 11,
            border: "1px solid #ffc9c9",
            borderRadius: 4,
            background: "#fff",
            color: "#c92a2a",
            cursor: state.loading ? "default" : "pointer",
          }}
        >
          동기화 재시도
        </button>
      )}
    </div>
  );
}
