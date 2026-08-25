"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPhoneKorean } from "@/lib/phone";
import { REGION_ZONE_NAMES, isRegionZoneName } from "@/lib/crm/regionZones";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmDialog,
  CrmEmptyState,
  CrmField,
  CrmInput,
  CrmMenu,
  CrmMenuItem,
  CrmPageHeader,
  CrmSelect,
  CrmSheet,
  CrmStatRow,
  CrmTable,
  IconDots,
  IconPlus,
  IconSearch,
} from "@/app/admin/_components/crm/ui";

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
  account_status?: "active" | "invite_pending" | "inactive";
  last_login_at?: string | null;
  created_at?: string;
};

function isValidMobile(digits: string): boolean {
  return /^010\d{8}$/.test(digits);
}

function statusBadge(status: User["account_status"], isActive: boolean) {
  const key = status ?? (isActive ? "active" : "inactive");
  if (key === "inactive") return <CrmBadge tone="neutral">비활성</CrmBadge>;
  if (key === "invite_pending") return <CrmBadge tone="warning">비밀번호 미변경</CrmBadge>;
  return <CrmBadge tone="success">활성</CrmBadge>;
}

export default function AccountsPage() {
  const [items, setItems] = useState<User[]>([]);
  const [me, setMe] = useState<{ rank: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [rank, setRank] = useState("sales");
  const [parentId, setParentId] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filterRank, setFilterRank] = useState("all");
  const [filterParent, setFilterParent] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      const d = await res.json();
      if (!d.ok) {
        setError(d.message || "목록을 불러오지 못했습니다.");
        return;
      }
      setItems(d.items ?? []);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => d.ok && setMe(d.user));
    void load();
  }, []);

  const managers = items.filter((u) => u.rank === "manager" && u.is_active);
  const parentFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const u of items) {
      if (u.rank === "manager") byId.set(u.id, u.name);
      if (u.parent_id && u.parent_name) byId.set(u.parent_id, u.parent_name);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [items]);
  const regions = REGION_ZONE_NAMES;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((u) => {
      if (q) {
        const hay = `${u.name} ${u.phone} ${u.login_id}`.toLowerCase();
        if (!hay.includes(q) && !formatPhoneKorean(u.phone).includes(q)) return false;
      }
      if (filterRank !== "all" && u.rank !== filterRank) return false;
      if (filterParent === "none") {
        if (u.parent_id) return false;
      } else if (filterParent !== "all") {
        // 해당 매니저 본인 + 산하 영업자
        if (u.id !== filterParent && u.parent_id !== filterParent) return false;
      }
      if (filterRegion !== "all" && (u.region || "") !== filterRegion) return false;
      const status = u.account_status ?? (u.is_active ? "active" : "inactive");
      if (filterStatus !== "all" && status !== filterStatus) return false;
      return true;
    });
  }, [items, search, filterRank, filterParent, filterRegion, filterStatus]);

  const stats = {
    total: items.length,
    managers: items.filter((u) => u.rank === "manager").length,
    sales: items.filter((u) => u.rank === "sales").length,
  };

  const openCreate = () => {
    setEditUser(null);
    setName("");
    setPhone("");
    setRegion("");
    setRank(me?.rank === "manager" ? "sales" : "sales");
    setParentId(me?.rank === "manager" ? "" : "");
    setFormError("");
    setSheetOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setName(u.name);
    setPhone(formatPhoneKorean(u.phone));
    setRegion(u.region || "");
    setRank(u.rank);
    setParentId(u.parent_id || "");
    setFormError("");
    setSheetOpen(true);
  };

  const phoneDigits = phone.replace(/\D/g, "");

  const submit = async () => {
    setFormError("");
    if (!name.trim()) {
      setFormError("이름을 입력해 주세요.");
      return;
    }
    if (!isValidMobile(phoneDigits)) {
      setFormError("휴대폰번호는 010-0000-0000 형식이어야 합니다.");
      return;
    }
    setSaving(true);
    try {
      if (editUser) {
        const nextRank = me?.rank === "admin" ? rank : editUser.rank;
        const res = await fetch(`/api/admin/users/${editUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            region: region.trim() || null,
            ...(me?.rank === "admin" ? { rank: nextRank } : {}),
            parent_id: nextRank === "sales" ? parentId || null : null,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setFormError(data.message || "수정에 실패했습니다.");
          return;
        }
        setToast("계정 정보가 저장되었습니다.");
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            phone: phoneDigits,
            region: region.trim() || null,
            rank: me?.rank === "manager" ? "sales" : rank,
            parent_id: parentId || null,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setFormError(data.message || "생성에 실패했습니다.");
          return;
        }
        setToast(data.message || "계정이 생성되었습니다.");
      }
      setSheetOpen(false);
      await load();
    } catch {
      setFormError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (u: User) => {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset_password: true }),
    });
    const data = await res.json();
    if (!data.ok) {
      setToast(data.message || "비밀번호 초기화에 실패했습니다.");
      return;
    }
    setToast("비밀번호가 초기 비밀번호로 재설정되었습니다.");
    await load();
  };

  const toggleActive = async (u: User) => {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    const data = await res.json();
    if (!data.ok) {
      setToast(data.message || "상태 변경에 실패했습니다.");
      return;
    }
    setToast(u.is_active ? "계정을 비활성화했습니다." : "계정을 활성화했습니다.");
    setConfirmUser(null);
    await load();
  };

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="계정 관리"
        description="매니저·영업자 계정을 발급하고 상태를 관리합니다."
        actions={
          <CrmButton variant="primary" onClick={openCreate}>
            <IconPlus /> 계정 추가
          </CrmButton>
        }
        meta={
          <CrmStatRow
            items={[
              { label: "전체 계정", value: stats.total },
              { label: "매니저", value: stats.managers },
              { label: "영업자", value: stats.sales },
            ]}
          />
        }
      />

      {toast ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone="success">{toast}</CrmAlert>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone="danger">{error}</CrmAlert>
        </div>
      ) : null}

      <div className="crm-ui-toolbar">
        <div className="crm-ui-search">
          <span className="crm-ui-search-icon">
            <IconSearch />
          </span>
          <CrmInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 전화번호 검색"
            aria-label="이름 또는 전화번호 검색"
          />
        </div>
        <CrmSelect value={filterRank} onChange={(e) => setFilterRank(e.target.value)} aria-label="직급 필터" style={{ width: 140 }}>
          <option value="all">직급 전체</option>
          <option value="manager">매니저</option>
          <option value="sales">영업자</option>
        </CrmSelect>
        <CrmSelect value={filterParent} onChange={(e) => setFilterParent(e.target.value)} aria-label="소속 필터" style={{ width: 160 }}>
          <option value="all">소속 전체</option>
          <option value="none">소속 없음</option>
          {parentFilterOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </CrmSelect>
        <CrmSelect value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} aria-label="권역 필터" style={{ width: 140 }}>
          <option value="all">권역 전체</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </CrmSelect>
        <CrmSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="상태 필터" style={{ width: 140 }}>
          <option value="all">상태 전체</option>
          <option value="active">활성</option>
          <option value="invite_pending">비밀번호 미변경</option>
          <option value="inactive">비활성</option>
        </CrmSelect>
      </div>

      {loading ? (
        <div className="crm-skeleton" style={{ height: 220 }} />
      ) : items.length === 0 ? (
        <CrmEmptyState
          title="아직 계정이 없습니다"
          description="첫 매니저 또는 영업자 계정을 발급해 상담 배정을 시작하세요."
          action={
            <CrmButton variant="primary" onClick={openCreate}>
              <IconPlus /> 첫 계정 추가
            </CrmButton>
          }
        />
      ) : filtered.length === 0 ? (
        <CrmEmptyState title="검색 결과가 없습니다" description="필터나 검색어를 바꿔 보세요." />
      ) : (
        <CrmTable>
          <thead>
            <tr>
              <th>이름</th>
              <th>직급</th>
              <th>아이디</th>
              <th>연락처</th>
              <th>담당 권역</th>
              <th>소속</th>
              <th>계정상태</th>
              <th>최근 로그인</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }} className="crm-cell-nowrap">{u.name}</td>
                <td className="crm-cell-nowrap">{u.rank === "manager" ? "매니저" : "영업자"}</td>
                <td className="crm-cell-nowrap">{u.login_id}</td>
                <td className="crm-cell-nowrap">{formatPhoneKorean(u.phone)}</td>
                <td>
                  {u.region && isRegionZoneName(u.region) ? (
                    <CrmBadge tone="primary">{u.region}</CrmBadge>
                  ) : u.region ? (
                    <CrmBadge tone="neutral">{u.region}</CrmBadge>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{u.parent_name || "—"}</td>
                <td>{statusBadge(u.account_status, u.is_active)}</td>
                <td style={{ color: "var(--crm-muted)" }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString("ko-KR") : "—"}</td>
                <td>
                  <CrmMenu trigger={<IconDots />} align="right">
                    <CrmMenuItem onClick={() => openEdit(u)}>수정</CrmMenuItem>
                    <CrmMenuItem onClick={() => void resetPassword(u)}>비밀번호 초기화</CrmMenuItem>
                    <CrmMenuItem
                      tone="danger"
                      onClick={() => {
                        if (u.is_active) setConfirmUser(u);
                        else void toggleActive(u);
                      }}
                    >
                      {u.is_active ? "비활성화" : "활성화"}
                    </CrmMenuItem>
                  </CrmMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </CrmTable>
      )}

      <CrmSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editUser ? "계정 수정" : "계정 추가"}
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setSheetOpen(false)}>
              취소
            </CrmButton>
            <CrmButton variant="primary" disabled={saving} onClick={() => void submit()}>
              {saving ? "저장 중…" : editUser ? "저장" : "계정 생성"}
            </CrmButton>
          </>
        }
      >
        <CrmField label="이름" htmlFor="acc-name">
          <CrmInput id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
        </CrmField>
        <CrmField
          label="전화번호"
          htmlFor="acc-phone"
          hint="010으로 시작하는 11자리 번호"
          error={phone && !isValidMobile(phoneDigits) ? "형식이 올바르지 않습니다." : undefined}
        >
          <CrmInput
            id="acc-phone"
            value={phone}
            disabled={!!editUser}
            onChange={(e) => setPhone(formatPhoneKorean(e.target.value))}
            placeholder="010-0000-0000"
            inputMode="numeric"
          />
        </CrmField>
        {me?.rank === "admin" && (
          <CrmField
            label="직급"
            htmlFor="acc-rank"
            hint={
              editUser?.rank === "manager" && rank === "sales"
                ? "매니저 → 영업자로 바꾸면 기존 산하 영업자의 소속이 해제됩니다."
                : undefined
            }
          >
            <CrmSelect
              id="acc-rank"
              value={rank}
              onChange={(e) => {
                const next = e.target.value;
                setRank(next);
                if (next === "manager") setParentId("");
              }}
            >
              <option value="manager">매니저</option>
              <option value="sales">영업자</option>
            </CrmSelect>
          </CrmField>
        )}
        <CrmField
          label="담당 권역"
          htmlFor="acc-region"
          hint="영업자·매니저 모두 권역 목록에서 선택할 수 있습니다. 자동 배정 시 해당 권역 우선 배정에 사용됩니다."
        >
          <CrmSelect id="acc-region" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">권역 선택 (선택 사항)</option>
            {REGION_ZONE_NAMES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </CrmSelect>
        </CrmField>
        {me?.rank === "admin" && rank === "sales" && (
          <CrmField label="소속 매니저" htmlFor="acc-parent" hint="영업자가 소속될 매니저를 선택합니다.">
            <CrmSelect id="acc-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">소속 매니저 없음</option>
              {managers
                .filter((m) => m.id !== editUser?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </CrmSelect>
          </CrmField>
        )}
        {!editUser && (
          <CrmAlert tone="info">
            초기 아이디/비밀번호는 휴대폰번호에서 010을 뺀 8자리입니다. 최초 로그인 후 비밀번호를 변경하도록 안내해 주세요.
          </CrmAlert>
        )}
        {formError ? <CrmAlert tone="danger">{formError}</CrmAlert> : null}
      </CrmSheet>

      <CrmDialog
        open={!!confirmUser}
        onClose={() => setConfirmUser(null)}
        title="계정 비활성화"
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setConfirmUser(null)}>
              취소
            </CrmButton>
            <CrmButton variant="danger" onClick={() => confirmUser && void toggleActive(confirmUser)}>
              비활성화
            </CrmButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          <strong>{confirmUser?.name}</strong> 계정을 비활성화할까요? 로그인할 수 없게 되며, 배정된 고객 데이터는 유지됩니다.
        </p>
      </CrmDialog>
    </div>
  );
}
