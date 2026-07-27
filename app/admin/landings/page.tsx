"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ManagedLandingRow } from "@/lib/managedLandings/types";

export default function AdminLandingsListPage() {
  const [items, setItems] = useState<ManagedLandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newTitle, setNewTitle] = useState("상담 안내");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/landings");
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "불러오기 실패");
        return;
      }
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/landings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath, title: newTitle, published: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "생성 실패");
        return;
      }
      window.location.href = `/admin/landings/${json.item.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 랜딩을 삭제할까요?")) return;
    const res = await fetch(`/api/admin/landings/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.message || "삭제 실패");
      return;
    }
    void load();
  };

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>랜딩페이지 관리</h1>
        <Link href="/admin" style={{ fontSize: 14 }}>
          ← 관리자 홈
        </Link>
      </div>

      <section
        style={{
          marginTop: 20,
          padding: 16,
          border: "1px solid var(--border, #dee2e6)",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>새 랜딩 만들기</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="경로 예: /promo-a"
            style={{ flex: "1 1 160px", padding: "10px 12px", fontSize: 14 }}
          />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="제목"
            style={{ flex: "1 1 160px", padding: "10px 12px", fontSize: 14 }}
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating || !newPath.trim()}
            style={{
              padding: "10px 16px",
              background: "var(--cta-bg, #f76707)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {creating ? "생성 중…" : "생성"}
          </button>
        </div>
      </section>

      {error && (
        <p style={{ color: "#c92a2a", marginTop: 12, fontSize: 14 }}>{error}</p>
      )}

      <section style={{ marginTop: 24 }}>
        {loading ? (
          <p>불러오는 중…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "#868e96" }}>생성된 랜딩이 없습니다.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {items.map((it) => (
              <li
                key={it.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: 14,
                  border: "1px solid #e9ecef",
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {it.title}{" "}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: it.published ? "#2b8a3e" : "#868e96",
                      }}
                    >
                      {it.published ? "공개" : "비공개"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#495057", marginTop: 4 }}>
                    경로: {it.path}
                    {it.custom_host ? ` · 호스트: ${it.custom_host}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Link href={`/admin/landings/${it.id}`} style={{ fontSize: 14, fontWeight: 600 }}>
                    편집
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(it.id)}
                    style={{
                      fontSize: 13,
                      border: "none",
                      background: "transparent",
                      color: "#c92a2a",
                      cursor: "pointer",
                    }}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
