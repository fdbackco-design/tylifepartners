"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  name: string;
  phone: string;
  region: string | null;
  rank: string;
  login_id: string;
  parent_id: string | null;
  parent_name: string | null;
  is_active: boolean;
};

export default function AccountsPage() {
  const [items, setItems] = useState<User[]>([]);
  const [me, setMe] = useState<{ rank: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [rank, setRank] = useState("sales");
  const [parentId, setParentId] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => d.ok && setItems(d.items ?? []));
  };

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => d.ok && setMe(d.user));
    load();
  }, []);

  const create = async () => {
    setMessage("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, region, rank: me?.rank === "manager" ? "sales" : rank, parent_id: parentId || null }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.message || "생성 실패");
      return;
    }
    setMessage(data.message || "계정이 만들어졌습니다.");
    setName("");
    setPhone("");
    setRegion("");
    load();
  };

  const managers = items.filter((u) => u.rank === "manager");

  return (
    <div>
      <h1 className="crm-page-title">계정 발급</h1>
      <p className="crm-page-desc">
        초기 아이디/비밀번호는 휴대폰번호에서 010을 뺀 8자리입니다. 매니저는 하위 영업자만 발급할 수 있습니다.
      </p>
      <div style={{ display: "grid", gap: 8, maxWidth: 420, marginBottom: 24 }}>
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="휴대폰번호" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input placeholder="지역" value={region} onChange={(e) => setRegion(e.target.value)} />
        {me?.rank === "admin" && (
          <>
            <select value={rank} onChange={(e) => setRank(e.target.value)}>
              <option value="manager">매니저</option>
              <option value="sales">영업자</option>
            </select>
            {rank === "sales" && (
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">소속 매니저 없음</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <button type="button" onClick={() => void create()} style={{ background: "var(--cta-bg)", color: "#fff", border: 0, borderRadius: 8, padding: 10, fontWeight: 700 }}>
          {me?.rank === "manager" ? "하위 영업자 발급" : "계정 생성"}
        </button>
        {message && <div>{message}</div>}
      </div>
      <div className="crm-table-wrap">
        <table className="crm-table" style={{ minWidth: 800 }}>
          <thead>
            <tr>
              <th>이름</th>
              <th>직급</th>
              <th>아이디</th>
              <th>연락처</th>
              <th>지역</th>
              <th>소속</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.rank === "manager" ? "매니저" : "영업자"}</td>
                <td>{u.login_id}</td>
                <td>{u.phone}</td>
                <td>{u.region}</td>
                <td>{u.parent_name}</td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      fetch(`/api/admin/users/${u.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ is_active: !u.is_active }),
                      }).then(load)
                    }
                  >
                    {u.is_active ? "활성" : "중지"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
