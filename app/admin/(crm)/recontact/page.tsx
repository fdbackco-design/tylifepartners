"use client";
import LeadList from "@/app/admin/_components/LeadList";

export default function RecontactPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>재컨택 필요</h1>
      <p style={{ color: "var(--text-secondary)" }}>상담완료 후 7일이 지나 다시 연락이 필요한 고객입니다. 담당자를 바꿔 재배정할 수 있습니다.</p>
      <LeadList category="all" recontact />
    </div>
  );
}
